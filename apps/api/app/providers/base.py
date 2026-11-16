from abc import ABC, abstractmethod
from typing import Dict, Any, Tuple, Optional


class BaseProvider(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the provider (e.g. 'openai', 'anthropic')"""
        pass

    @abstractmethod
    async def chat_completion(
        self,
        request_data: Dict[str, Any],
        api_key: str,
        api_base: Optional[str] = None,
        timeout: float = 60.0
    ) -> Tuple[int, Dict[str, Any], Dict[str, str]]:
        """
        Executes a non-streaming chat completion.
        Returns: (status_code, response_json, headers)
        """
        pass

    @abstractmethod
    def extract_usage(self, response_data: Dict[str, Any]) -> Tuple[int, int, int]:
        """
        Extracts (input_tokens, output_tokens, total_tokens) from response.
        """
        pass

    @abstractmethod
    def extract_error(self, status_code: int, response_data: Dict[str, Any]) -> Tuple[str, str]:
        """
        Returns (error_type, error_message).
        """
        pass
