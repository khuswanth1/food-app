from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Order, OrderItem, OrderStatus, PaymentStatus

REVENUE_STATUSES = [s for s in OrderStatus if s != OrderStatus.CANCELLED]


def daily_series(db: Session, days: int, store_ids: list[int] | None = None) -> list[dict]:
    since = datetime.now(UTC) - timedelta(days=days - 1)
    day = func.date(Order.created_at)
    stmt = (select(day, func.count(Order.id), func.coalesce(func.sum(Order.total), 0))
            .where(Order.created_at >= since.replace(hour=0, minute=0, second=0, microsecond=0),
                   Order.status.in_(REVENUE_STATUSES))
            .group_by(day))
    if store_ids is not None:
        stmt = stmt.where(Order.store_id.in_(store_ids or [-1]))
    found = {str(d): (c, float(r)) for d, c, r in db.execute(stmt).all()}
    out = []
    for i in range(days):
        d = (date.today() - timedelta(days=days - 1 - i)).isoformat()
        c, r = found.get(d, (0, 0.0))
        out.append({"date": d, "orders": c, "revenue": round(r, 2)})
    return out


def status_breakdown(db: Session, store_ids: list[int] | None = None) -> dict[str, int]:
    stmt = select(Order.status, func.count(Order.id)).group_by(Order.status)
    if store_ids is not None:
        stmt = stmt.where(Order.store_id.in_(store_ids or [-1]))
    return {s.value: c for s, c in db.execute(stmt).all()}


def totals(db: Session, store_ids: list[int] | None = None) -> dict:
    stmt = select(func.count(Order.id), func.coalesce(func.sum(Order.total), 0)).where(
        Order.status.in_(REVENUE_STATUSES), Order.payment_status.in_([PaymentStatus.PAID, PaymentStatus.PENDING]))
    if store_ids is not None:
        stmt = stmt.where(Order.store_id.in_(store_ids or [-1]))
    count, revenue = db.execute(stmt).one()
    return {"orders": count, "revenue": round(float(revenue), 2),
            "avg_order_value": round(float(revenue) / count, 2) if count else 0}


def top_products(db: Session, store_ids: list[int] | None = None, limit: int = 5) -> list[dict]:
    qty = func.sum(OrderItem.quantity)
    stmt = (select(OrderItem.name, qty, func.sum(OrderItem.quantity * OrderItem.price))
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.status != OrderStatus.CANCELLED)
            .group_by(OrderItem.name).order_by(qty.desc()).limit(limit))
    if store_ids is not None:
        stmt = stmt.where(Order.store_id.in_(store_ids or [-1]))
    return [{"name": n, "quantity": int(q), "revenue": round(float(r), 2)} for n, q, r in db.execute(stmt).all()]
