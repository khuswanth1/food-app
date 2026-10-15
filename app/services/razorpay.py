"""Thin Razorpay REST client (https://razorpay.com/docs/api/).

Only the endpoints QuickKart needs: orders, payment fetch/capture, refunds, plus HMAC signature
checks for Checkout callbacks and webhooks. Amounts are in the smallest currency unit (paise).
"""
import hashlib
import hmac
import logging

import httpx

from app.core.config import settings
from app.core.exceptions import AppError

log = logging.getLogger("quickkart.razorpay")


class GatewayError(AppError):
    status_code = 502
    code = "gateway_error"


def to_paise(amount: float) -> int:
    return int(round(amount * 100))


def _hmac(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


class RazorpayGateway:
    BASE_URL = "https://api.razorpay.com/v1"

    def __init__(self, key_id: str, key_secret: str, webhook_secret: str = "",
                 transport: httpx.BaseTransport | None = None):
        self.key_id = key_id
        self._secret = key_secret
        self._webhook_secret = webhook_secret
        self._transport = transport

    def _request(self, method: str, path: str, **kwargs) -> dict:
        try:
            with httpx.Client(base_url=self.BASE_URL, auth=(self.key_id, self._secret), timeout=15,
                              transport=self._transport) as client:
                r = client.request(method, path, **kwargs)
        except httpx.HTTPError as e:
            log.error("Razorpay %s %s failed: %s", method, path, e)
            raise GatewayError("Payment gateway is unreachable. Please try again.") from e
        if r.status_code >= 400:
            desc = (r.json().get("error") or {}).get("description", r.text) if r.content else r.reason_phrase
            log.warning("Razorpay %s %s -> %s: %s", method, path, r.status_code, desc)
            raise GatewayError(f"Payment gateway error: {desc}")
        return r.json()

    # ---- API calls -----------------------------------------------------------
    def create_order(self, amount_paise: int, receipt: str, notes: dict | None = None) -> dict:
        return self._request("POST", "/orders", json={
            "amount": amount_paise, "currency": settings.PAYMENT_CURRENCY, "receipt": receipt[:40],
            "notes": notes or {}, "payment_capture": 1,
        })

    def fetch_payment(self, payment_id: str) -> dict:
        return self._request("GET", f"/payments/{payment_id}")

    def capture(self, payment_id: str, amount_paise: int) -> dict:
        return self._request("POST", f"/payments/{payment_id}/capture",
                             json={"amount": amount_paise, "currency": settings.PAYMENT_CURRENCY})

    def refund(self, payment_id: str, amount_paise: int, notes: dict | None = None) -> dict:
        return self._request("POST", f"/payments/{payment_id}/refund",
                             json={"amount": amount_paise, "notes": notes or {}})

    def fetch_methods(self) -> dict:
        """Payment methods enabled on this merchant account, normalised to booleans."""
        raw = self._request("GET", "/methods", params={"key_id": self.key_id})
        return {
            "upi": bool(raw.get("upi")),                # UPI ID / collect (works on desktop)
            "upi_intent": bool(raw.get("upi_intent")),  # open GPay/PhonePe/Paytm (mobile only)
            "card": bool(raw.get("card")),
            "netbanking": bool(raw.get("netbanking")),
            "wallet": bool(raw.get("wallet")),
        }

    # ---- signatures ----------------------------------------------------------
    def verify_payment_signature(self, order_id: str, payment_id: str, signature: str) -> bool:
        expected = _hmac(self._secret, f"{order_id}|{payment_id}".encode())
        return hmac.compare_digest(expected, signature or "")

    @property
    def webhooks_enabled(self) -> bool:
        return bool(self._webhook_secret)

    def verify_webhook_signature(self, body: bytes, signature: str) -> bool:
        if not self._webhook_secret:
            return False
        return hmac.compare_digest(_hmac(self._webhook_secret, body), signature or "")


def get_gateway() -> RazorpayGateway | None:
    """The configured Razorpay gateway, or None when running on the mock gateway."""
    if settings.payment_provider != "razorpay":
        return None
    return RazorpayGateway(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET, settings.RAZORPAY_WEBHOOK_SECRET)
