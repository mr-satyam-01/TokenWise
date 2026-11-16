from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_organization
from app.db.session import get_db
from app.models import Organization, Application
from app.schemas import AppCreate, AppOut

router = APIRouter(prefix="/applications", tags=["Applications"])


@router.get("/", response_model=List[AppOut])
async def list_applications(
    current_org: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Application)
        .where(Application.organization_id == current_org.id)
        .order_by(Application.created_at.desc())
    )
    apps = result.scalars().all()
    return [AppOut.model_validate(a) for a in apps]


@router.post("/", response_model=AppOut, status_code=status.HTTP_201_CREATED)
async def create_application(
    app_in: AppCreate,
    current_org: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db)
):
    app = Application(
        organization_id=current_org.id,
        name=app_in.name,
        environment=app_in.environment,
        content_capture_enabled=app_in.content_capture_enabled
    )
    db.add(app)
    await db.commit()
    await db.refresh(app)
    return AppOut.model_validate(app)
