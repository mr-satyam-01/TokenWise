from typing import Optional, Tuple
from fastapi import Depends, HTTPException, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token, hash_api_key
from app.db.session import get_db
from app.models import User, Organization, OrganizationMember, ApiKey, Application

security_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: AsyncSession = Depends(get_db)
) -> User:
    if not auth:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(auth.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload["sub"]
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


async def get_current_organization(
    current_user: User = Depends(get_current_user),
    x_organization_id: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> Organization:
    """Resolves the current organization with strict membership authorization."""
    query = (
        select(Organization)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
        .where(OrganizationMember.user_id == current_user.id)
    )
    if x_organization_id:
        query = query.where(Organization.id == x_organization_id)

    result = await db.execute(query)
    org = result.scalars().first()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization not found or access denied",
        )
    return org


class GatewayContext:
    def __init__(self, api_key: ApiKey, application: Application, organization: Organization):
        self.api_key = api_key
        self.application = application
        self.organization = organization


async def get_gateway_context(
    authorization: Optional[str] = Header(None),
    x_tokenwise_api_key: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> GatewayContext:
    """
    Authenticates incoming LLM gateway requests.
    Supports either 'Authorization: Bearer tw-live_...' or 'x-tokenwise-api-key: tw-live_...'.
    Validates key hash and revocation status in constant-time.
    """
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    elif x_tokenwise_api_key:
        token = x_tokenwise_api_key.strip()

    if not token or not token.startswith("tw-live_"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed TokenWise API key (must begin with 'tw-live_')",
            headers={"WWW-Authenticate": "Bearer"},
        )

    computed_hash = hash_api_key(token)
    result = await db.execute(
        select(ApiKey, Application, Organization)
        .join(Application, Application.id == ApiKey.application_id)
        .join(Organization, Organization.id == ApiKey.organization_id)
        .where(ApiKey.key_hash == computed_hash)
    )
    row = result.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid TokenWise API key",
        )

    api_key_obj, app_obj, org_obj = row
    if api_key_obj.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This TokenWise API key has been revoked",
        )

    return GatewayContext(api_key=api_key_obj, application=app_obj, organization=org_obj)
