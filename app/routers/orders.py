from fastapi import APIRouter, status
from fastapi.responses import HTMLResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import DB, CurrentUser, CustomerUser, Pagination
from app.core.exceptions import AppError, Forbidden, NotFound
from app.models import Order, OrderStatus, Review, Role, Store, User
from app.schemas.common import Page
from app.schemas.misc import ReviewIn, ReviewOut
from app.schemas.order import (
    CancelIn, CheckoutIn, OrderDetail, OrderOut, PaymentIn, PaymentOut, RazorpayCheckoutOut, RazorpayFailureIn,
    RazorpayVerifyIn,
)
from app.services import orders as svc
from app.services import payments as pay_svc
from app.services.invoice import render_invoice
from app.services.notify import audit
from app.core.cache import cache

router = APIRouter(prefix="/orders", tags=["Orders & Payments"])

ORDER_LOAD = (selectinload(Order.items), selectinload(Order.store), selectinload(Order.customer),
              selectinload(Order.partner))


def load_order(db: Session, order_id: int, user: User, *, with_events: bool = False) -> Order:
    opts = ORDER_LOAD + ((selectinload(Order.events),) if with_events else ())
    order = db.scalar(select(Order).where(Order.id == order_id).options(*opts))
    if not order:
        raise NotFound("Order not found")
    allowed = (
        user.role == Role.ADMIN
        or (user.role == Role.CUSTOMER and order.customer_id == user.id)
        or (user.role == Role.VENDOR and order.store.vendor_id == user.id)
        or (user.role == Role.DELIVERY and (order.partner_id == user.id
                                            or (order.partner_id is None and order.status in svc.ACCEPTABLE_BY_PARTNER)))
    )
    if not allowed:
        raise NotFound("Order not found")  # don't leak existence
    return order


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED, summary="Checkout the cart")
def checkout(body: CheckoutIn, user: CustomerUser, db: DB):
    order = svc.checkout(db, user, body.address_id, body.payment_method, body.coupon_code, body.notes)
    return load_order(db, order.id, user)


@router.get("", response_model=Page[OrderOut])
def my_orders(user: CustomerUser, db: DB, pg: Pagination, active: bool | None = None):
    base = select(Order).where(Order.customer_id == user.id)
    if active is True:
        base = base.where(Order.status.in_(svc.ACTIVE))
    elif active is False:
        base = base.where(Order.status.not_in(svc.ACTIVE))
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.scalars(base.options(*ORDER_LOAD).order_by(Order.created_at.desc())
                      .offset(pg.offset).limit(pg.size)).all()
    return Page.build(rows, total, pg.page, pg.size)


@router.get("/{order_id}", response_model=OrderDetail)
def order_detail(order_id: int, user: CurrentUser, db: DB):
    order = load_order(db, order_id, user, with_events=True)
    out = OrderDetail.model_validate(order)
    out.has_review = db.scalar(select(Review.id).where(Review.order_id == order.id)) is not None
    return out


@router.post("/{order_id}/pay", response_model=PaymentOut, summary="Mock payment gateway")
def pay(order_id: int, body: PaymentIn, user: CustomerUser, db: DB):
    return svc.pay(db, user, load_order(db, order_id, user), body.simulate_failure)


@router.post("/{order_id}/razorpay/order", response_model=RazorpayCheckoutOut, tags=["Payments"],
             summary="Create/reuse a Razorpay order and get Checkout options")
def razorpay_order(order_id: int, user: CustomerUser, db: DB):
    return pay_svc.start_checkout(db, user, load_order(db, order_id, user))


@router.post("/{order_id}/razorpay/verify", response_model=PaymentOut, tags=["Payments"],
             summary="Verify the Razorpay Checkout signature and capture the payment")
def razorpay_verify(order_id: int, body: RazorpayVerifyIn, user: CustomerUser, db: DB):
    return pay_svc.confirm(db, user, load_order(db, order_id, user), body.razorpay_order_id,
                           body.razorpay_payment_id, body.razorpay_signature)


@router.post("/{order_id}/razorpay/failure", response_model=PaymentOut, tags=["Payments"],
             summary="Record a failed/abandoned Razorpay payment attempt")
def razorpay_failure(order_id: int, body: RazorpayFailureIn, user: CustomerUser, db: DB):
    return pay_svc.record_failure(db, user, load_order(db, order_id, user), body.razorpay_order_id, body.reason)


@router.post("/{order_id}/cancel", response_model=OrderOut)
def cancel(order_id: int, body: CancelIn, user: CurrentUser, db: DB):
    return svc.cancel(db, user, load_order(db, order_id, user), body.reason)


@router.get("/{order_id}/invoice", response_class=HTMLResponse)
def invoice(order_id: int, user: CurrentUser, db: DB):
    return render_invoice(load_order(db, order_id, user))


@router.post("/{order_id}/review", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
def review(order_id: int, body: ReviewIn, user: CustomerUser, db: DB):
    order = load_order(db, order_id, user)
    if order.status != OrderStatus.DELIVERED:
        raise AppError("You can review an order after it is delivered", code="not_delivered")
    if db.scalar(select(Review.id).where(Review.order_id == order.id)):
        raise AppError("You already reviewed this order", code="already_reviewed", status_code=409)
    r = Review(user_id=user.id, store_id=order.store_id, order_id=order.id, rating=body.rating, comment=body.comment)
    db.add(r)
    store = db.get(Store, order.store_id)
    store.rating = round((store.rating * store.rating_count + body.rating) / (store.rating_count + 1), 2)
    store.rating_count += 1
    audit(db, user.id, "review.created", "store", store.id, {"rating": body.rating})
    db.commit()
    cache.invalidate("qk:stores:")
    return r
