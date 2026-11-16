import httpx
import logging
from typing import Dict, Any, Tuple, Optional

from app.providers.base import BaseProvider
from app.core.config import settings

logger = logging.getLogger("tokenwise.providers.openrouter")


class OpenRouterProvider(BaseProvider):
    """
    OpenRouter provider — routes requests through OpenRouter's OpenAI-compatible API
    to any supported model (OpenAI, Anthropic, Meta, Google, Mistral, etc.).
    """

    @property
    def provider_name(self) -> str:
        return "openrouter"

    async def chat_completion(
        self,
        request_data: Dict[str, Any],
        api_key: str,
        api_base: Optional[str] = None,
        timeout: float = 120.0,
    ) -> Tuple[int, Dict[str, Any], Dict[str, str]]:
        base_url = (api_base or settings.OPENROUTER_BASE_URL).rstrip("/")
        url = f"{base_url}/chat/completions"

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": settings.OPENROUTER_SITE_URL,
            "X-Title": settings.OPENROUTER_SITE_NAME,
        }

        payload = dict(request_data)
        # Disable streaming for non-streaming gateway
        if payload.get("stream"):
            payload["stream"] = False

        transport_timeout = httpx.Timeout(
            timeout=timeout,
            connect=15.0,
            read=timeout,
        )

        async with httpx.AsyncClient(timeout=transport_timeout) as client:
            try:
                response = await client.post(url, json=payload, headers=headers)
                status_code = response.status_code
                response_headers = {
                    k: v
                    for k, v in response.headers.items()
                    if k.lower()
                    in [
                        "content-type",
                        "x-request-id",
                        "x-ratelimit-limit-tokens",
                        "x-ratelimit-remaining-tokens",
                        "x-ratelimit-limit-requests",
                        "x-ratelimit-remaining-requests",
                    ]
                }

                try:
                    data = response.json()
                except Exception:
                    data = {
                        "error": {
                            "message": response.text[:2000],
                            "type": "upstream_raw_error",
                        }
                    }

                return status_code, data, response_headers

            except httpx.ConnectTimeout:
                return (
                    504,
                    {
                        "error": {
                            "message": "Upstream OpenRouter connection timed out",
                            "type": "gateway_timeout",
                        }
                    },
                    {},
                )
            except httpx.ReadTimeout:
                return (
                    504,
                    {
                        "error": {
                            "message": "Upstream OpenRouter read timed out",
                            "type": "gateway_read_timeout",
                        }
                    },
                    {},
                )
            except httpx.ConnectError:
                return (
                    502,
                    {
                        "error": {
                            "message": "Failed to connect to OpenRouter endpoint",
                            "type": "bad_gateway",
                        }
                    },
                    {},
                )
            except Exception as e:
                logger.error(
                    f"Unexpected error proxying to OpenRouter: {e}", exc_info=True
                )
                return (
                    500,
                    {"error": {"message": str(e), "type": "internal_gateway_error"}},
                    {},
                )

    def extract_usage(
        self, response_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Extracts comprehensive usage data from OpenRouter response.
        OpenRouter returns standard OpenAI-compatible usage plus additional fields.
        Returns a dict with all usage metrics including cost if available.
        """
        usage = response_data.get("usage")
        if not usage or not isinstance(usage, dict):
            return {
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "cached_input_tokens": 0,
                "reasoning_tokens": 0,
                "provider_cost": None,
            }

        prompt_tokens = int(usage.get("prompt_tokens", 0) or 0)
        completion_tokens = int(usage.get("completion_tokens", 0) or 0)
        total_tokens = int(
            usage.get("total_tokens", prompt_tokens + completion_tokens) or 0
        )

        # OpenRouter-specific: prompt_tokens_details may contain cached_tokens
        prompt_details = usage.get("prompt_tokens_details") or {}
        cached_tokens = int(prompt_details.get("cached_tokens", 0) or 0)

        # Completion details may contain reasoning_tokens
        completion_details = usage.get("completion_tokens_details") or {}
        reasoning_tokens = int(completion_details.get("reasoning_tokens", 0) or 0)

        # OpenRouter may report native_tokens_reasoning in some models
        native_reasoning = int(usage.get("native_tokens_reasoning", 0) or 0)
        if native_reasoning > reasoning_tokens:
            reasoning_tokens = native_reasoning

        # OpenRouter cost (if reported by upstream)
        provider_cost = usage.get("total_cost")
        if provider_cost is not None:
            try:
                provider_cost = float(provider_cost)
            except (ValueError, TypeError):
                provider_cost = None

        return {
            "input_tokens": prompt_tokens,
            "output_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "cached_input_tokens": cached_tokens,
            "reasoning_tokens": reasoning_tokens,
            "provider_cost": provider_cost,
        }

    def extract_resolved_model(self, response_data: Dict[str, Any]) -> Optional[str]:
        """OpenRouter may resolve the model to a different model ID."""
        return response_data.get("model")

    def extract_error(
        self, status_code: int, response_data: Dict[str, Any]
    ) -> Tuple[str, str]:
        err = response_data.get("error")
        if isinstance(err, dict):
            err_type = err.get("type") or err.get("code") or f"http_{status_code}"
            err_msg = err.get("message") or str(err)
            return str(err_type), str(err_msg)
        elif isinstance(err, str):
            return f"http_{status_code}", err
        return f"http_{status_code}", f"HTTP error {status_code}"


openrouter_provider = OpenRouterProvider()
