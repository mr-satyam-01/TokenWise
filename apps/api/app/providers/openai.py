import httpx
import logging
from typing import Dict, Any, Tuple, Optional

from app.providers.base import BaseProvider

logger = logging.getLogger("tokenwise.providers.openai")


class OpenAIProvider(BaseProvider):
    @property
    def provider_name(self) -> str:
        return "openai"

    async def chat_completion(
        self,
        request_data: Dict[str, Any],
        api_key: str,
        api_base: Optional[str] = None,
        timeout: float = 60.0
    ) -> Tuple[int, Dict[str, Any], Dict[str, str]]:
        url = (api_base or "https://api.openai.com/v1").rstrip("/") + "/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        # Do not allow client stream flag in non-streaming gateway endpoint
        payload = dict(request_data)
        if "stream" in payload and payload["stream"]:
            payload["stream"] = False

        transport_timeout = httpx.Timeout(timeout=timeout, connect=10.0)
        
        async with httpx.AsyncClient(timeout=transport_timeout) as client:
            try:
                response = await client.post(url, json=payload, headers=headers)
                status_code = response.status_code
                response_headers = {
                    k: v for k, v in response.headers.items() 
                    if k.lower() in ["content-type", "x-request-id", "openai-model", "openai-processing-ms"]
                }
                
                try:
                    data = response.json()
                except Exception:
                    data = {"error": {"message": response.text, "type": "upstream_raw_error"}}
                
                return status_code, data, response_headers

            except httpx.ConnectTimeout:
                return 504, {"error": {"message": "Upstream OpenAI connection timed out", "type": "gateway_timeout"}}, {}
            except httpx.ReadTimeout:
                return 504, {"error": {"message": "Upstream OpenAI response read timed out", "type": "gateway_read_timeout"}}, {}
            except httpx.ConnectError:
                return 502, {"error": {"message": "Failed to connect to OpenAI endpoint", "type": "bad_gateway"}}, {}
            except Exception as e:
                logger.error(f"Unexpected error proxying to OpenAI: {e}", exc_info=True)
                return 500, {"error": {"message": str(e), "type": "internal_gateway_error"}}, {}

    def extract_usage(self, response_data: Dict[str, Any]) -> Tuple[int, int, int]:
        usage = response_data.get("usage")
        if not usage or not isinstance(usage, dict):
            return 0, 0, 0
        prompt_tokens = usage.get("prompt_tokens", 0) or 0
        completion_tokens = usage.get("completion_tokens", 0) or 0
        total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens) or 0
        return int(prompt_tokens), int(completion_tokens), int(total_tokens)

    def extract_error(self, status_code: int, response_data: Dict[str, Any]) -> Tuple[str, str]:
        err = response_data.get("error")
        if isinstance(err, dict):
            err_type = err.get("type") or f"http_{status_code}"
            err_msg = err.get("message") or str(err)
            return str(err_type), str(err_msg)
        elif isinstance(err, str):
            return f"http_{status_code}", err
        return f"http_{status_code}", f"HTTP error {status_code}"


openai_provider = OpenAIProvider()
