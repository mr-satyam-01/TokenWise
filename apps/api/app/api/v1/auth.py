import re
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.security import hash_password, verify_password, create_access_token, generate_api_key
from app.db.session import get_db
from app.models import User, Organization, OrganizationMember, Application, ApiKey
from app.schemas import UserCreate, UserLogin, UserOut, TokenOut

router = APIRouter(prefix="/auth", tags=["Authentication"])


def slugify(text: str) -> str:
    s = re.sub(r"[^\w\s-]", "", text).strip().lower()
    return re.sub(r"[-\s]+", "-", s)


@router.post("/signup", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def signup(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user exists
    existing = await db.execute(select(User).where(User.email == user_in.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists"
        )

    # Create user
    user = User(
        email=user_in.email.lower(),
        hashed_password=hash_password(user_in.password),
        full_name=user_in.full_name or user_in.email.split("@")[0]
    )
    db.add(user)
    await db.flush()

    # Create default organization
    org_name = user_in.organization_name or f"{user.full_name}'s Org"
    slug = slugify(org_name) + f"-{user.id[:4]}"
    org = Organization(name=org_name, slug=slug)
    db.add(org)
    await db.flush()

    # Create owner membership
    member = OrganizationMember(organization_id=org.id, user_id=user.id, role="owner")
    db.add(member)

    # Create default application
    app = Application(
        organization_id=org.id,
        name="Production App",
        environment="production",
        content_capture_enabled=True
    )
    db.add(app)
    await db.flush()

    # Generate initial API key for the user
    full_key, prefix, key_hash = generate_api_key()
    api_key = ApiKey(
        organization_id=org.id,
        application_id=app.id,
        name="Default Secret Key",
        key_prefix=f"tw-live_{prefix}",
        key_hash=key_hash
    )
    db.add(api_key)

    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id)
    return TokenOut(access_token=token, token_type="bearer", user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == credentials.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(user.id)
    return TokenOut(access_token=token, token_type="bearer", user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)
