import time
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_organization
from app.core.config import settings
from app.db.session import get_db
from app.models import Organization
from app.providers.openrouter import openrouter_provider
from app.providers.openai import openai_provider
from app.schemas import PlaygroundRunRequest, PlaygroundRunResponse
from app.services.pricing import pricing_service

router = APIRouter(prefix="/playground", tags=["Playground"])


@router.post("/run", response_model=PlaygroundRunResponse)
async def run_playground_test(
    request: PlaygroundRunRequest,
    current_org: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db)
):
    """
    Executes a test LLM prompt through OpenRouter (primary) or direct provider.
    Calculates execution latency, token counts, and cost.
    """
    # Determine provider and key
    if settings.OPENROUTER_API_KEY:
        provider = openrouter_provider
        api_key = settings.OPENROUTER_API_KEY
        api_base = settings.OPENROUTER_BASE_URL
        timeout = settings.OPENROUTER_TIMEOUT_SECONDS
    elif request.provider_api_key or settings.OPENAI_API_KEY:
        provider = openai_provider
        api_key = request.provider_api_key or settings.OPENAI_API_KEY
        api_base = settings.OPENAI_API_BASE
        timeout = 60.0
    else:
        # Simulated fallback when no API key is configured
        start_time = time.perf_counter()
        simulated_output = (
            f"[TokenWise Playground Preview]\n\n"
            f"Successfully processed test run with model: {request.model}.\n"
            f"Prompt messages received: {len(request.messages)}.\n\n"
            f"To connect to live upstream providers, configure OPENROUTER_API_KEY "
            f"or OPENAI_API_KEY in your server environment."
        )
        latency_ms = (time.perf_counter() - start_time) * 1000.0 + 120.0
        in_tokens = sum(len(str(m.content).split()) * 2 for m in request.messages)
        out_tokens = len(simulated_output.split()) * 2
        cost = pricing_service.calculate_cost(request.model, in_tokens, out_tokens)

        return PlaygroundRunResponse(
            output=simulated_output,
            input_tokens=in_tokens,
            output_tokens=out_tokens,
            total_tokens=in_tokens + out_tokens,
            latency_ms=round(latency_ms, 1),
            estimated_cost=cost,
            model=request.model
        )

    start_time = time.perf_counter()
    payload = {
        "model": request.model,
        "messages": [m.model_dump(exclude_none=True) for m in request.messages],
        "temperature": request.temperature,
        "max_tokens": request.max_tokens,
    }

    status_code, response_data, _ = await provider.chat_completion(
        request_data=payload,
        api_key=api_key,
        api_base=api_base,
        timeout=timeout
    )
    latency_ms = (time.perf_counter() - start_time) * 1000.0

    if status_code != 200:
        err_type, err_msg = provider.extract_error(status_code, response_data)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Provider error ({err_type}): {err_msg}"
        )

    choices = response_data.get("choices", [])
    output_text = ""
    if choices:
        msg = choices[0].get("message", {})
        output_text = msg.get("content", "")

    # Extract usage based on provider
    if provider == openrouter_provider:
        usage = openrouter_provider.extract_usage(response_data)
        in_tokens = usage["input_tokens"]
        out_tokens = usage["output_tokens"]
        total_tokens = usage["total_tokens"]
    else:
        in_tokens, out_tokens, total_tokens = openai_provider.extract_usage(response_data)

    cost = pricing_service.calculate_cost(request.model, in_tokens, out_tokens)

    return PlaygroundRunResponse(
        output=output_text,
        input_tokens=in_tokens,
        output_tokens=out_tokens,
        total_tokens=total_tokens,
        latency_ms=round(latency_ms, 1),
        estimated_cost=cost,
        model=request.model
    )
