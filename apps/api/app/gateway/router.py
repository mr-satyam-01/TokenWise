import time
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict
from fastapi import APIRouter, Depends, Header, Request, Response, status
from fastapi.responses import JSONResponse

from app.api.deps import get_gateway_context, GatewayContext
from app.core.config import settings
from app.providers.openrouter import openrouter_provider
from app.providers.openai import openai_provider
from app.schemas import ChatCompletionRequest
from app.services.pricing import pricing_service
from app.services.telemetry import telemetry_service

router = APIRouter(tags=["Gateway"])


def _resolve_provider(model: str, explicit_key: Optional[str] = None):
    """
    Determines which provider and API key to use.
    OpenRouter is the primary provider, supporting all models.
    Falls back to direct OpenAI if x-provider-api-key is set and model is a raw OpenAI model.
    """
    # If OpenRouter key is configured, use it as the default
    if settings.OPENROUTER_API_KEY:
        return (
            openrouter_provider,
            settings.OPENROUTER_API_KEY,
            settings.OPENROUTER_BASE_URL,
            "openrouter",
        )

    # If explicit key is passed via header, use OpenAI-compatible direct routing
    if explicit_key:
        return (
            openai_provider,
            explicit_key,
            settings.OPENAI_API_BASE,
            "openai",
        )

    # Fallback to OpenAI API key in settings
    if settings.OPENAI_API_KEY:
        return (
            openai_provider,
            settings.OPENAI_API_KEY,
            settings.OPENAI_API_BASE,
            "openai",
        )

    return None, None, None, None


