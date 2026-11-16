import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
import bcrypt
import jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": str(subject), "exp": expire}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    try:
        decoded = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return decoded
    except Exception:
        return None


def generate_api_key(prefix_length: int = 8) -> Tuple[str, str, str]:
    """
    Generates a cryptographically secure TokenWise API key.
    Format: tw-live_{prefix}_{random_entropy}
    Returns: (full_key, key_prefix, key_hash)
    """
    prefix = secrets.token_hex(prefix_length // 2)
    secret_entropy = secrets.token_urlsafe(24)
    full_key = f"tw-live_{prefix}_{secret_entropy}"
    key_hash = hash_api_key(full_key)
    return full_key, prefix, key_hash


def hash_api_key(key: str) -> str:
    """Returns SHA-256 digest of API key for secure constant-time verification."""
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def verify_api_key(key: str, expected_hash: str) -> bool:
    computed_hash = hash_api_key(key)
    return hmac.compare_digest(computed_hash, expected_hash)
