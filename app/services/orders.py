import secrets
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.cache import cache
from app.core.config import settings
from app.core.exceptions import AppError, Forbidden, NotFound
from app.models import (
    Address, Coupon, Order, OrderItem, OrderStatus as S, OrderStatusEvent, Payment, PaymentStatus, Product,
    Role, User,
)
from app.services import cart as cart_svc
from app.services import payments
from app.services.geo import haversine_km, travel_minutes
from app.services.notify import audit, notify
from app.services.realtime import hub

STATUS_LABEL = {
    S.PLACED: "Order placed",
    S.CONFIRMED: "Restaurant confirmed your order",
    S.PREPARING: "Your order is being prepared",
    S.READY: "Order is ready for pickup",
    S.PICKED_UP: "Delivery partner picked up your order",
    S.OUT_FOR_DELIVERY: "Your order is on the way",
    S.DELIVERED: "Order delivered. Enjoy!",
    S.CANCELLED: "Order cancelled",
}

# Allowed transitions per actor role
VENDOR_FLOW = {S.PLACED: {S.CONFIRMED, S.CANCELLED}, S.CONFIRMED: {S.PREPARING, S.CANCELLED}, S.PREPARING: {S.READY}}
PARTNER_FLOW = {S.READY: {S.PICKED_UP}, S.PICKED_UP: {S.OUT_FOR_DELIVERY}, S.OUT_FOR_DELIVERY: {S.DELIVERED}}
CUSTOMER_CANCELLABLE = {S.PLACED, S.CONFIRMED}
ACCEPTABLE_BY_PARTNER = {S.CONFIRMED, S.PREPARING, S.READY}
ACTIVE = {S.PLACED, S.CONFIRMED, S.PREPARING, S.READY, S.PICKED_UP, S.OUT_FOR_DELIVERY}


def _order_number() -> str:
    return "QK" + datetime.now(UTC).strftime("%y%m%d") + secrets.token_hex(3).upper()


