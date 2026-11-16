"""
Dynamic Pricing Service.

Calculates token costs using database-backed pricing from the model catalog.
Falls back to hardcoded pricing if DB lookup fails or returns no results.
Uses exact decimal arithmetic to avoid floating-point rounding errors.
"""

from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Optional, Tuple
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models import ModelPricing

logger = logging.getLogger("tokenwise.services.pricing")


# Hardcoded fallback pricing per 1,000,000 tokens (USD)
# (input_per_m, output_per_m, cached_input_per_m, reasoning_per_m)
FALLBACK_PRICING: Dict[str, Tuple[Decimal, Decimal, Optional[Decimal], Optional[Decimal]]] = {
    # OpenAI GPT-4o family
    "gpt-4o": (Decimal("2.50"), Decimal("10.00"), Decimal("1.25"), None),
    "gpt-4o-mini": (Decimal("0.15"), Decimal("0.60"), Decimal("0.075"), None),
    "gpt-4-turbo": (Decimal("10.00"), Decimal("30.00"), None, None),
    "gpt-4": (Decimal("30.00"), Decimal("60.00"), None, None),
    "gpt-3.5-turbo": (Decimal("0.50"), Decimal("1.50"), None, None),
    # OpenAI O-series
    "o1-preview": (Decimal("15.00"), Decimal("60.00"), Decimal("7.50"), None),
    "o1-mini": (Decimal("3.00"), Decimal("12.00"), Decimal("1.50"), None),
    # Anthropic Claude
    "claude-3-5-sonnet-20241022": (Decimal("3.00"), Decimal("15.00"), Decimal("0.30"), None),
    "claude-3-5-haiku-20241022": (Decimal("1.00"), Decimal("5.00"), Decimal("0.10"), None),
    "claude-3-opus-20240229": (Decimal("15.00"), Decimal("75.00"), None, None),
    # Google Gemini
    "gemini-2.0-flash": (Decimal("0.10"), Decimal("0.40"), Decimal("0.025"), None),
    "gemini-1.5-pro": (Decimal("1.25"), Decimal("5.00"), Decimal("0.3125"), None),
    "gemini-1.5-flash": (Decimal("0.075"), Decimal("0.30"), Decimal("0.01875"), None),
    # Meta Llama
    "meta-llama/llama-3.1-70b-instruct": (Decimal("0.52"), Decimal("0.75"), None, None),
    "meta-llama/llama-3.1-8b-instruct": (Decimal("0.055"), Decimal("0.055"), None, None),
    # Fallback
    "default": (Decimal("1.00"), Decimal("2.00"), None, None),
}


