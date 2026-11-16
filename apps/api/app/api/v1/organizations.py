import re
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_organization
from app.db.session import get_db
from app.models import User, Organization, OrganizationMember
from app.schemas import OrgCreate, OrgOut

router = APIRouter(prefix="/organizations", tags=["Organizations"])


def slugify(text: str) -> str:
    s = re.sub(r"[^\w\s-]", "", text).strip().lower()
    return re.sub(r"[-\s]+", "-", s)


@router.get("/current", response_model=OrgOut)
async def get_current_org_endpoint(
    current_org: Organization = Depends(get_current_organization)
):
    return OrgOut.model_validate(current_org)


@router.get("/", response_model=List[OrgOut])
async def list_user_organizations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Organization)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
        .where(OrganizationMember.user_id == current_user.id)
    )
    orgs = result.scalars().all()
    return [OrgOut.model_validate(o) for o in orgs]


@router.post("/", response_model=OrgOut, status_code=status.HTTP_201_CREATED)
async def create_organization(
    org_in: OrgCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    slug_base = slugify(org_in.name)
    slug = f"{slug_base}-{current_user.id[:6]}"
    
    org = Organization(name=org_in.name, slug=slug)
    db.add(org)
    await db.flush()

    member = OrganizationMember(organization_id=org.id, user_id=current_user.id, role="owner")
    db.add(member)
    await db.commit()
    await db.refresh(org)

    return OrgOut.model_validate(org)
