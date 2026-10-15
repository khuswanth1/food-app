"""Google sign-in via the OAuth 2.0 authorization-code flow (server side).

1. ``/auth/google/login`` redirects the browser to Google with a signed ``state`` (CSRF nonce + requested role).
2. Google redirects back to ``/auth/google/callback``; the code is exchanged for an ID token here, server to server.
3. The user is found or created, and the browser is sent to the web app with a short-lived one-time ticket that
   the app swaps for normal QuickKart tokens via ``POST /auth/google/exchange``.

The ID token comes straight from Google's token endpoint over TLS, so per OpenID Connect Core §3.1.3.7 its
signature check may be skipped; issuer, audience, expiry and email verification are still enforced.
"""
import logging
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AppError, Forbidden, Unauthorized
from app.models import Role, User
from app.services.notify import audit, notify

log = logging.getLogger("quickkart.google")

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
STATE_TTL = timedelta(minutes=10)
# Google-only accounts get a hash bcrypt can never match, so password login stays closed for them.
NO_PASSWORD = "!google"


def _sign(payload: dict, ttl: timedelta) -> str:
    now = datetime.now(UTC)
    return jwt.encode({**payload, "iat": now, "exp": now + ttl}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def authorization_url(role: str) -> tuple[str, str]:
    """Return (Google consent URL, nonce). The nonce goes in a cookie and must come back inside ``state``."""
    nonce = secrets.token_urlsafe(24)
    state = _sign({"type": "google_state", "nonce": nonce, "role": role}, STATE_TTL)
    params = {
        "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
    }
    return f"{AUTH_URL}?{urlencode(params)}", nonce


def read_state(state: str, nonce: str | None) -> str:
    """Validate ``state`` against the cookie nonce and return the requested role."""
    try:
        data = jwt.decode(state, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError as e:
        raise Unauthorized("Sign-in link expired, please try again", code="google_state") from e
    if data.get("type") != "google_state" or not nonce or not secrets.compare_digest(data.get("nonce", ""), nonce):
        raise Unauthorized("Sign-in could not be verified, please try again", code="google_state")
    return data.get("role", "customer")


def exchange_code(code: str, transport: httpx.BaseTransport | None = None) -> dict:
    """Swap the authorization code for Google's ID token and return its verified claims."""
    try:
        with httpx.Client(timeout=10, transport=transport) as client:
            r = client.post(TOKEN_URL, data={
                "code": code,
                "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
                "grant_type": "authorization_code",
            })
    except httpx.HTTPError as e:
        log.warning("Google token request failed: %s", e)
        raise AppError("Could not reach Google, please try again", code="google_unavailable", status_code=502) from e
    if r.status_code != 200:
        log.warning("Google token exchange rejected (%s): %s", r.status_code, r.text[:300])
        raise Unauthorized("Google sign-in failed, please try again", code="google_failed")

    try:
        claims = jwt.decode(r.json()["id_token"], options={"verify_signature": False, "verify_aud": True, "verify_exp": True},
                            audience=settings.GOOGLE_OAUTH_CLIENT_ID, algorithms=["RS256"])
    except (KeyError, ValueError, jwt.PyJWTError) as e:
        raise Unauthorized("Google returned an invalid response", code="google_failed") from e
    if claims.get("iss") not in ISSUERS or not claims.get("sub"):
        raise Unauthorized("Google returned an invalid response", code="google_failed")
    if not claims.get("email") or not claims.get("email_verified"):
        raise Unauthorized("Your Google email address is not verified", code="google_unverified")
    return claims


def upsert_user(db: Session, claims: dict, role: str) -> User:
    """Find the user by Google id, else link an existing account with the same verified email, else sign up."""
    sub, email = claims["sub"], claims["email"].lower()
    user = db.scalar(select(User).where(User.google_sub == sub))
    if user is None:
        user = db.scalar(select(User).where(User.email == email))
        if user is not None:
            user.google_sub = sub
            audit(db, user.id, "user.google_linked", "user", user.id)
    if user is None:
        name = (claims.get("name") or email.split("@")[0]).strip()[:120]
        user = User(email=email, password_hash=NO_PASSWORD, full_name=name if len(name) >= 2 else email[:120],
                    role=Role(role), google_sub=sub, avatar_url=claims.get("picture"))
        db.add(user)
        db.flush()
        notify(db, user.id, "Welcome to QuickKart!", "Your account is ready. Happy ordering!", kind="info")
        audit(db, user.id, "user.registered", "user", user.id, {"role": role, "via": "google"})
    if not user.is_active:
        raise Forbidden("Your account has been suspended", code="account_disabled")
    if not user.avatar_url and claims.get("picture"):
        user.avatar_url = claims["picture"]
    audit(db, user.id, "user.login", "user", user.id, {"via": "google"})
    db.commit()
    return user
