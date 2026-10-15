from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select

from app.core.cache import cache
from app.core.deps import DB, AdminUser, Pagination
from app.core.exceptions import Conflict, NotFound
from app.core.security import hash_password
from app.models import (
    AuditLog, Coupon, Order, OrderStatus, Payment, PaymentStatus, Product, Review, Role, Store, SupportTicket, User,
)
from app.routers.orders import ORDER_LOAD, load_order
from app.schemas.common import Message, Page
from app.schemas.misc import AuditOut, CouponIn, CouponOut, ReviewOut, TicketOut, TicketReply
from app.schemas.order import CancelIn, OrderOut, PaymentOut
from app.schemas.store import ProductOut, StoreOut
from app.schemas.user import UserOut
from app.services import analytics
from app.services import orders as order_svc
from app.services.notify import audit, notify

router = APIRouter(prefix="/admin", tags=["Admin"])


def _page(db, base, pg, order_by):
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.scalars(base.order_by(order_by).offset(pg.offset).limit(pg.size)).all()
    return Page.build(rows, total, pg.page, pg.size)


# ---- analytics & reports -----------------------------------------------------
@router.get("/analytics")
def overview(admin: AdminUser, db: DB, days: int = 30):
    users_by_role = {r.value: c for r, c in db.execute(select(User.role, func.count(User.id)).group_by(User.role))}
    pay_methods = {m: c for m, c in db.execute(
        select(Order.payment_method, func.count(Order.id)).where(Order.status != OrderStatus.CANCELLED)
        .group_by(Order.payment_method))}
    top_stores = [
        {"id": i, "name": n, "orders": c, "revenue": round(float(r), 2)}
        for i, n, c, r in db.execute(
            select(Store.id, Store.name, func.count(Order.id), func.coalesce(func.sum(Order.total), 0))
            .join(Order, Order.store_id == Store.id).where(Order.status != OrderStatus.CANCELLED)
            .group_by(Store.id, Store.name).order_by(func.sum(Order.total).desc()).limit(5))
    ]
    return {
        "totals": analytics.totals(db),
        "users_by_role": users_by_role,
        "stores": db.scalar(select(func.count(Store.id))),
        "pending_stores": db.scalar(select(func.count(Store.id)).where(Store.is_approved.is_(False))),
        "open_tickets": db.scalar(select(func.count(SupportTicket.id)).where(SupportTicket.status != "resolved")),
        "daily": analytics.daily_series(db, days),
        "status_breakdown": analytics.status_breakdown(db),
        "payment_methods": pay_methods,
        "top_stores": top_stores,
        "top_products": analytics.top_products(db),
    }


@router.get("/reports/sales")
def sales_report(admin: AdminUser, db: DB, days: int = 30):
    since = datetime.now(UTC) - timedelta(days=days)
    rows = db.execute(
        select(Store.name, func.count(Order.id), func.coalesce(func.sum(Order.subtotal), 0),
               func.coalesce(func.sum(Order.discount), 0), func.coalesce(func.sum(Order.delivery_fee), 0),
               func.coalesce(func.sum(Order.tax), 0), func.coalesce(func.sum(Order.total), 0))
        .join(Order, Order.store_id == Store.id)
        .where(Order.created_at >= since, Order.status != OrderStatus.CANCELLED)
        .group_by(Store.name).order_by(func.sum(Order.total).desc())
    ).all()
    keys = ["store", "orders", "subtotal", "discount", "delivery_fees", "tax", "gmv"]
    data = [dict(zip(keys, [r[0], r[1], *[round(float(x), 2) for x in r[2:]]])) for r in rows]
    summary = {k: round(sum(d[k] for d in data), 2) for k in keys[1:]}
    return {"days": days, "rows": data, "summary": summary}


# ---- users -------------------------------------------------------------------
class AdminUserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2)
    password: str = Field(min_length=8)
    role: Role


