from datetime import UTC, datetime, timedelta

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.deps import DB, DeliveryUser
from app.models import Order, OrderStatus
from app.routers.orders import ORDER_LOAD, load_order
from app.schemas.order import LocationIn, OrderOut, StatusUpdate
from app.schemas.user import UserOut
from app.services import orders as svc
from app.services.geo import haversine_km

router = APIRouter(prefix="/delivery", tags=["Delivery Partner"])

PAYOUT_BASE, PAYOUT_PER_KM = 25.0, 8.0


class AvailabilityIn(BaseModel):
    is_online: bool


class JobOut(OrderOut):
    pickup_distance_km: float | None = None
    trip_distance_km: float
    est_payout: float


def _job(order: Order, partner) -> JobOut:
    trip = haversine_km(order.store.lat, order.store.lng, order.delivery_lat, order.delivery_lng)
    out = JobOut(**OrderOut.model_validate(order).model_dump(), trip_distance_km=round(trip, 1),
                 est_payout=round(PAYOUT_BASE + PAYOUT_PER_KM * trip, 2))
    if partner.current_lat is not None:
        out.pickup_distance_km = round(haversine_km(partner.current_lat, partner.current_lng,
                                                    order.store.lat, order.store.lng), 1)
    return out


@router.post("/availability", response_model=UserOut)
def set_availability(body: AvailabilityIn, partner: DeliveryUser, db: DB):
    partner.is_online = body.is_online
    db.commit()
    return partner


@router.get("/available", response_model=list[JobOut], summary="Unassigned orders near the partner")
def available(partner: DeliveryUser, db: DB, radius_km: float = 15):
    rows = db.scalars(select(Order).options(*ORDER_LOAD)
                      .where(Order.partner_id.is_(None), Order.status.in_(svc.ACCEPTABLE_BY_PARTNER))
                      .order_by(Order.created_at)).all()
    jobs = [_job(o, partner) for o in rows]
    if partner.current_lat is not None:
        jobs = [j for j in jobs if j.pickup_distance_km is None or j.pickup_distance_km <= radius_km]
        jobs.sort(key=lambda j: j.pickup_distance_km or 0)
    return jobs


@router.get("/active", response_model=list[JobOut])
def active(partner: DeliveryUser, db: DB):
    rows = db.scalars(select(Order).options(*ORDER_LOAD)
                      .where(Order.partner_id == partner.id, Order.status.in_(svc.ACTIVE))
                      .order_by(Order.created_at)).all()
    return [_job(o, partner) for o in rows]


@router.get("/history", response_model=list[JobOut])
def history(partner: DeliveryUser, db: DB, limit: int = 30):
    rows = db.scalars(select(Order).options(*ORDER_LOAD)
                      .where(Order.partner_id == partner.id, Order.status.not_in(svc.ACTIVE))
                      .order_by(Order.created_at.desc()).limit(limit)).all()
    return [_job(o, partner) for o in rows]


@router.post("/orders/{order_id}/accept", response_model=OrderOut)
def accept(order_id: int, partner: DeliveryUser, db: DB):
    return svc.partner_accept(db, partner, load_order(db, order_id, partner))


@router.post("/orders/{order_id}/status", response_model=OrderOut)
def update_status(order_id: int, body: StatusUpdate, partner: DeliveryUser, db: DB):
    return svc.partner_update_status(db, partner, load_order(db, order_id, partner), body.status, body.note)


@router.post("/location")
def location(body: LocationIn, partner: DeliveryUser, db: DB):
    updated = svc.update_partner_location(db, partner, body.lat, body.lng)
    return {"updated_orders": updated}


@router.get("/earnings")
def earnings(partner: DeliveryUser, db: DB):
    delivered = db.scalars(select(Order).options(*ORDER_LOAD)
                           .where(Order.partner_id == partner.id, Order.status == OrderStatus.DELIVERED)).all()
    now = datetime.now(UTC)

    def payout(o):
        return PAYOUT_BASE + PAYOUT_PER_KM * haversine_km(o.store.lat, o.store.lng, o.delivery_lat, o.delivery_lng)

    def aware(dt):
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)

    week = [o for o in delivered if aware(o.delivered_at or o.created_at) >= now - timedelta(days=7)]
    today = [o for o in delivered if aware(o.delivered_at or o.created_at).date() == now.date()]
    daily = {}
    for i in range(7):
        d = (now - timedelta(days=6 - i)).date()
        daily[d.isoformat()] = 0.0
    for o in week:
        k = aware(o.delivered_at or o.created_at).date().isoformat()
        if k in daily:
            daily[k] += payout(o)
    active_count = db.scalar(select(func.count(Order.id)).where(Order.partner_id == partner.id,
                                                                 Order.status.in_(svc.ACTIVE)))
    return {
        "total_deliveries": len(delivered),
        "total_earnings": round(sum(map(payout, delivered)), 2),
        "today_earnings": round(sum(map(payout, today)), 2),
        "today_deliveries": len(today),
        "week_earnings": round(sum(map(payout, week)), 2),
        "active_orders": active_count,
        "daily": [{"date": k, "earnings": round(v, 2)} for k, v in daily.items()],
    }