@router.post("/v1/chat/completions")
@router.post("/chat/completions")
async def gateway_chat_completions(
    raw_request: Request,
    chat_request: ChatCompletionRequest,
    context: GatewayContext = Depends(get_gateway_context),
    x_provider_api_key: Optional[str] = Header(None),
    x_tw_session_id: Optional[str] = Header(None),
    x_tw_user_id: Optional[str] = Header(None),
    x_tw_prompt_name: Optional[str] = Header(None),
    x_tw_prompt_version: Optional[str] = Header(None),
):
    """
    OpenAI-compatible Chat Completions Gateway Proxy.
    Routes through OpenRouter (primary) or direct provider.
    Intercepts telemetry, calculates usage & pricing, decouples telemetry ingestion.
    """
    request_id = f"tw-req-{uuid.uuid4().hex[:16]}"
    start_time = time.perf_counter()
    started_at = datetime.now(timezone.utc)

    # Extract custom properties from x-tw-property-* headers
    custom_properties: Dict[str, str] = {}
    for header_name, header_value in raw_request.headers.items():
        if header_name.lower().startswith("x-tw-property-"):
            prop_key = header_name[14:].strip().lower()
            custom_properties[prop_key] = header_value

    payload = chat_request.model_dump(exclude_none=True)

    # Resolve upstream provider
    provider, api_key, api_base, provider_name = _resolve_provider(
        chat_request.model, x_provider_api_key
    )

    if not provider or not api_key:
        if settings.ENVIRONMENT == "development":
            provider_name = "simulated"
            prompt_text = " ".join(
                (m.get("content", "") if isinstance(m, dict) else getattr(m, "content", ""))
                for m in payload.get("messages", [])
            )
            sim_input_tokens = max(10, len(prompt_text.split()) * 2)
            sim_output_tokens = 36
            sim_total_tokens = sim_input_tokens + sim_output_tokens
            response_data = {
                "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": chat_request.model,
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": (
                                f"[TokenWise Dev Gateway Simulated Response for {chat_request.model}]: "
                                f"Processed {len(payload.get('messages', []))} message(s) through TokenWise proxy successfully. "
                                f"To route to live OpenRouter LLMs, configure OPENROUTER_API_KEY in your server environment."
                            ),
                        },
                        "finish_reason": "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": sim_input_tokens,
                    "completion_tokens": sim_output_tokens,
                    "total_tokens": sim_total_tokens,
                },
            }
            status_code = 200
            response_headers = {}
        else:
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            telemetry_event = {
                "request_id": request_id,
                "organization_id": context.organization.id,
                "application_id": context.application.id,
                "api_key_id": context.api_key.id,
                "provider": "none",
                "model": chat_request.model,
                "resolved_model": None,
                "is_streaming": False,
                "user_id": x_tw_user_id or chat_request.user,
                "session_id": x_tw_session_id,
                "prompt_name": x_tw_prompt_name,
                "prompt_version": x_tw_prompt_version,
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "cached_input_tokens": 0,
                "reasoning_tokens": 0,
                "estimated_cost": 0.0,
                "provider_reported_cost": None,
                "cost_status": "error",
                "pricing_version_id": None,
                "latency_ms": latency_ms,
                "status": "error",
                "error_type": "missing_provider_api_key",
                "started_at": started_at.isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "content_capture_enabled": context.application.content_capture_enabled,
                "input_content": json.dumps(payload.get("messages", [])),
                "output_content": json.dumps({"error": "missing_provider_api_key"}),
                "properties": custom_properties,
            }
            await telemetry_service.enqueue(telemetry_event)
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "error": {
                        "message": (
                            "No upstream provider API key configured. "
                            "Set OPENROUTER_API_KEY in your server environment, "
                            "or pass 'x-provider-api-key' header."
                        ),
                        "type": "invalid_request_error",
                        "code": "missing_provider_api_key",
                    }
                },
            )
    else:
        # Build and send upstream request
        timeout = settings.OPENROUTER_TIMEOUT_SECONDS if provider_name == "openrouter" else 60.0
        status_code, response_data, response_headers = await provider.chat_completion(
            request_data=payload,
            api_key=api_key,
            api_base=api_base,
            timeout=timeout,
        )

    latency_ms = (time.perf_counter() - start_time) * 1000.0
    completed_at = datetime.now(timezone.utc)

    # Telemetry normalization
    is_success = 200 <= status_code < 300
    input_tokens, output_tokens, total_tokens = 0, 0, 0
    cached_input_tokens, reasoning_tokens = 0, 0
    error_type = None
    resolved_model = None
    provider_cost = None

    if is_success:
        if provider_name == "openrouter":
            usage = openrouter_provider.extract_usage(response_data)
            input_tokens = usage["input_tokens"]
            output_tokens = usage["output_tokens"]
            total_tokens = usage["total_tokens"]
            cached_input_tokens = usage["cached_input_tokens"]
            reasoning_tokens = usage["reasoning_tokens"]
            provider_cost = usage["provider_cost"]
            resolved_model = openrouter_provider.extract_resolved_model(response_data)
        else:
            input_tokens, output_tokens, total_tokens = openai_provider.extract_usage(response_data)
    else:
        error_type, _ = provider.extract_error(status_code, response_data)

    # Calculate cost using dynamic DB pricing (with fallback)
    estimated_cost, pricing_version_id, cost_status = await pricing_service.calculate_cost_from_db(
        model=chat_request.model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cached_tokens=cached_input_tokens,
        reasoning_tokens=reasoning_tokens,
    )

    # If provider reported a cost, prefer it
    if provider_cost is not None and provider_cost > 0:
        estimated_cost = provider_cost
        cost_status = "provider_reported"

    # Build telemetry event payload
    telemetry_event = {
        "request_id": response_data.get("id") or request_id,
        "organization_id": context.organization.id,
        "application_id": context.application.id,
        "api_key_id": context.api_key.id,
        "provider": provider_name,
        "model": chat_request.model,
        "resolved_model": resolved_model,
        "is_streaming": bool(payload.get("stream")),
        "user_id": x_tw_user_id or chat_request.user,
        "session_id": x_tw_session_id,
        "prompt_name": x_tw_prompt_name,
        "prompt_version": x_tw_prompt_version,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "cached_input_tokens": cached_input_tokens,
        "reasoning_tokens": reasoning_tokens,
        "estimated_cost": estimated_cost,
        "provider_reported_cost": provider_cost,
        "cost_status": cost_status,
        "pricing_version_id": pricing_version_id,
        "latency_ms": latency_ms,
        "status": "success" if is_success else "error",
        "error_type": error_type,
        "started_at": started_at.isoformat(),
        "completed_at": completed_at.isoformat(),
        "content_capture_enabled": context.application.content_capture_enabled,
        "input_content": (
            json.dumps(payload.get("messages", []))
            if context.application.content_capture_enabled
            else None
        ),
        "output_content": (
            json.dumps(response_data.get("choices", []))
            if (context.application.content_capture_enabled and is_success)
            else json.dumps(response_data)
        ),
        "properties": custom_properties,
    }

    # Asynchronously enqueue telemetry
    await telemetry_service.enqueue(telemetry_event)

    # Return upstream response with telemetry correlation headers
    return JSONResponse(
        status_code=status_code,
        content=response_data,
        headers={
            "x-tokenwise-request-id": telemetry_event["request_id"],
            "x-tokenwise-latency-ms": f"{latency_ms:.1f}",
            "x-tokenwise-cost-usd": f"{estimated_cost:.6f}",
            "x-tokenwise-provider": provider_name,
            "x-tokenwise-model": chat_request.model,
        },
    )
