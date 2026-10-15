"""Razorpay payment lifecycle for orders.

Flow: ``start_checkout`` creates (or reuses) a Razorpay order → the browser opens Razorpay Checkout →
``confirm`` verifies the HMAC signature, re-fetches the payment server-side (amount/order/status must
match), captures if only authorized, and marks the order paid. Webhooks call the same ``mark_paid`` /
``mark_failed`` helpers, so whichever arrives first wins and the other is a no-op.
"""
import logging
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AppError, Forbidden, NotFound
from app.models import Order, OrderStatus, Payment, PaymentStatus, Role, User
from app.services.notify import audit, notify
from app.services.razorpay import RazorpayGateway, get_gateway, to_paise
from app.services.realtime import hub

log = logging.getLogger("quickkart.payments")


def _require_gateway() -> RazorpayGateway:
    gw = get_gateway()
    if gw is None:
        raise AppError("Online payments are not configured", code="payments_disabled", status_code=503)
    return gw


def _check_payable(user: User, order: Order) -> None:
    if order.customer_id != user.id:
        raise Forbidden("Not your order")
    if order.payment_status == PaymentStatus.PAID:
        raise AppError("Order already paid", code="already_paid")
    if order.status == OrderStatus.CANCELLED:
        raise AppError("Order is cancelled", code="order_cancelled")
    if order.payment_method == "cod":
        raise AppError("Cash on delivery orders are paid on delivery", code="cod")


def _broadcast(order: Order) -> None:
    hub.publish(f"order:{order.id}", {"type": "order_update", "data": {
        "order_id": order.id, "status": order.status.value, "payment_status": order.payment_status.value,
        "eta_minutes": order.eta_minutes, "partner_id": order.partner_id}})


def _payment_for(db: Session, order: Order, rzp_order_id: str) -> Payment:
    p = db.scalar(select(Payment).where(Payment.order_id == order.id, Payment.provider == "razorpay",
                                        Payment.provider_order_id == rzp_order_id))
    if not p:
        raise NotFound("Payment attempt not found")
    return p


def start_checkout(db: Session, user: User, order: Order) -> dict:
    """Create (or reuse) the Razorpay order and return everything Checkout.js needs."""
    gw = _require_gateway()
    _check_payable(user, order)
    amount = to_paise(order.total)
    attempt = db.scalar(
        select(Payment).where(Payment.order_id == order.id, Payment.provider == "razorpay",
                              Payment.status.in_([PaymentStatus.PENDING, PaymentStatus.FAILED]))
        .order_by(Payment.id.desc())
    )
    if attempt is None or to_paise(attempt.amount) != amount:
        rzp = gw.create_order(amount, receipt=order.order_number,
                              notes={"order_id": str(order.id), "order_number": order.order_number})
        attempt = Payment(order_id=order.id, amount=order.total, method=order.payment_method,
                          status=PaymentStatus.PENDING, provider="razorpay", provider_order_id=rzp["id"],
                          transaction_ref=rzp["id"], message="Awaiting payment")
        db.add(attempt)
        audit(db, user.id, "payment.initiated", "order", order.id, {"razorpay_order_id": rzp["id"]})
    else:
        attempt.status = PaymentStatus.PENDING
    db.commit()
    return {
        "key_id": gw.key_id,
        "razorpay_order_id": attempt.provider_order_id,
        "amount": amount,
        "currency": settings.PAYMENT_CURRENCY,
        "name": settings.MERCHANT_NAME,
        "description": f"Order {order.order_number} · {order.store.name}",
        "order_id": order.id,
        "method": order.payment_method,  # customer's choice at checkout; Checkout opens on it
        "prefill": {"name": user.full_name, "email": user.email, "contact": user.phone or ""},
    }


def mark_paid(db: Session, order: Order, payment: Payment, rzp_payment: dict, actor_id: int | None) -> Payment:
    if payment.status == PaymentStatus.PAID:
        return payment  # idempotent: checkout callback and webhook may both arrive
    payment.status = PaymentStatus.PAID
    payment.provider_payment_id = rzp_payment["id"]
    payment.method = (rzp_payment.get("method") or payment.method)[:20]
    payment.message = "Payment captured via Razorpay"
    order.payment_method = payment.method  # what the customer actually used inside Checkout
    order.payment_status = PaymentStatus.PAID
    notify(db, order.store.vendor_id, "Payment received", f"{order.order_number} is paid and ready to confirm",
           kind="order", link="/vendor/orders")
    notify(db, order.customer_id, "Payment successful", f"₹{order.total:.0f} paid for {order.order_number}",
           kind="order", link=f"/orders/{order.id}")
    audit(db, actor_id, "payment.paid", "order", order.id,
          {"razorpay_payment_id": rzp_payment["id"], "method": rzp_payment.get("method")})
    db.commit()
    _broadcast(order)
    return payment


def mark_failed(db: Session, order: Order, payment: Payment, reason: str, actor_id: int | None) -> Payment:
    if payment.status == PaymentStatus.PAID or order.payment_status == PaymentStatus.PAID:
        return payment
    payment.status = PaymentStatus.FAILED
    payment.message = reason[:255]
    order.payment_status = PaymentStatus.FAILED
    audit(db, actor_id, "payment.failed", "order", order.id, {"reason": reason[:200]})
    db.commit()
    _broadcast(order)
    return payment


