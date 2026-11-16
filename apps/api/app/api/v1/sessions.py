from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, desc, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_organization
from app.db.session import get_db
from app.models import Organization, Session, LLMRequest
from app.schemas import SessionListItemOut, SessionDetailOut, RequestListItemOut

router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.get("/", response_model=List[SessionListItemOut])
async def list_sessions(
    current_org: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db)
):
    # Query sessions aggregated with requests
    query = (
        select(
            Session.id,
            Session.external_session_id,
            Session.application_id,
            Session.user_id,
            func.count(LLMRequest.id).label("request_count"),
            func.coalesce(func.sum(LLMRequest.estimated_cost), 0.0).label("total_cost"),
            func.coalesce(func.sum(LLMRequest.total_tokens), 0).label("total_tokens"),
            func.coalesce(func.avg(LLMRequest.latency_ms), 0.0).label("avg_latency"),
            func.coalesce(
                func.sum(case((LLMRequest.status == "error", 1), else_=0)), 0
            ).label("error_count"),
            func.coalesce(func.min(LLMRequest.created_at), Session.created_at).label("started_at"),
            func.coalesce(func.max(LLMRequest.created_at), Session.updated_at).label("last_activity_at")
        )
        .outerjoin(
            LLMRequest,
            (LLMRequest.session_id == Session.external_session_id) & (LLMRequest.organization_id == current_org.id)
        )
        .where(Session.organization_id == current_org.id)
        .group_by(Session.id)
        .order_by(desc("last_activity_at"))
    )

    rows = (await db.execute(query)).all()
    results = []
    for r in rows:
        results.append(
            SessionListItemOut(
                id=r.id,
                external_session_id=r.external_session_id,
                application_id=r.application_id,
                user_id=r.user_id,
                request_count=r.request_count,
                total_cost=round(float(r.total_cost), 6),
                total_tokens=int(r.total_tokens),
                avg_latency_ms=round(float(r.avg_latency), 1),
                error_count=int(r.error_count),
                started_at=r.started_at,
                last_activity_at=r.last_activity_at
            )
        )
    return results


@router.get("/{session_identifier}", response_model=SessionDetailOut)
async def get_session_details(
    session_identifier: str,
    current_org: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db)
):
    # Lookup session
    sess_query = select(Session).where(
        Session.organization_id == current_org.id,
        (Session.id == session_identifier) | (Session.external_session_id == session_identifier)
    )
    session_obj = (await db.execute(sess_query)).scalar_one_or_none()
    if not session_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )

    # Fetch ordered request timeline for this session
    reqs_query = (
        select(LLMRequest)
        .where(
            LLMRequest.organization_id == current_org.id,
            LLMRequest.session_id == session_obj.external_session_id
        )
        .order_by(LLMRequest.created_at.asc())
    )
    requests = (await db.execute(reqs_query)).scalars().all()

    total_cost = sum(r.estimated_cost for r in requests)
    total_tokens = sum(r.total_tokens for r in requests)
    error_count = sum(1 for r in requests if r.status == "error")
    avg_latency = (sum(r.latency_ms for r in requests) / len(requests)) if requests else 0.0

    return SessionDetailOut(
        id=session_obj.id,
        external_session_id=session_obj.external_session_id,
        application_id=session_obj.application_id,
        user_id=session_obj.user_id,
        request_count=len(requests),
        total_cost=round(total_cost, 6),
        total_tokens=total_tokens,
        avg_latency_ms=round(avg_latency, 1),
        error_count=error_count,
        started_at=requests[0].created_at if requests else session_obj.created_at,
        last_activity_at=requests[-1].created_at if requests else session_obj.updated_at,
        requests=[RequestListItemOut.model_validate(r) for r in requests]
    )
