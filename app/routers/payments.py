import json
import logging

from fastapi import APIRouter, Header, Request
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.core.cache import cache
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.exceptions import AppError, Unauthorized
from app.services import payments as svc
from app.services.razorpay import get_gateway

router = APIRouter(prefix="/payments", tags=["Payments"])
log = logging.getLogger("quickkart.payments")


class PaymentMethods(BaseModel):
    upi: bool = True          # UPI ID / collect: works on any device
    upi_intent: bool = True   # UPI app switch: mobile only
    card: bool = True
    netbanking: bool = True
    wallet: bool = True


class PaymentConfig(BaseModel):
    provider: str  # "razorpay" | "mock"
    key_id: str | None = None  # publishable; the secret never leaves the server
    currency: str
    merchant_name: str
    methods: PaymentMethods


METHODS_CACHE_KEY = "qk:rzp:methods"


def _razorpay_methods() -> PaymentMethods:
    if (cached := cache.get(METHODS_CACHE_KEY)) is not None:
        return PaymentMethods(**cached)
    gw = get_gateway()
    try:
        methods = gw.fetch_methods()
    except AppError:
        return PaymentMethods()  # gateway hiccup: let Checkout decide what to show
    cache.set(METHODS_CACHE_KEY, methods, ttl=600)
    return PaymentMethods(**methods)


@router.get("/config", response_model=PaymentConfig, summary="Payment gateway and the methods enabled on it")
def payment_config():
    razorpay = settings.payment_provider == "razorpay"
    return PaymentConfig(provider=settings.payment_provider,
                         key_id=settings.RAZORPAY_KEY_ID if razorpay else None,
                         currency=settings.PAYMENT_CURRENCY, merchant_name=settings.MERCHANT_NAME,
                         methods=_razorpay_methods() if razorpay else PaymentMethods())


def _apply(event: dict) -> str:
    with SessionLocal() as db:
        return svc.handle_webhook(db, event)


@router.post("/razorpay/webhook", summary="Razorpay webhook receiver (signature-verified)")
async def razorpay_webhook(request: Request, x_razorpay_signature: str = Header(default="")):
    gw = get_gateway()
    if gw is None or not gw.webhooks_enabled:
        raise AppError("Webhooks are not configured", code="webhooks_disabled", status_code=503)
    body = await request.body()  # signature is over the raw bytes, so read before parsing
    if not gw.verify_webhook_signature(body, x_razorpay_signature):
        raise Unauthorized("Invalid webhook signature", code="invalid_signature")
    event = json.loads(body)
    outcome = await run_in_threadpool(_apply, event)
    log.info("Razorpay webhook %s -> %s", event.get("event"), outcome)
    return {"status": "ok", "outcome": outcome}