@router.get("/users", response_model=Page[UserOut])
def users(admin: AdminUser, db: DB, pg: Pagination, role: Role | None = None, q: str | None = None):
    base = select(User)
    if role:
        base = base.where(User.role == role)
    if q:
        base = base.where(or_(User.email.ilike(f"%{q}%"), User.full_name.ilike(f"%{q}%")))
    return _page(db, base, pg, User.id.desc())


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: AdminUserCreate, admin: AdminUser, db: DB):
    if db.scalar(select(User.id).where(User.email == body.email.lower())):
        raise Conflict("Email already registered", code="email_taken")
    u = User(email=body.email.lower(), full_name=body.full_name, password_hash=hash_password(body.password),
             role=body.role)
    db.add(u)
    db.flush()
    audit(db, admin.id, "user.created", "user", u.id, {"role": body.role.value})
    db.commit()
    return u


@router.post("/users/{user_id}/toggle-active", response_model=UserOut)
def toggle_user(user_id: int, admin: AdminUser, db: DB):
    u = db.get(User, user_id)
    if not u:
        raise NotFound("User not found")
    if u.id == admin.id:
        raise Conflict("You cannot suspend yourself")
    u.is_active = not u.is_active
    audit(db, admin.id, "user.activated" if u.is_active else "user.suspended", "user", u.id)
    db.commit()
    return u


# ---- vendors / stores --------------------------------------------------------
@router.get("/stores", response_model=Page[StoreOut])
def stores(admin: AdminUser, db: DB, pg: Pagination, pending: bool = False, q: str | None = None):
    base = select(Store)
    if pending:
        base = base.where(Store.is_approved.is_(False))
    if q:
        base = base.where(Store.name.ilike(f"%{q}%"))
    return _page(db, base, pg, Store.id.desc())


@router.post("/stores/{store_id}/approval", response_model=StoreOut)
def set_approval(store_id: int, approved: bool, admin: AdminUser, db: DB):
    s = db.get(Store, store_id)
    if not s:
        raise NotFound("Store not found")
    s.is_approved = approved
    notify(db, s.vendor_id, "Store approved" if approved else "Store suspended",
           f"{s.name} is {'now live on QuickKart' if approved else 'hidden from customers'}", kind="info",
           link="/vendor/stores")
    audit(db, admin.id, "store.approved" if approved else "store.suspended", "store", s.id)
    db.commit()
    cache.invalidate("qk:stores:")
    cache.invalidate("qk:reco:")
    return s


# ---- orders & payments -------------------------------------------------------
@router.get("/orders", response_model=Page[OrderOut])
def orders(admin: AdminUser, db: DB, pg: Pagination, status: OrderStatus | None = None, q: str | None = None):
    base = select(Order).options(*ORDER_LOAD)
    if status:
        base = base.where(Order.status == status)
    if q:
        base = base.where(Order.order_number.ilike(f"%{q}%"))
    return _page(db, base, pg, Order.created_at.desc())


@router.post("/orders/{order_id}/cancel", response_model=OrderOut)
def admin_cancel(order_id: int, body: CancelIn, admin: AdminUser, db: DB):
    return order_svc.cancel(db, admin, load_order(db, order_id, admin), body.reason)


@router.get("/payments", response_model=Page[PaymentOut])
def payments(admin: AdminUser, db: DB, pg: Pagination, status: PaymentStatus | None = None):
    base = select(Payment)
    if status:
        base = base.where(Payment.status == status)
    return _page(db, base, pg, Payment.id.desc())


# ---- products ----------------------------------------------------------------
@router.get("/products", response_model=Page[ProductOut])
def products(admin: AdminUser, db: DB, pg: Pagination, q: str | None = None, low_stock: bool = False):
    base = select(Product)
    if q:
        base = base.where(Product.name.ilike(f"%{q}%"))
    if low_stock:
        base = base.where(Product.stock <= Product.low_stock_threshold)
    return _page(db, base, pg, Product.id.desc())


