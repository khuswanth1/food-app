from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import settings
from app.core.exceptions import Unauthorized


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def _create_token(sub: int, role: str, kind: str, ttl: timedelta) -> str:
    now = datetime.now(UTC)
    payload = {"sub": str(sub), "role": role, "type": kind, "iat": now, "exp": now + ttl}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: int, role: str) -> str:
    return _create_token(user_id, role, "access", timedelta(minutes=settings.ACCESS_TOKEN_MINUTES))


def create_refresh_token(user_id: int, role: str) -> str:
    return _create_token(user_id, role, "refresh", timedelta(days=settings.REFRESH_TOKEN_DAYS))


def create_google_ticket(user_id: int, role: str) -> str:
    """Short-lived one-time ticket handed to the web app after Google sign-in."""
    return _create_token(user_id, role, "google_ticket", timedelta(minutes=2))


def decode_token(token: str, expected_type: str = "access") -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as e:
        raise Unauthorized("Token expired", code="token_expired") from e
    except jwt.PyJWTError as e:
        raise Unauthorized("Invalid token") from e
    if payload.get("type") != expected_type:
        raise Unauthorized("Wrong token type")
    return payload