def compute_eta(order: Order, partner: User | None = None) -> int:
    store = order.store
    if order.status == S.DELIVERED or order.status == S.CANCELLED:
        return 0
    to_customer = haversine_km(store.lat, store.lng, order.delivery_lat, order.delivery_lng)
    if order.status in (S.PICKED_UP, S.OUT_FOR_DELIVERY):
        if partner and partner.current_lat is not None:
            to_customer = haversine_km(partner.current_lat, partner.current_lng, order.delivery_lat, order.delivery_lng)
        return max(1, travel_minutes(to_customer) - 2)
    prep_left = {S.PLACED: store.prep_time_min + 2, S.CONFIRMED: store.prep_time_min,
                 S.PREPARING: max(3, store.prep_time_min // 2), S.READY: 2}[order.status]
    return prep_left + travel_minutes(to_customer)


def broadcast_order(order: Order, extra: dict | None = None) -> None:
    payload = {
        "type": "order_update",
        "data": {"order_id": order.id, "status": order.status.value, "eta_minutes": order.eta_minutes,
                 "partner_id": order.partner_id, **(extra or {})},
    }
    hub.publish(f"order:{order.id}", payload)


def _set_status(db: Session, order: Order, status: S, note: str | None = None) -> None:
    order.status = status
    db.add(OrderStatusEvent(order_id=order.id, status=status, note=note))
    if status == S.DELIVERED:
        order.delivered_at = datetime.now(UTC)
        if order.payment_method == "cod":
            order.payment_status = PaymentStatus.PAID
            db.add(Payment(order_id=order.id, amount=order.total, method="cod", status=PaymentStatus.PAID,
                           transaction_ref="COD" + secrets.token_hex(6).upper(), message="Cash collected",
                           provider="cod"))
    order.eta_minutes = compute_eta(order, order.partner)
    notify(db, order.customer_id, STATUS_LABEL[status], f"Order {order.order_number}: {STATUS_LABEL[status]}",
           kind="order", link=f"/orders/{order.id}")


def checkout(db: Session, user: User, address_id: int, payment_method: str,
             coupon_code: str | None, notes: str | None) -> Order:
    address = db.get(Address, address_id)
    if not address or address.user_id != user.id:
        raise NotFound("Address not found")
    items = cart_svc.cart_items(db, user)
    if not items:
        raise AppError("Your cart is empty", code="cart_empty")
    store = items[0].product.store
    if not store.is_open or not store.is_approved:
        raise AppError("Store is closed", code="store_closed")
    summary = cart_svc.summarize(db, user, coupon_code)
    if summary["subtotal"] < store.min_order:
        raise AppError(f"Minimum order for {store.name} is ₹{store.min_order:.0f}", code="min_order")
    for ci in items:  # limits may have changed since the item was added to the cart
        cart_svc.check_qty_limits(ci.product, ci.quantity)
    if coupon_code and not summary["coupon_code"]:
        raise AppError(summary["coupon_message"] or "Invalid coupon", code="coupon_invalid")

    order = Order(
        order_number=_order_number(), customer_id=user.id, store_id=store.id, status=S.PLACED,
        delivery_address=f"{address.label}: {address.line1}, {address.city} {address.pincode}",
        delivery_lat=address.lat, delivery_lng=address.lng,
        subtotal=summary["subtotal"], discount=summary["discount"], delivery_fee=summary["delivery_fee"],
        tax=summary["tax"], total=summary["total"], coupon_code=summary["coupon_code"],
        payment_method=payment_method, payment_status=PaymentStatus.PENDING, notes=notes,
    )
    order.store = store
    db.add(order)
    db.flush()

    for ci in items:
        # Row-level lock on Postgres prevents overselling under concurrent checkouts
        product = db.get(Product, ci.product_id, with_for_update=True)
        if not product.is_available or product.stock < ci.quantity:
            raise AppError(f"{product.name} is out of stock", code="insufficient_stock")
        product.stock -= ci.quantity
        db.add(OrderItem(order_id=order.id, product_id=product.id, name=product.name,
                         price=product.price, quantity=ci.quantity))
        if product.is_low_stock:
            notify(db, store.vendor_id, "Low stock alert",
                   f"{product.name} at {store.name} has only {product.stock} left", kind="stock",
                   link="/vendor/products")
        db.delete(ci)

    if order.coupon_code:
        coupon = db.query(Coupon).filter_by(code=order.coupon_code).with_for_update().one()
        coupon.used_count += 1

    db.add(OrderStatusEvent(order_id=order.id, status=S.PLACED, note="Order placed"))
    order.eta_minutes = compute_eta(order)
    notify(db, store.vendor_id, "New order", f"{order.order_number} — ₹{order.total:.0f}", kind="order",
           link="/vendor/orders")
    audit(db, user.id, "order.placed", "order", order.id, {"total": order.total})
    db.commit()
    cache.invalidate(f"qk:reco:{user.id}:")
    return order


def pay(db: Session, user: User, order: Order, simulate_failure: bool) -> Payment:
    if order.customer_id != user.id:
        raise Forbidden("Not your order")
    if order.payment_status == PaymentStatus.PAID:
        raise AppError("Order already paid", code="already_paid")
    if order.status == S.CANCELLED:
        raise AppError("Order is cancelled", code="order_cancelled")
    if order.payment_method == "cod":
        raise AppError("Cash on delivery orders are paid on delivery", code="cod")
    if settings.payment_provider != "mock":
        raise AppError("Use Razorpay checkout to pay for this order", code="use_gateway")
    ok = not simulate_failure
    payment = Payment(
        order_id=order.id, amount=order.total, method=order.payment_method,
        status=PaymentStatus.PAID if ok else PaymentStatus.FAILED,
        transaction_ref="TXN" + secrets.token_hex(8).upper(),
        message="Payment successful (mock gateway)" if ok else "Payment declined by mock gateway",
    )
    db.add(payment)
    order.payment_status = payment.status
    if ok:
        notify(db, order.store.vendor_id, "Payment received", f"{order.order_number} is paid and ready to confirm",
               kind="order", link="/vendor/orders")
    audit(db, user.id, "payment." + payment.status.value, "order", order.id, {"ref": payment.transaction_ref})
    db.commit()
    broadcast_order(order, {"payment_status": order.payment_status.value})
    return payment


def _restock(db: Session, order: Order) -> None:
    for item in order.items:
        if item.product_id:
            product = db.get(Product, item.product_id)
            if product:
                product.stock += item.quantity


def cancel(db: Session, actor: User, order: Order, reason: str) -> Order:
    if actor.role == Role.CUSTOMER:
        if order.customer_id != actor.id:
            raise Forbidden("Not your order")
        if order.status not in CUSTOMER_CANCELLABLE:
            raise AppError("This order can no longer be cancelled", code="not_cancellable")
    elif actor.role == Role.VENDOR:
        if order.store.vendor_id != actor.id:
            raise Forbidden("Not your store's order")
        if order.status not in (S.PLACED, S.CONFIRMED):
            raise AppError("Order can no longer be rejected", code="not_cancellable")
    elif actor.role != Role.ADMIN:
        raise Forbidden("Not allowed")
    if order.status in (S.DELIVERED, S.CANCELLED):
        raise AppError("Order is already closed", code="not_cancellable")

    order.cancel_reason = reason
    _restock(db, order)
    payments.refund_if_paid(db, order, actor)
    _set_status(db, order, S.CANCELLED, f"Cancelled by {actor.role.value}: {reason}")
    if actor.id != order.store.vendor_id:
        notify(db, order.store.vendor_id, "Order cancelled", f"{order.order_number}: {reason}", kind="order")
    if order.partner_id:
        notify(db, order.partner_id, "Delivery cancelled", f"{order.order_number} was cancelled", kind="order")
    audit(db, actor.id, "order.cancelled", "order", order.id, {"reason": reason})
    db.commit()
    broadcast_order(order)
    return order


def vendor_update_status(db: Session, vendor: User, order: Order, status: S, note: str | None) -> Order:
    if order.store.vendor_id != vendor.id:
        raise Forbidden("Not your store's order")
    if status == S.CANCELLED:
        return cancel(db, vendor, order, note or "Rejected by store")
    if status not in VENDOR_FLOW.get(order.status, set()):
        raise AppError(f"Cannot move order from {order.status.value} to {status.value}", code="invalid_transition")
    if status == S.CONFIRMED and order.payment_method != "cod" and order.payment_status != PaymentStatus.PAID:
        raise AppError("Awaiting customer payment", code="payment_pending")
    _set_status(db, order, status, note)
    if status == S.READY and order.partner_id:
        notify(db, order.partner_id, "Order ready", f"{order.order_number} is ready at {order.store.name}",
               kind="order", link="/delivery")
    if status == S.CONFIRMED and not order.partner_id:
        hub.publish("partners", {"type": "new_job", "data": {"order_id": order.id}})
    audit(db, vendor.id, f"order.{status.value}", "order", order.id)
    db.commit()
    broadcast_order(order)
    return order


def partner_accept(db: Session, partner: User, order: Order) -> Order:
    if not partner.is_online:
        raise AppError("Go online to accept orders", code="offline")
    if order.partner_id is not None:
        raise AppError("Order already assigned", code="already_assigned", status_code=409)
    if order.status not in ACCEPTABLE_BY_PARTNER:
        raise AppError("Order is not available for pickup", code="invalid_transition")
    order.partner_id = partner.id
    order.partner = partner
    db.add(OrderStatusEvent(order_id=order.id, status=order.status, note=f"Delivery partner {partner.full_name} assigned"))
    notify(db, order.customer_id, "Delivery partner assigned",
           f"{partner.full_name} will deliver order {order.order_number}", kind="order", link=f"/orders/{order.id}")
    audit(db, partner.id, "order.accepted", "order", order.id)
    db.commit()
    broadcast_order(order, {"partner_name": partner.full_name})
    hub.publish("partners", {"type": "job_taken", "data": {"order_id": order.id}})
    return order


def partner_update_status(db: Session, partner: User, order: Order, status: S, note: str | None) -> Order:
    if order.partner_id != partner.id:
        raise Forbidden("Not assigned to you")
    if status not in PARTNER_FLOW.get(order.status, set()):
        raise AppError(f"Cannot move order from {order.status.value} to {status.value}", code="invalid_transition")
    _set_status(db, order, status, note)
    audit(db, partner.id, f"order.{status.value}", "order", order.id)
    db.commit()
    broadcast_order(order)
    return order


def update_partner_location(db: Session, partner: User, lat: float, lng: float) -> list[int]:
    partner.current_lat, partner.current_lng = lat, lng
    active = db.query(Order).filter(Order.partner_id == partner.id, Order.status.in_(ACTIVE)).all()
    for order in active:
        order.eta_minutes = compute_eta(order, partner)
    db.commit()
    for order in active:
        hub.publish(f"order:{order.id}", {
            "type": "location",
            "data": {"order_id": order.id, "lat": lat, "lng": lng, "eta_minutes": order.eta_minutes},
        })
    return [o.id for o in active]