@router.post("/products/{product_id}/toggle", response_model=ProductOut)
def toggle_product(product_id: int, admin: AdminUser, db: DB):
    p = db.get(Product, product_id)
    if not p:
        raise NotFound("Product not found")
    p.is_available = not p.is_available
    audit(db, admin.id, "product.enabled" if p.is_available else "product.disabled", "product", p.id)
    db.commit()
    return p


# ---- coupons -----------------------------------------------------------------
@router.get("/coupons", response_model=list[CouponOut])
def coupons(admin: AdminUser, db: DB):
    return db.scalars(select(Coupon).order_by(Coupon.id.desc())).all()


@router.post("/coupons", response_model=CouponOut, status_code=status.HTTP_201_CREATED)
def create_coupon(body: CouponIn, admin: AdminUser, db: DB):
    if db.scalar(select(Coupon.id).where(Coupon.code == body.code)):
        raise Conflict("Coupon code exists", code="coupon_exists")
    c = Coupon(**body.model_dump())
    db.add(c)
    db.flush()
    audit(db, admin.id, "coupon.created", "coupon", c.id, {"code": c.code})
    db.commit()
    return c


@router.put("/coupons/{coupon_id}", response_model=CouponOut)
def update_coupon(coupon_id: int, body: CouponIn, admin: AdminUser, db: DB):
    c = db.get(Coupon, coupon_id)
    if not c:
        raise NotFound("Coupon not found")
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    audit(db, admin.id, "coupon.updated", "coupon", c.id)
    db.commit()
    return c


@router.delete("/coupons/{coupon_id}", response_model=Message)
def delete_coupon(coupon_id: int, admin: AdminUser, db: DB):
    c = db.get(Coupon, coupon_id)
    if not c:
        raise NotFound("Coupon not found")
    db.delete(c)
    audit(db, admin.id, "coupon.deleted", "coupon", coupon_id)
    db.commit()
    return Message(message="Coupon deleted")


# ---- reviews -----------------------------------------------------------------
@router.get("/reviews", response_model=Page[ReviewOut])
def reviews(admin: AdminUser, db: DB, pg: Pagination, max_rating: int = 5):
    return _page(db, select(Review).where(Review.rating <= max_rating), pg, Review.id.desc())


@router.post("/reviews/{review_id}/toggle-hidden", response_model=ReviewOut)
def hide_review(review_id: int, admin: AdminUser, db: DB):
    r = db.get(Review, review_id)
    if not r:
        raise NotFound("Review not found")
    r.is_hidden = not r.is_hidden
    audit(db, admin.id, "review.hidden" if r.is_hidden else "review.restored", "review", r.id)
    db.commit()
    return r


# ---- support -----------------------------------------------------------------
@router.get("/support", response_model=list[TicketOut])
def tickets(admin: AdminUser, db: DB, status: str | None = None):
    base = select(SupportTicket)
    if status:
        base = base.where(SupportTicket.status == status)
    return db.scalars(base.order_by(SupportTicket.id.desc())).all()


@router.post("/support/{ticket_id}/reply", response_model=TicketOut)
def reply(ticket_id: int, body: TicketReply, admin: AdminUser, db: DB):
    t = db.get(SupportTicket, ticket_id)
    if not t:
        raise NotFound("Ticket not found")
    t.admin_reply, t.status = body.reply, body.status
    notify(db, t.user_id, f"Update on ticket #{t.id}", body.reply[:200], kind="support", link="/support")
    audit(db, admin.id, "ticket.replied", "ticket", t.id, {"status": body.status})
    db.commit()
    return t


# ---- audit -------------------------------------------------------------------
@router.get("/audit-logs", response_model=Page[AuditOut])
def audit_logs(admin: AdminUser, db: DB, pg: Pagination, action: str | None = None, actor_id: int | None = None):
    base = select(AuditLog)
    if action:
        base = base.where(AuditLog.action.ilike(f"%{action}%"))
    if actor_id:
        base = base.where(AuditLog.actor_id == actor_id)
    return _page(db, base, pg, AuditLog.id.desc())
