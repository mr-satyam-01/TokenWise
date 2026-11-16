from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_organization
from app.core.security import generate_api_key
from app.db.session import get_db
from app.models import Organization, ApiKey, Application
from app.schemas import ApiKeyCreate, ApiKeyCreatedOut, ApiKeyOut

router = APIRouter(prefix="/api-keys", tags=["API Keys"])


@router.get("/", response_model=List[ApiKeyOut])
async def list_api_keys(
    current_org: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ApiKey)
        .where(ApiKey.organization_id == current_org.id)
        .order_by(ApiKey.created_at.desc())
    )
    keys = result.scalars().all()
    return [ApiKeyOut.model_validate(k) for k in keys]


@router.post("/", response_model=ApiKeyCreatedOut, status_code=status.HTTP_201_CREATED)
async def create_api_key_endpoint(
    key_in: ApiKeyCreate,
    current_org: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db)
):
    # Verify application belongs to organization
    app_res = await db.execute(
        select(Application).where(
            Application.id == key_in.application_id,
            Application.organization_id == current_org.id
        )
    )
    if not app_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found in current organization"
        )

    full_key, prefix, key_hash = generate_api_key()
    api_key = ApiKey(
        organization_id=current_org.id,
        application_id=key_in.application_id,
        name=key_in.name,
        key_prefix=f"tw-live_{prefix}",
        key_hash=key_hash
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    return ApiKeyCreatedOut(
        id=api_key.id,
        name=api_key.name,
        key_prefix=api_key.key_prefix,
        key=full_key,
        application_id=api_key.application_id,
        created_at=api_key.created_at
    )


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: str,
    current_org: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.id == key_id,
            ApiKey.organization_id == current_org.id
        )
    )
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API Key not found"
        )

    api_key.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    return None
