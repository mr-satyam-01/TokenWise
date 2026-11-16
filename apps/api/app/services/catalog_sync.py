"""
Model Catalog & Pricing Synchronization Service.

Fetches the complete model catalog and pricing from OpenRouter's /api/v1/models
endpoint and persists it to the database. Supports:
- Full catalog sync (models + pricing)
- Price version history (immutable pricing records)
- Validation of incomplete pricing data
- Periodic background sync
"""

import httpx
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models import ModelCatalog, ModelPricing, ModelSyncRun

logger = logging.getLogger("tokenwise.services.catalog_sync")

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"


class CatalogSyncService:
    """Synchronizes the OpenRouter model catalog and pricing into the DB."""

    async def fetch_openrouter_models(self) -> List[Dict[str, Any]]:
        """Fetches the full model list from OpenRouter /api/v1/models."""
        headers = {}
        if settings.OPENROUTER_API_KEY:
            headers["Authorization"] = f"Bearer {settings.OPENROUTER_API_KEY}"

        timeout = httpx.Timeout(timeout=30.0, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(OPENROUTER_MODELS_URL, headers=headers)
            response.raise_for_status()
            data = response.json()

        models = data.get("data", [])
        logger.info(f"Fetched {len(models)} models from OpenRouter catalog.")
        return models

    def _parse_pricing(self, raw_model: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parses pricing from OpenRouter model data.
        OpenRouter pricing is expressed per-token (not per-million),
        so we multiply by 1,000,000 to normalize.
        """
        pricing_data = raw_model.get("pricing") or {}

        def to_per_million(val: Any) -> Optional[float]:
            if val is None or val == "" or val == "-1":
                return None
            try:
                price_per_token = float(val)
                return price_per_token * 1_000_000
            except (ValueError, TypeError):
                return None

        input_ppm = to_per_million(pricing_data.get("prompt"))
        output_ppm = to_per_million(pricing_data.get("completion"))
        cached_input_ppm = to_per_million(pricing_data.get("cache_read") or pricing_data.get("cached_prompt"))
        reasoning_ppm = to_per_million(pricing_data.get("reasoning"))
        request_flat = to_per_million(pricing_data.get("request"))

        # Validation
        validation_status = "valid"
        if input_ppm is None and output_ppm is None:
            validation_status = "incomplete"
        elif input_ppm is not None and input_ppm < 0:
            validation_status = "malformed"
        elif output_ppm is not None and output_ppm < 0:
            validation_status = "malformed"

        return {
            "input_price_per_million": input_ppm or 0.0,
            "output_price_per_million": output_ppm or 0.0,
            "cached_input_price_per_million": cached_input_ppm,
            "reasoning_price_per_million": reasoning_ppm,
            "request_flat_price": request_flat,
            "validation_status": validation_status,
            "raw_pricing": json.dumps(pricing_data),
        }

    def _parse_model_metadata(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Parses model metadata from OpenRouter API response."""
        model_id = raw.get("id", "")
        name = raw.get("name", model_id)

        # Extract provider from model ID (e.g., "openai/gpt-4o" -> "openai")
        provider_name = model_id.split("/")[0] if "/" in model_id else None

        context_length = raw.get("context_length")
        description = raw.get("description", "")

        # Parse modalities from architecture
        architecture = raw.get("architecture") or {}
        modality = architecture.get("modality", "text->text")
        
        # Capabilities
        capabilities = {}
        top_provider = raw.get("top_provider") or {}
        if top_provider.get("is_moderated"):
            capabilities["is_moderated"] = True
        if "tool_use" in str(raw.get("supported_parameters", [])):
            capabilities["tool_use"] = True

        return {
            "id": model_id,
            "name": name,
            "provider_name": provider_name,
            "description": description[:500] if description else None,
            "context_length": context_length,
            "modalities": modality,
            "capabilities": json.dumps(capabilities) if capabilities else None,
            "raw_metadata": json.dumps({
                k: v for k, v in raw.items()
                if k not in ("pricing",)  # Pricing stored separately
            }),
        }

    async def sync_catalog(self) -> Dict[str, Any]:
        """
        Full catalog sync: fetches all models from OpenRouter,
        upserts model records, and creates new pricing versions
        when prices have changed.
        """
        sync_run = ModelSyncRun(
            sync_type="full",
            status="running",
            started_at=datetime.now(timezone.utc),
        )
        
        try:
            raw_models = await self.fetch_openrouter_models()
        except Exception as e:
            logger.error(f"Failed to fetch OpenRouter models: {e}", exc_info=True)
            async with AsyncSessionLocal() as session:
                sync_run.status = "failed"
                sync_run.error_message = str(e)[:2000]
                sync_run.completed_at = datetime.now(timezone.utc)
                session.add(sync_run)
                await session.commit()
            return {"status": "failed", "error": str(e)}

        models_discovered = len(raw_models)
        models_updated = 0
        pricings_created = 0
        validation_failures = 0

        async with AsyncSessionLocal() as session:
            for raw_model in raw_models:
                try:
                    meta = self._parse_model_metadata(raw_model)
                    pricing = self._parse_pricing(raw_model)

                    if pricing["validation_status"] != "valid":
                        validation_failures += 1

                    # Upsert model catalog entry
                    result = await session.execute(
                        select(ModelCatalog).where(ModelCatalog.id == meta["id"])
                    )
                    existing_model = result.scalar_one_or_none()

                    if existing_model:
                        existing_model.name = meta["name"]
                        existing_model.provider_name = meta["provider_name"]
                        existing_model.description = meta["description"]
                        existing_model.context_length = meta["context_length"]
                        existing_model.modalities = meta["modalities"]
                        existing_model.capabilities = meta["capabilities"]
                        existing_model.raw_metadata = meta["raw_metadata"]
                        existing_model.is_active = True
                        existing_model.last_synced_at = datetime.now(timezone.utc)
                        models_updated += 1
                    else:
                        new_model = ModelCatalog(
                            id=meta["id"],
                            name=meta["name"],
                            provider_name=meta["provider_name"],
                            description=meta["description"],
                            context_length=meta["context_length"],
                            modalities=meta["modalities"],
                            capabilities=meta["capabilities"],
                            raw_metadata=meta["raw_metadata"],
                            is_active=True,
                            last_synced_at=datetime.now(timezone.utc),
                        )
                        session.add(new_model)
                        models_updated += 1

                    # Check if pricing has changed
                    needs_new_pricing = True
                    latest_version = 0

                    price_result = await session.execute(
                        select(ModelPricing)
                        .where(
                            ModelPricing.model_id == meta["id"],
                            ModelPricing.is_active == True,
                        )
                        .order_by(ModelPricing.version.desc())
                        .limit(1)
                    )
                    current_pricing = price_result.scalar_one_or_none()

                    if current_pricing:
                        latest_version = current_pricing.version
                        # Compare prices to see if a new version is needed
                        if (
                            abs(current_pricing.input_price_per_million - pricing["input_price_per_million"]) < 0.0001
                            and abs(current_pricing.output_price_per_million - pricing["output_price_per_million"]) < 0.0001
                            and current_pricing.cached_input_price_per_million == pricing["cached_input_price_per_million"]
                            and current_pricing.reasoning_price_per_million == pricing["reasoning_price_per_million"]
                        ):
                            needs_new_pricing = False

                    if needs_new_pricing:
                        # Deactivate old pricing versions
                        if current_pricing:
                            await session.execute(
                                update(ModelPricing)
                                .where(
                                    ModelPricing.model_id == meta["id"],
                                    ModelPricing.is_active == True,
                                )
                                .values(is_active=False)
                            )

                        new_pricing = ModelPricing(
                            model_id=meta["id"],
                            version=latest_version + 1,
                            is_active=True,
                            input_price_per_million=pricing["input_price_per_million"],
                            output_price_per_million=pricing["output_price_per_million"],
                            cached_input_price_per_million=pricing["cached_input_price_per_million"],
                            reasoning_price_per_million=pricing["reasoning_price_per_million"],
                            request_flat_price=pricing["request_flat_price"],
                            currency="USD",
                            pricing_source="openrouter_catalog",
                            source_url=OPENROUTER_MODELS_URL,
                            raw_pricing=pricing["raw_pricing"],
                            validation_status=pricing["validation_status"],
                            effective_at=datetime.now(timezone.utc),
                        )
                        session.add(new_pricing)
                        pricings_created += 1

                except Exception as e:
                    logger.warning(f"Error syncing model {raw_model.get('id')}: {e}")
                    validation_failures += 1

            # Save sync run record
            sync_run.status = "success"
            sync_run.models_discovered = models_discovered
            sync_run.models_updated = models_updated
            sync_run.pricings_created = pricings_created
            sync_run.validation_failures = validation_failures
            sync_run.completed_at = datetime.now(timezone.utc)
            session.add(sync_run)

            await session.commit()

        summary = {
            "status": "success",
            "models_discovered": models_discovered,
            "models_updated": models_updated,
            "pricings_created": pricings_created,
            "validation_failures": validation_failures,
        }
        logger.info(f"Catalog sync complete: {summary}")
        return summary

    async def get_model_pricing(
        self, model_id: str, session: Optional[AsyncSession] = None
    ) -> Optional[ModelPricing]:
        """Retrieves the active pricing for a model."""
        async def _query(s: AsyncSession):
            result = await s.execute(
                select(ModelPricing)
                .where(
                    ModelPricing.model_id == model_id,
                    ModelPricing.is_active == True,
                )
                .order_by(ModelPricing.version.desc())
                .limit(1)
            )
            return result.scalar_one_or_none()

        if session:
            return await _query(session)
        async with AsyncSessionLocal() as s:
            return await _query(s)


catalog_sync_service = CatalogSyncService()
