from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import Forbidden, Unauthorized
from app.core.security import decode_token
from app.models import Role, User

bearer = HTTPBearer(auto_error=False)

DB = Annotated[Session, Depends(get_db)]


def user_from_token(db: Session, token: str) -> User:
    payload = decode_token(token)
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise Unauthorized("Account not found or disabled")
    return user


def get_current_user(
    db: DB, creds: HTTPAuthorizationCredentials | None = Depends(bearer)
) -> User:
    if not creds:
        raise Unauthorized("Not authenticated")
    return user_from_token(db, creds.credentials)


def get_optional_user(
    db: DB, creds: HTTPAuthorizationCredentials | None = Depends(bearer)
) -> User | None:
    if not creds:
        return None
    try:
        return user_from_token(db, creds.credentials)
    except Unauthorized:
        return None


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def require_roles(*roles: Role) -> Callable[..., User]:
    def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise Forbidden(f"Requires role: {', '.join(r.value for r in roles)}")
        return user

    return checker


CustomerUser = Annotated[User, Depends(require_roles(Role.CUSTOMER))]
VendorUser = Annotated[User, Depends(require_roles(Role.VENDOR))]
DeliveryUser = Annotated[User, Depends(require_roles(Role.DELIVERY))]
AdminUser = Annotated[User, Depends(require_roles(Role.ADMIN))]


class PageParams:
    def __init__(self, page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100)):
        self.page = page
        self.size = size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size


Pagination = Annotated[PageParams, Depends()]