def confirm(db: Session, user: User, order: Order, rzp_order_id: str, rzp_payment_id: str, signature: str) -> Payment:
    """Verify a Checkout success callback. Never trusts the browser: re-fetches the payment server-side."""
    gw = _require_gateway()
    if order.customer_id != user.id:
        raise Forbidden("Not your order")
    payment = _payment_for(db, order, rzp_order_id)
    if payment.status == PaymentStatus.PAID:
        return payment
    if not gw.verify_payment_signature(rzp_order_id, rzp_payment_id, signature):
        audit(db, user.id, "payment.signature_invalid", "order", order.id, {"razorpay_payment_id": rzp_payment_id})
        db.commit()
        raise AppError("Payment verification failed", code="invalid_signature")

    rzp = gw.fetch_payment(rzp_payment_id)
    if rzp.get("order_id") != rzp_order_id or rzp.get("amount") != to_paise(order.total) \
            or rzp.get("currency") != settings.PAYMENT_CURRENCY:
        raise AppError("Payment does not match this order", code="payment_mismatch")
    if rzp.get("status") == "authorized":
        rzp = gw.capture(rzp_payment_id, rzp["amount"])
    if rzp.get("status") != "captured":
        return mark_failed(db, order, payment, rzp.get("error_description") or f"Payment {rzp.get('status')}", user.id)
    return mark_paid(db, order, payment, rzp, user.id)


def record_failure(db: Session, user: User, order: Order, rzp_order_id: str, reason: str) -> Payment:
    if order.customer_id != user.id:
        raise Forbidden("Not your order")
    return mark_failed(db, order, _payment_for(db, order, rzp_order_id), reason, user.id)


def refund_if_paid(db: Session, order: Order, actor: User) -> None:
    """Refund a paid order on cancellation. Caller commits."""
    if order.payment_status != PaymentStatus.PAID:
        return
    paid = db.scalar(select(Payment).where(Payment.order_id == order.id, Payment.status == PaymentStatus.PAID,
                                           Payment.amount > 0).order_by(Payment.id.desc()))
    if paid is not None and paid.provider == "razorpay" and paid.provider_payment_id:
        gw = get_gateway()
        try:
            if gw is None:
                raise AppError("Razorpay is not configured")
            rfd = gw.refund(paid.provider_payment_id, to_paise(order.total),
                            notes={"order_number": order.order_number, "reason": order.cancel_reason or ""})
        except AppError as e:
            # The cancellation stands; finance follows up on the refund manually.
            log.error("Refund failed for order %s: %s", order.order_number, e.message)
            audit(db, actor.id, "refund.failed", "order", order.id, {"error": e.message})
            for admin_id in db.scalars(select(User.id).where(User.role == Role.ADMIN)):
                notify(db, admin_id, "Refund needs attention", f"Auto-refund failed for {order.order_number}",
                       kind="support", link="/admin/payments")
            return
        ref, message, provider = rfd["id"], f"Refund {rfd.get('status', 'initiated')} via Razorpay", "razorpay"
    elif paid is not None and paid.provider == "cod":
        ref, message, provider = "RFD" + secrets.token_hex(8).upper(), "Cash refund (manual)", "cod"
    else:
        ref, message, provider = "RFD" + secrets.token_hex(8).upper(), "Refund issued (mock)", "mock"
    order.payment_status = PaymentStatus.REFUNDED
    db.add(Payment(order_id=order.id, amount=-order.total, method=order.payment_method, status=PaymentStatus.REFUNDED,
                   transaction_ref=ref, message=message, provider=provider,
                   provider_payment_id=ref if provider == "razorpay" else None))


def handle_webhook(db: Session, event: dict) -> str:
    """Apply a verified Razorpay webhook event. Returns a short outcome string for logging."""
    kind = event.get("event", "")
    entity = (event.get("payload", {}).get("payment") or {}).get("entity") or {}
    rzp_order_id = entity.get("order_id")
    if not rzp_order_id:
        return f"ignored {kind}"
    payment = db.scalar(select(Payment).where(Payment.provider == "razorpay", Payment.provider_order_id == rzp_order_id))
    if payment is None:
        return f"unknown order {rzp_order_id}"
    order = db.get(Order, payment.order_id)
    if kind in ("payment.captured", "order.paid"):
        if entity.get("amount") != to_paise(order.total):
            log.warning("Webhook amount mismatch for %s", order.order_number)
            return "amount mismatch"
        mark_paid(db, order, payment, entity, None)
        return "paid"
    if kind == "payment.authorized":
        gw = get_gateway()
        if gw:
            captured = gw.capture(entity["id"], entity["amount"])
            mark_paid(db, order, payment, captured, None)
        return "captured"
    if kind == "payment.failed":
        mark_failed(db, order, payment, entity.get("error_description") or "Payment failed", None)
        return "failed"
    return f"ignored {kind}"