class PricingService:
    """
    Dynamic pricing service with DB-backed pricing lookup
    and hardcoded fallback for resilience.
    """

    async def calculate_cost_from_db(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cached_tokens: int = 0,
        reasoning_tokens: int = 0,
    ) -> Tuple[float, Optional[str], str]:
        """
        Calculate cost using DB pricing.
        Returns (cost, pricing_version_id, cost_status).
        """
        try:
            async with AsyncSessionLocal() as session:
                pricing = await self._lookup_pricing(model, session)
                if pricing:
                    cost = self._compute_cost(
                        input_ppm=Decimal(str(pricing.input_price_per_million)),
                        output_ppm=Decimal(str(pricing.output_price_per_million)),
                        cached_ppm=Decimal(str(pricing.cached_input_price_per_million)) if pricing.cached_input_price_per_million else None,
                        reasoning_ppm=Decimal(str(pricing.reasoning_price_per_million)) if pricing.reasoning_price_per_million else None,
                        request_flat=Decimal(str(pricing.request_flat_price)) if pricing.request_flat_price else None,
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        cached_tokens=cached_tokens,
                        reasoning_tokens=reasoning_tokens,
                    )
                    return cost, pricing.id, "exact_usage_reported"
        except Exception as e:
            logger.warning(f"DB pricing lookup failed for model '{model}': {e}")

        # Fallback to hardcoded
        cost = self.calculate_cost(model, input_tokens, output_tokens, cached_tokens, reasoning_tokens)
        return cost, None, "estimated"

    async def _lookup_pricing(self, model: str, session: AsyncSession) -> Optional[ModelPricing]:
        """Look up active pricing from DB. Tries exact match, then prefix match."""
        # Exact match
        result = await session.execute(
            select(ModelPricing)
            .where(ModelPricing.model_id == model, ModelPricing.is_active == True)
            .order_by(ModelPricing.version.desc())
            .limit(1)
        )
        pricing = result.scalar_one_or_none()
        if pricing:
            return pricing

        # Try with/without provider prefix
        if "/" not in model:
            # Try common providers
            for prefix in ["openai", "anthropic", "google", "meta-llama", "mistralai"]:
                candidate = f"{prefix}/{model}"
                result = await session.execute(
                    select(ModelPricing)
                    .where(ModelPricing.model_id == candidate, ModelPricing.is_active == True)
                    .order_by(ModelPricing.version.desc())
                    .limit(1)
                )
                pricing = result.scalar_one_or_none()
                if pricing:
                    return pricing

        return None

    @classmethod
    def calculate_cost(
        cls,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cached_tokens: int = 0,
        reasoning_tokens: int = 0,
    ) -> float:
        """
        Calculate cost using hardcoded fallback pricing.
        Used when DB is unavailable or model not found.
        """
        model_key = model.lower().strip()

        # Try exact match first
        pricing = FALLBACK_PRICING.get(model_key)

        if not pricing:
            # Try with/without provider prefix
            short_key = model_key.split("/")[-1] if "/" in model_key else model_key
            pricing = FALLBACK_PRICING.get(short_key)

        if not pricing:
            # Fuzzy prefix match
            for k in FALLBACK_PRICING:
                if k in model_key or model_key.startswith(k):
                    pricing = FALLBACK_PRICING[k]
                    break

        if not pricing:
            pricing = FALLBACK_PRICING["default"]

        input_ppm, output_ppm, cached_ppm, reasoning_ppm = pricing
        return cls._compute_cost(
            input_ppm=input_ppm,
            output_ppm=output_ppm,
            cached_ppm=cached_ppm,
            reasoning_ppm=reasoning_ppm,
            request_flat=None,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cached_tokens=cached_tokens,
            reasoning_tokens=reasoning_tokens,
        )

    @staticmethod
    def _compute_cost(
        input_ppm: Decimal,
        output_ppm: Decimal,
        cached_ppm: Optional[Decimal],
        reasoning_ppm: Optional[Decimal],
        request_flat: Optional[Decimal],
        input_tokens: int,
        output_tokens: int,
        cached_tokens: int = 0,
        reasoning_tokens: int = 0,
    ) -> float:
        """Core cost calculation with exact decimal arithmetic."""
        dec_1m = Decimal("1000000")

        # Regular input tokens = total input minus cached
        regular_input = max(0, input_tokens - cached_tokens)
        input_cost = (Decimal(regular_input) * input_ppm) / dec_1m

        # Cached input tokens
        if cached_tokens > 0 and cached_ppm is not None:
            cached_cost = (Decimal(cached_tokens) * cached_ppm) / dec_1m
        elif cached_tokens > 0:
            cached_cost = (Decimal(cached_tokens) * input_ppm) / dec_1m
        else:
            cached_cost = Decimal("0")

        # Output tokens (minus reasoning if separate)
        regular_output = max(0, output_tokens - reasoning_tokens)
        output_cost = (Decimal(regular_output) * output_ppm) / dec_1m

        # Reasoning tokens
        if reasoning_tokens > 0 and reasoning_ppm is not None:
            reasoning_cost = (Decimal(reasoning_tokens) * reasoning_ppm) / dec_1m
        elif reasoning_tokens > 0:
            reasoning_cost = (Decimal(reasoning_tokens) * output_ppm) / dec_1m
        else:
            reasoning_cost = Decimal("0")

        # Flat per-request fee
        flat_cost = request_flat if request_flat else Decimal("0")

        total = input_cost + cached_cost + output_cost + reasoning_cost + flat_cost
        rounded = total.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
        return float(rounded)


pricing_service = PricingService()
