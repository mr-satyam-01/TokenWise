"""
Model Catalog & Pricing API endpoints.
Provides model discovery, pricing lookup, and catalog sync triggers.
"""

import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.models import ModelCatalog, ModelPricing, ModelSyncRun

logger = logging.getLogger("tokenwise.api.models")

router = APIRouter(prefix="/models", tags=["Models & Catalog"])


@router.get("/")
async def list_models(
    active_only: bool = Query(True, description="Only return active models"),
    provider: Optional[str] = Query(None, description="Filter by provider name"),
    search: Optional[str] = Query(None, description="Search by model name or ID"),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List available models from the catalog."""
    query = select(ModelCatalog)

    if active_only:
        query = query.where(ModelCatalog.is_active == True)
    if provider:
        query = query.where(ModelCatalog.provider_name == provider)
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            (ModelCatalog.id.ilike(search_pattern))
            | (ModelCatalog.name.ilike(search_pattern))
        )

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    query = query.order_by(ModelCatalog.provider_name, ModelCatalog.name)
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    models = result.scalars().all()

    return {
        "total": total,
        "models": [
            {
                "id": m.id,
                "name": m.name,
                "provider_name": m.provider_name,
                "description": (m.description[:200] + "...") if m.description and len(m.description) > 200 else m.description,
                "context_length": m.context_length,
                "modalities": m.modalities,
                "is_active": m.is_active,
                "last_synced_at": m.last_synced_at.isoformat() if m.last_synced_at else None,
            }
            for m in models
        ],
    }


@router.get("/{model_id:path}/pricing")
async def get_model_pricing(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get active pricing for a specific model."""
    result = await db.execute(
        select(ModelPricing)
        .where(ModelPricing.model_id == model_id, ModelPricing.is_active == True)
        .order_by(ModelPricing.version.desc())
        .limit(1)
    )
    pricing = result.scalar_one_or_none()

    if not pricing:
        raise HTTPException(status_code=404, detail=f"No active pricing found for model '{model_id}'")

    return {
        "model_id": pricing.model_id,
        "version": pricing.version,
        "input_price_per_million": pricing.input_price_per_million,
        "output_price_per_million": pricing.output_price_per_million,
        "cached_input_price_per_million": pricing.cached_input_price_per_million,
        "reasoning_price_per_million": pricing.reasoning_price_per_million,
        "request_flat_price": pricing.request_flat_price,
        "currency": pricing.currency,
        "pricing_source": pricing.pricing_source,
        "validation_status": pricing.validation_status,
        "effective_at": pricing.effective_at.isoformat() if pricing.effective_at else None,
    }


@router.get("/{model_id:path}/pricing/history")
async def get_pricing_history(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get pricing version history for a model."""
    result = await db.execute(
        select(ModelPricing)
        .where(ModelPricing.model_id == model_id)
        .order_by(ModelPricing.version.desc())
    )
    pricings = result.scalars().all()

    return [
        {
            "id": p.id,
            "version": p.version,
            "is_active": p.is_active,
            "input_price_per_million": p.input_price_per_million,
            "output_price_per_million": p.output_price_per_million,
            "cached_input_price_per_million": p.cached_input_price_per_million,
            "reasoning_price_per_million": p.reasoning_price_per_million,
            "pricing_source": p.pricing_source,
            "validation_status": p.validation_status,
            "effective_at": p.effective_at.isoformat() if p.effective_at else None,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in pricings
    ]


@router.post("/sync")
async def trigger_catalog_sync(
    _user=Depends(get_current_user),
):
    """Manually trigger a full model catalog and pricing sync from OpenRouter."""
    from app.services.catalog_sync import catalog_sync_service

    try:
        result = await catalog_sync_service.sync_catalog()
        return result
    except Exception as e:
        logger.error(f"Catalog sync failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Catalog sync failed: {str(e)}")


@router.get("/sync/history")
async def get_sync_history(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Get recent catalog sync run history."""
    result = await db.execute(
        select(ModelSyncRun)
        .order_by(ModelSyncRun.started_at.desc())
        .limit(limit)
    )
    runs = result.scalars().all()

    return [
        {
            "id": r.id,
            "sync_type": r.sync_type,
            "status": r.status,
            "models_discovered": r.models_discovered,
            "models_updated": r.models_updated,
            "pricings_created": r.pricings_created,
            "validation_failures": r.validation_failures,
            "error_message": r.error_message,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in runs
    ]


@router.get("/providers")
async def list_providers(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """List all unique providers from the model catalog."""
    result = await db.execute(
        select(ModelCatalog.provider_name, func.count(ModelCatalog.id))
        .where(ModelCatalog.is_active == True, ModelCatalog.provider_name.isnot(None))
        .group_by(ModelCatalog.provider_name)
        .order_by(func.count(ModelCatalog.id).desc())
    )
    rows = result.all()

    return [{"provider": r[0], "model_count": r[1]} for r in rows]
