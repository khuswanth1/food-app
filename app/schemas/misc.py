from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORM


class ReviewIn(BaseModel):
    order_id: int
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=1000)


class ReviewUser(ORM):
    id: int
    full_name: str


class ReviewOut(ORM):
    id: int
    store_id: int
    order_id: int | None
    rating: int
    comment: str
    is_hidden: bool
    created_at: datetime
    user: ReviewUser


class CouponIn(BaseModel):
    code: str = Field(min_length=3, max_length=30, pattern=r"^[A-Z0-9_-]+$")
    description: str = ""
    discount_type: Literal["percent", "flat"]
    value: float = Field(gt=0)
    max_discount: float | None = Field(default=None, gt=0)
    min_order: float = Field(default=0, ge=0)
    usage_limit: int | None = Field(default=None, ge=1)
    valid_until: datetime | None = None
    store_id: int | None = None
    is_active: bool = True


class CouponOut(ORM, CouponIn):
    id: int
    used_count: int


class NotificationOut(ORM):
    id: int
    title: str
    body: str
    kind: str
    link: str | None
    is_read: bool
    created_at: datetime


class TicketIn(BaseModel):
    subject: str = Field(min_length=3, max_length=160)
    message: str = Field(min_length=5, max_length=4000)
    order_id: int | None = None


class TicketReply(BaseModel):
    reply: str = Field(min_length=1, max_length=4000)
    status: Literal["open", "in_progress", "resolved"] = "resolved"


class TicketOut(ORM):
    id: int
    user_id: int
    order_id: int | None
    subject: str
    message: str
    status: str
    admin_reply: str | None
    created_at: datetime


class AuditOut(ORM):
    id: int
    actor_id: int | None
    action: str
    entity: str
    entity_id: int | None
    details: dict | None
    created_at: datetime
