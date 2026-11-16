from datetime import datetime, timedelta, timezone
from typing import Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_organization
from app.db.session import get_db
from app.models import Organization, LLMRequest, RequestContent, RequestProperty
from app.schemas import PaginatedRequestsOut, RequestListItemOut, RequestDetailOut

router = APIRouter(prefix="/requests", tags=["Requests"])


@router.get("/", response_model=PaginatedRequestsOut)
async def list_requests(
    current_org: Organization = Depends(get_current_organization),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    model: Optional[str] = None,
    provider: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    application_id: Optional[str] = None,
    search: Optional[str] = None,
    time_range: Optional[str] = Query("all"),  # 24h, 7d, 30d, all
    db: AsyncSession = Depends(get_db)
):
    query = select(LLMRequest).where(LLMRequest.organization_id == current_org.id)

    # Time filtering
    now = datetime.now(timezone.utc)
    if time_range == "24h":
        query = query.where(LLMRequest.created_at >= (now - timedelta(hours=24)))
    elif time_range == "7d":
        query = query.where(LLMRequest.created_at >= (now - timedelta(days=7)))
    elif time_range == "30d":
        query = query.where(LLMRequest.created_at >= (now - timedelta(days=30)))

    # Attribute filters
    if model:
        query = query.where(LLMRequest.model == model)
    if provider:
        query = query.where(LLMRequest.provider == provider)
    if status_filter:
        query = query.where(LLMRequest.status == status_filter)
    if user_id:
        query = query.where(LLMRequest.user_id == user_id)
    if session_id:
        query = query.where(LLMRequest.session_id == session_id)
    if application_id:
        query = query.where(LLMRequest.application_id == application_id)
    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                LLMRequest.request_id.ilike(search_pattern),
                LLMRequest.user_id.ilike(search_pattern),
                LLMRequest.prompt_name.ilike(search_pattern)
            )
        )

    # Count total matching
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    # Apply pagination & sorting
    offset = (page - 1) * page_size
    items_query = query.order_by(desc(LLMRequest.created_at)).offset(offset).limit(page_size)
    items = (await db.execute(items_query)).scalars().all()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    return PaginatedRequestsOut(
        items=[RequestListItemOut.model_validate(it) for it in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/{request_identifier}", response_model=RequestDetailOut)
async def get_request_detail(
    request_identifier: str,
    current_org: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db)
):
    # Lookup by either primary id or request_id
    query = select(LLMRequest).where(
        LLMRequest.organization_id == current_org.id,
        or_(
            LLMRequest.id == request_identifier,
            LLMRequest.request_id == request_identifier
        )
    )
    result = await db.execute(query)
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Request not found in this organization"
        )

    # Fetch content
    content_query = select(RequestContent).where(
        RequestContent.request_id == req.request_id,
        RequestContent.organization_id == current_org.id
    )
    content = (await db.execute(content_query)).scalar_one_or_none()

    # Fetch properties
    props_query = select(RequestProperty).where(
        RequestProperty.request_id == req.request_id,
        RequestProperty.organization_id == current_org.id
    )
    props = (await db.execute(props_query)).scalars().all()
    properties_dict = {p.key: p.value for p in props}

    return RequestDetailOut(
        id=req.id,
        request_id=req.request_id,
        application_id=req.application_id,
        provider=req.provider,
        model=req.model,
        user_id=req.user_id,
        session_id=req.session_id,
        prompt_name=req.prompt_name,
        prompt_version=req.prompt_version,
        input_tokens=req.input_tokens,
        output_tokens=req.output_tokens,
        total_tokens=req.total_tokens,
        estimated_cost=req.estimated_cost,
        currency=req.currency,
        latency_ms=req.latency_ms,
        status=req.status,
        error_type=req.error_type,
        created_at=req.created_at,
        input_content=content.input_content if content else None,
        output_content=content.output_content if content else None,
        properties=properties_dict
    )
