from typing import Literal
from urllib.parse import urlencode

from fastapi import APIRouter, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import DB, CurrentUser
from app.core.exceptions import AppError, Conflict, Forbidden, NotFound, Unauthorized
from app.core.security import (
    create_access_token, create_google_ticket, create_refresh_token, decode_token, hash_password, verify_password,
)
from app.models import Role, User
from app.schemas.user import GoogleExchangeIn, LoginIn, RefreshIn, RegisterIn, TokenOut, UserOut
from app.services import google_oauth
from app.services.notify import audit, notify

router = APIRouter(prefix="/auth", tags=["Auth"])


def _tokens(user: User) -> TokenOut:
    return TokenOut(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id, user.role.value),
        user=UserOut.model_validate(user),
    )


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, db: DB):
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise Conflict("An account with this email already exists", code="email_taken")
    user = User(email=body.email.lower(), password_hash=hash_password(body.password), full_name=body.full_name,
                phone=body.phone, role=Role(body.role))
    db.add(user)
    db.flush()
    notify(db, user.id, "Welcome to QuickKart!", "Your account is ready. Happy ordering!", kind="info")
    audit(db, user.id, "user.registered", "user", user.id, {"role": body.role})
    db.commit()
    return _tokens(user)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: DB):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise Unauthorized("Incorrect email or password", code="invalid_credentials")
    if not user.is_active:
        raise Forbidden("Your account has been suspended", code="account_disabled")
    audit(db, user.id, "user.login", "user", user.id)
    db.commit()
    return _tokens(user)


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, db: DB):
    payload = decode_token(body.refresh_token, expected_type="refresh")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise Unauthorized("Account not found or disabled")
    return _tokens(user)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


# ---------- Google sign-in ----------
STATE_COOKIE = "qk_google_state"
COOKIE_PATH = "/api/v1/auth/google"


@router.get("/providers")
def providers():
    """Which external sign-in options the web app should show."""
    return {"google": settings.google_enabled}


@router.get("/google/login", include_in_schema=settings.google_enabled)
def google_login(role: Literal["customer", "vendor", "delivery"] = "customer"):
    """Browser navigation entry point: redirects to Google's consent screen."""
    if not settings.google_enabled:
        raise NotFound("Google sign-in is not configured", code="google_disabled")
    url, nonce = google_oauth.authorization_url(role)
    resp = RedirectResponse(url, status_code=status.HTTP_302_FOUND)
    resp.set_cookie(STATE_COOKIE, nonce, max_age=int(google_oauth.STATE_TTL.total_seconds()), path=COOKIE_PATH,
                    httponly=True, samesite="lax", secure=settings.ENV == "production")
    return resp


def _to_frontend(path: str, fragment: dict) -> RedirectResponse:
    # Fragments never reach servers or Referer headers, so the one-time ticket stays in the browser.
    resp = RedirectResponse(f"{settings.FRONTEND_URL.rstrip('/')}{path}#{urlencode(fragment)}",
                            status_code=status.HTTP_302_FOUND)
    resp.delete_cookie(STATE_COOKIE, path=COOKIE_PATH)
    return resp


@router.get("/google/callback", include_in_schema=False)
def google_callback(request: Request, db: DB, code: str | None = None, state: str | None = None,
                    error: str | None = None):
    if error or not code or not state:
        return _to_frontend("/auth/google", {"error": "google_cancelled" if error == "access_denied" else "google_failed"})
    try:
        role = google_oauth.read_state(state, request.cookies.get(STATE_COOKIE))
        user = google_oauth.upsert_user(db, google_oauth.exchange_code(code), role)
    except AppError as e:
        db.rollback()
        return _to_frontend("/auth/google", {"error": e.code})
    ticket = create_google_ticket(user.id, user.role.value)
    return _to_frontend("/auth/google", {"ticket": ticket})


@router.post("/google/exchange", response_model=TokenOut)
def google_exchange(body: GoogleExchangeIn, db: DB):
    """Swap the one-time ticket from the Google callback for QuickKart access/refresh tokens."""
    payload = decode_token(body.ticket, expected_type="google_ticket")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise Unauthorized("Account not found or disabled")
    return _tokens(user)
