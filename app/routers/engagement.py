"""Favorites, notifications, support tickets, offers and recommendations."""
from datetime import UTC, datetime

from fastapi import APIRouter, status
from sqlalchemy import func, select, update

from app.core.deps import DB, CurrentUser, CustomerUser, OptionalUser, Pagination
from app.core.exceptions import NotFound
from app.models import Coupon, Favorite, Notification, Order, Role, Store, SupportTicket, User
from app.schemas.common import Message, Page
from app.schemas.misc import NotificationOut, TicketIn, TicketOut
from app.schemas.store import ProductOut, StoreOut
from app.routers.stores import favorite_ids, store_out
from app.services import cart as cart_svc
from app.services import recommendations as reco
from app.services.notify import notify
from pydantic import BaseModel

router = APIRouter(tags=["Engagement"])


# ---- favorites ---------------------------------------------------------------
@router.get("/favorites", response_model=list[StoreOut])
def list_favorites(user: CustomerUser, db: DB):
    stores = db.scalars(select(Store).join(Favorite, Favorite.store_id == Store.id)
                        .where(Favorite.user_id == user.id).order_by(Favorite.id.desc())).all()
    return [store_out(s, None, None, {s.id for s in stores}) for s in stores]


@router.post("/favorites/{store_id}", response_model=Message)
def toggle_favorite(store_id: int, user: CustomerUser, db: DB):
    if not db.get(Store, store_id):
        raise NotFound("Store not found")
    fav = db.scalar(select(Favorite).where(Favorite.user_id == user.id, Favorite.store_id == store_id))
    if fav:
        db.delete(fav)
        msg = "Removed from favorites"
    else:
        db.add(Favorite(user_id=user.id, store_id=store_id))
        msg = "Added to favorites"
    db.commit()
    return Message(message=msg)


# ---- notifications -----------------------------------------------------------
class NotificationPage(Page[NotificationOut]):
    unread: int


class UnreadCountOut(BaseModel):
    unread: int


@router.get("/notifications/unread-count", response_model=UnreadCountOut)
def get_unread_count(user: CurrentUser, db: DB):
    unread = db.scalar(select(func.count(Notification.id))
                       .where(Notification.user_id == user.id, Notification.is_read.is_(False)))
    return UnreadCountOut(unread=unread)


@router.get("/notifications", response_model=NotificationPage)
def list_notifications(user: CurrentUser, db: DB, pg: Pagination, unread_only: bool = False):
    base = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        base = base.where(Notification.is_read.is_(False))
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    unread = db.scalar(select(func.count(Notification.id))
                       .where(Notification.user_id == user.id, Notification.is_read.is_(False)))
    rows = db.scalars(base.order_by(Notification.id.desc()).offset(pg.offset).limit(pg.size)).all()
    page = Page.build(rows, total, pg.page, pg.size)
    return NotificationPage(**page.model_dump(), unread=unread)


@router.post("/notifications/read-all", response_model=Message)
def read_all(user: CurrentUser, db: DB):
    db.execute(update(Notification).where(Notification.user_id == user.id).values(is_read=True))
    db.commit()
    return Message(message="All caught up")


@router.post("/notifications/{nid}/read", response_model=Message)
def read_one(nid: int, user: CurrentUser, db: DB):
    n = db.get(Notification, nid)
    if not n or n.user_id != user.id:
        raise NotFound("Notification not found")
    n.is_read = True
    db.commit()
    return Message(message="ok")


# ---- support -----------------------------------------------------------------
@router.post("/support/tickets", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
def create_ticket(body: TicketIn, user: CurrentUser, db: DB):
    if body.order_id:
        order = db.get(Order, body.order_id)
        if not order or order.customer_id != user.id:
            raise NotFound("Order not found")
    t = SupportTicket(user_id=user.id, **body.model_dump())
    db.add(t)
    db.flush()
    for admin_id in db.scalars(select(User.id).where(User.role == Role.ADMIN)):
        notify(db, admin_id, "New support ticket", f"#{t.id}: {t.subject}", kind="support", link="/admin/support")
    notify(db, user.id, "Ticket received", f"We'll get back to you on #{t.id} shortly", kind="support",
           link="/support")
    db.commit()
    return t


@router.get("/support/tickets", response_model=list[TicketOut])
def my_tickets(user: CurrentUser, db: DB):
    return db.scalars(select(SupportTicket).where(SupportTicket.user_id == user.id)
                      .order_by(SupportTicket.id.desc())).all()


# ---- offers ------------------------------------------------------------------
class OfferOut(BaseModel):
    code: str
    description: str
    min_order: float
    store_id: int | None


@router.get("/coupons", response_model=list[OfferOut], summary="Active coupons customers can apply")
def offers(db: DB, store_id: int | None = None):
    now = datetime.now(UTC)
    rows = db.scalars(select(Coupon).where(Coupon.is_active.is_(True))).all()
    out = []
    for c in rows:
        expired = c.valid_until and (c.valid_until if c.valid_until.tzinfo else c.valid_until.replace(tzinfo=UTC)) < now
        exhausted = c.usage_limit is not None and c.used_count >= c.usage_limit
        if not expired and not exhausted and (c.store_id is None or c.store_id == store_id):
            out.append(OfferOut(code=c.code, description=c.description, min_order=c.min_order, store_id=c.store_id))
    return out


# ---- AI recommendations ------------------------------------------------------
class StoreReco(BaseModel):
    store: StoreOut
    reason: str
    score: float


class ProductReco(BaseModel):
    product: ProductOut
    reason: str
    store_name: str | None = None


@router.get("/recommendations/stores", response_model=list[StoreReco], tags=["AI"])
def recommended_stores(db: DB, user: OptionalUser, limit: int = 8, lat: float | None = None,
                       lng: float | None = None):
    recos = reco.recommend_stores(db, user if user and user.role == Role.CUSTOMER else None, limit)
    favs = favorite_ids(db, user)
    stores = {s.id: s for s in db.scalars(select(Store).where(Store.id.in_([r["store_id"] for r in recos])))}
    return [StoreReco(store=store_out(stores[r["store_id"]], lat, lng, favs), reason=r["reason"], score=r["score"])
            for r in recos if r["store_id"] in stores]


@router.get("/recommendations/products", response_model=list[ProductReco], tags=["AI"])
def recommended_products(user: CustomerUser, db: DB, limit: int = 10):
    return [ProductReco(product=r["product"], reason=r["reason"], store_name=r["product"].store.name)
            for r in reco.recommend_products(db, user, limit)]


@router.get("/recommendations/cart", response_model=list[ProductReco], tags=["AI"],
            summary="Smart-cart suggestions for the current cart")
def cart_suggestions(user: CustomerUser, db: DB, limit: int = 6):
    ids = [i.product_id for i in cart_svc.cart_items(db, user)]
    return [ProductReco(product=r["product"], reason=r["reason"]) for r in reco.smart_cart(db, user, ids, limit)]
