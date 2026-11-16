import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_organization, get_current_user
from app.db.session import get_db
from app.models import Organization, User, Prompt, PromptVersion, LLMRequest
from app.schemas import (
    PromptCreate, PromptVersionCreate, PromptOut, PromptVersionOut
)

router = APIRouter(prefix="/prompts", tags=["Prompts"])


@router.get("/", response_model=List[PromptOut])
async def list_prompts(
    current_org: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Prompt)
        .where(Prompt.organization_id == current_org.id)
        .order_by(Prompt.updated_at.desc())
    )
    prompts = (await db.execute(query)).scalars().all()

    results = []
    for p in prompts:
        # Get latest version
        v_query = (
            select(PromptVersion)
            .where(PromptVersion.prompt_id == p.id)
            .order_by(desc(PromptVersion.version))
            .limit(1)
        )
        latest_v = (await db.execute(v_query)).scalar_one_or_none()

        # Count total versions
        v_count_query = select(func.count(PromptVersion.id)).where(PromptVersion.prompt_id == p.id)
        v_count = (await db.execute(v_count_query)).scalar_one()

        # Count associated requests
        req_count_query = select(func.count(LLMRequest.id)).where(
            LLMRequest.organization_id == current_org.id,
            LLMRequest.prompt_name == p.name
        )
        req_count = (await db.execute(req_count_query)).scalar_one()

        results.append(
            PromptOut(
                id=p.id,
                name=p.name,
                description=p.description,
                created_at=p.created_at,
                updated_at=p.updated_at,
                latest_version=PromptVersionOut.model_validate(latest_v) if latest_v else None,
                versions_count=v_count,
                requests_count=req_count
            )
        )

    return results


@router.post("/", response_model=PromptOut, status_code=status.HTTP_201_CREATED)
async def create_prompt(
    prompt_in: PromptCreate,
    current_org: Organization = Depends(get_current_organization),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Check if prompt name already exists in org
    existing = await db.execute(
        select(Prompt).where(
            Prompt.organization_id == current_org.id,
            Prompt.name == prompt_in.name
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Prompt with name '{prompt_in.name}' already exists in this organization"
        )

    prompt = Prompt(
        organization_id=current_org.id,
        name=prompt_in.name,
        description=prompt_in.description
    )
    db.add(prompt)
    await db.flush()

    # Create immutable version 1
    config_json = json.dumps(prompt_in.configuration) if prompt_in.configuration else None
    version_1 = PromptVersion(
        prompt_id=prompt.id,
        version=1,
        template=prompt_in.template,
        model=prompt_in.model,
        configuration=config_json,
        created_by=current_user.email
    )
    db.add(version_1)
    await db.commit()
    await db.refresh(prompt)
    await db.refresh(version_1)

    return PromptOut(
        id=prompt.id,
        name=prompt.name,
        description=prompt.description,
        created_at=prompt.created_at,
        updated_at=prompt.updated_at,
        latest_version=PromptVersionOut.model_validate(version_1),
        versions_count=1,
        requests_count=0
    )


@router.get("/{prompt_id}/versions", response_model=List[PromptVersionOut])
async def list_prompt_versions(
    prompt_id: str,
    current_org: Organization = Depends(get_current_organization),
    db: AsyncSession = Depends(get_db)
):
    # Check org ownership
    p_res = await db.execute(
        select(Prompt).where(
            Prompt.id == prompt_id,
            Prompt.organization_id == current_org.id
        )
    )
    if not p_res.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")

    v_res = await db.execute(
        select(PromptVersion)
        .where(PromptVersion.prompt_id == prompt_id)
        .order_by(desc(PromptVersion.version))
    )
    versions = v_res.scalars().all()
    return [PromptVersionOut.model_validate(v) for v in versions]


@router.post("/{prompt_id}/versions", response_model=PromptVersionOut, status_code=status.HTTP_201_CREATED)
async def create_new_prompt_version(
    prompt_id: str,
    version_in: PromptVersionCreate,
    current_org: Organization = Depends(get_current_organization),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    p_res = await db.execute(
        select(Prompt).where(
            Prompt.id == prompt_id,
            Prompt.organization_id == current_org.id
        )
    )
    prompt = p_res.scalar_one_or_none()
    if not prompt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")

    # Get max current version
    max_v = (await db.execute(
        select(func.coalesce(func.max(PromptVersion.version), 0))
        .where(PromptVersion.prompt_id == prompt.id)
    )).scalar_one()

    new_version_num = max_v + 1
    config_json = json.dumps(version_in.configuration) if version_in.configuration else None

    new_version = PromptVersion(
        prompt_id=prompt.id,
        version=new_version_num,
        template=version_in.template,
        model=version_in.model,
        configuration=config_json,
        created_by=current_user.email
    )
    db.add(new_version)
    prompt.updated_at = func.now()
    await db.commit()
    await db.refresh(new_version)

    return PromptVersionOut.model_validate(new_version)
