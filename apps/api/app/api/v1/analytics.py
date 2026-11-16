from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_organization
from app.db.session import get_db
from app.models import Organization, LLMRequest
from app.schemas import (
    OverviewMetricsOut, VolumeTimePoint, CostTimePoint, TokenTimePoint, ModelDistributionPoint
)

router = APIRouter(prefix="/analytics", tags=["Analytics"])


def get_cutoff_date(time_range: str) -> Optional[datetime]:
    now = datetime.now(timezone.utc)
    if time_range == "24h":
        return now - timedelta(hours=24)
    elif time_range == "7d":
        return now - timedelta(days=7)
    elif time_range == "30d":
        return now - timedelta(days=30)
    return None


@router.get("/overview", response_model=OverviewMetricsOut)
async def get_overview_metrics(
    current_org: Organization = Depends(get_current_organization),
    time_range: str = Query("7d"),
    db: AsyncSession = Depends(get_db)
):
    query = select(
        func.count(LLMRequest.id).label("total_requests"),
        func.coalesce(func.sum(LLMRequest.estimated_cost), 0.0).label("total_cost"),
        func.coalesce(func.sum(LLMRequest.input_tokens), 0).label("input_tokens"),
        func.coalesce(func.sum(LLMRequest.output_tokens), 0).label("output_tokens"),
        func.coalesce(func.sum(LLMRequest.total_tokens), 0).label("total_tokens"),
        func.coalesce(func.avg(LLMRequest.latency_ms), 0.0).label("avg_latency"),
        func.coalesce(
            func.sum(case((LLMRequest.status == "error", 1), else_=0)), 0
        ).label("error_count")
    ).where(LLMRequest.organization_id == current_org.id)

    cutoff = get_cutoff_date(time_range)
    if cutoff:
        query = query.where(LLMRequest.created_at >= cutoff)

    row = (await db.execute(query)).one()
    total_reqs = row.total_requests or 0
    err_count = row.error_count or 0
    error_rate = (err_count / total_reqs * 100.0) if total_reqs > 0 else 0.0

    return OverviewMetricsOut(
        total_requests=total_reqs,
        total_cost=round(float(row.total_cost), 4),
        total_tokens=int(row.total_tokens),
        input_tokens=int(row.input_tokens),
        output_tokens=int(row.output_tokens),
        avg_latency_ms=round(float(row.avg_latency), 1),
        error_rate=round(error_rate, 2),
        currency="USD"
    )


@router.get("/volume", response_model=List[VolumeTimePoint])
async def get_volume_timeline(
    current_org: Organization = Depends(get_current_organization),
    time_range: str = Query("7d"),
    db: AsyncSession = Depends(get_db)
):
    """Aggregates request and error volume by date."""
    query = select(LLMRequest).where(LLMRequest.organization_id == current_org.id)
    cutoff = get_cutoff_date(time_range)
    if cutoff:
        query = query.where(LLMRequest.created_at >= cutoff)

    query = query.order_by(LLMRequest.created_at.asc())
    records = (await db.execute(query)).scalars().all()

    # Bucket by timestamp (e.g. YYYY-MM-DD or YYYY-MM-DD HH:00)
    fmt = "%Y-%m-%d %H:00" if time_range == "24h" else "%Y-%m-%d"
    buckets = {}
    for r in records:
        dt = r.created_at.strftime(fmt)
        if dt not in buckets:
            buckets[dt] = {"requests": 0, "errors": 0}
        buckets[dt]["requests"] += 1
        if r.status == "error":
            buckets[dt]["errors"] += 1

    return [
        VolumeTimePoint(timestamp=dt, requests=b["requests"], errors=b["errors"])
        for dt, b in sorted(buckets.items())
    ]


@router.get("/costs", response_model=List[CostTimePoint])
async def get_cost_timeline(
    current_org: Organization = Depends(get_current_organization),
    time_range: str = Query("7d"),
    db: AsyncSession = Depends(get_db)
):
    query = select(LLMRequest).where(LLMRequest.organization_id == current_org.id)
    cutoff = get_cutoff_date(time_range)
    if cutoff:
        query = query.where(LLMRequest.created_at >= cutoff)

    query = query.order_by(LLMRequest.created_at.asc())
    records = (await db.execute(query)).scalars().all()

    fmt = "%Y-%m-%d %H:00" if time_range == "24h" else "%Y-%m-%d"
    buckets = {}
    for r in records:
        dt = r.created_at.strftime(fmt)
        buckets[dt] = buckets.get(dt, 0.0) + r.estimated_cost

    return [
        CostTimePoint(timestamp=dt, cost=round(c, 4))
        for dt, c in sorted(buckets.items())
    ]


@router.get("/tokens", response_model=List[TokenTimePoint])
async def get_token_timeline(
    current_org: Organization = Depends(get_current_organization),
    time_range: str = Query("7d"),
    db: AsyncSession = Depends(get_db)
):
    query = select(LLMRequest).where(LLMRequest.organization_id == current_org.id)
    cutoff = get_cutoff_date(time_range)
    if cutoff:
        query = query.where(LLMRequest.created_at >= cutoff)

    query = query.order_by(LLMRequest.created_at.asc())
    records = (await db.execute(query)).scalars().all()

    fmt = "%Y-%m-%d %H:00" if time_range == "24h" else "%Y-%m-%d"
    buckets = {}
    for r in records:
        dt = r.created_at.strftime(fmt)
        if dt not in buckets:
            buckets[dt] = {"input": 0, "output": 0}
        buckets[dt]["input"] += r.input_tokens
        buckets[dt]["output"] += r.output_tokens

    return [
        TokenTimePoint(
            timestamp=dt,
            input_tokens=b["input"],
            output_tokens=b["output"],
            total_tokens=b["input"] + b["output"]
        )
        for dt, b in sorted(buckets.items())
    ]


@router.get("/models", response_model=List[ModelDistributionPoint])
async def get_model_distribution(
    current_org: Organization = Depends(get_current_organization),
    time_range: str = Query("7d"),
    db: AsyncSession = Depends(get_db)
):
    query = select(
        LLMRequest.model,
        func.count(LLMRequest.id).label("requests"),
        func.coalesce(func.sum(LLMRequest.estimated_cost), 0.0).label("cost")
    ).where(LLMRequest.organization_id == current_org.id)

    cutoff = get_cutoff_date(time_range)
    if cutoff:
        query = query.where(LLMRequest.created_at >= cutoff)

    query = query.group_by(LLMRequest.model)
    rows = (await db.execute(query)).all()

    total_requests = sum(r.requests for r in rows)
    points = []
    for r in rows:
        pct = (r.requests / total_requests * 100.0) if total_requests > 0 else 0.0
        points.append(
            ModelDistributionPoint(
                model=r.model,
                requests=r.requests,
                percentage=round(pct, 1),
                total_cost=round(float(r.cost), 4)
            )
        )
    # Sort descending by requests
    points.sort(key=lambda x: x.requests, reverse=True)
    return points
