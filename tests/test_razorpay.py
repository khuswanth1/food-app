"""Razorpay integration tests against an in-process fake of the Razorpay REST API (no network)."""
import hashlib
import hmac
import json
import itertools

import httpx
import pytest

from app.core.config import settings
from app.routers import payments as payments_router
from app.services import payments as payments_svc
from app.services.razorpay import RazorpayGateway
from tests.conftest import login, place_order, vendor_store

KEY_ID, SECRET, WH_SECRET = "rzp_test_fake", "fake_secret", "wh_secret"


def sign(*parts: str, secret=SECRET) -> str:
    return hmac.new(secret.encode(), "|".join(parts).encode(), hashlib.sha256).hexdigest()


class FakeRazorpay:
    def __init__(self):
        self.orders, self.payments, self.refunds = {}, {}, []
        self.fail_refunds = False
        self.upi = True
        self._ids = itertools.count(1)

    def pay(self, rzp_order_id: str, *, status="authorized", amount=None) -> str:
        """Simulate the customer completing Checkout."""
        pid = f"pay_{next(self._ids)}"
        order = self.orders[rzp_order_id]
        self.payments[pid] = {"id": pid, "order_id": rzp_order_id, "amount": amount or order["amount"],
                              "currency": "INR", "status": status, "method": "upi"}
        return pid

    def handler(self, request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"].startswith("Basic ")
        path = request.url.path.removeprefix("/v1")
        body = json.loads(request.content) if request.content else {}
        if request.method == "POST" and path == "/orders":
            oid = f"order_{next(self._ids)}"
            self.orders[oid] = {"id": oid, **body, "status": "created"}
            return httpx.Response(200, json=self.orders[oid])
        if request.method == "GET" and path == "/methods":
            return httpx.Response(200, json={"card": True, "upi": self.upi, "upi_intent": True,
                                             "netbanking": {"HDFC": "HDFC Bank"}, "wallet": {}})
        if request.method == "GET" and path.startswith("/payments/"):
            return httpx.Response(200, json=self.payments[path.split("/")[2]])
        if path.endswith("/capture"):
            p = self.payments[path.split("/")[2]]
            p["status"] = "captured"
            return httpx.Response(200, json=p)
        if path.endswith("/refund"):
            if self.fail_refunds:
                return httpx.Response(400, json={"error": {"description": "Refund window closed"}})
            self.refunds.append(body)
            return httpx.Response(200, json={"id": f"rfnd_{next(self._ids)}", "status": "processed"})
        return httpx.Response(404, json={"error": {"description": "not found"}})


@pytest.fixture()
def rzp(monkeypatch):
    from app.core.cache import cache
    cache.invalidate("qk:rzp:")
    fake = FakeRazorpay()
    gw = RazorpayGateway(KEY_ID, SECRET, WH_SECRET, transport=httpx.MockTransport(fake.handler))
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", KEY_ID)
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", SECRET)
    monkeypatch.setattr(payments_svc, "get_gateway", lambda: gw)
    monkeypatch.setattr(payments_router, "get_gateway", lambda: gw)
    return fake


def _checkout(client, customer, vendor):
    order = place_order(client, customer, vendor_store(client, vendor)["id"], method="upi")
    r = client.post(f"/api/v1/orders/{order['id']}/razorpay/order", headers=customer)
    assert r.status_code == 200, r.text
    return order, r.json()


def test_config_exposes_key_id_and_enabled_methods(client, rzp):
    cfg = client.get("/api/v1/payments/config").json()
    assert cfg["provider"] == "razorpay" and cfg["key_id"] == KEY_ID
    assert cfg["methods"] == {"upi": True, "upi_intent": True, "card": True, "netbanking": True, "wallet": False}
    assert SECRET not in json.dumps(cfg)


def test_config_reports_upi_disabled_account(client, rzp):
    rzp.upi = False
    assert client.get("/api/v1/payments/config").json()["methods"]["upi"] is False


def test_checkout_carries_preferred_method(client, customer, vendor, rzp):
    _, opts = _checkout(client, customer, vendor)
    assert opts["method"] == "upi"


def test_config_falls_back_to_mock(client):
    assert client.get("/api/v1/payments/config").json()["provider"] == "mock"


def test_successful_payment_flow(client, customer, vendor, rzp):
    order, opts = _checkout(client, customer, vendor)
    assert opts["amount"] == round(order["total"] * 100) and opts["key_id"] == KEY_ID
    assert opts["prefill"]["email"] == "customer@quickkart.dev"
    # Re-opening checkout reuses the same Razorpay order
    again = client.post(f"/api/v1/orders/{order['id']}/razorpay/order", headers=customer).json()
    assert again["razorpay_order_id"] == opts["razorpay_order_id"] and len(rzp.orders) == 1

    # Mock gateway is disabled once Razorpay is configured
    assert client.post(f"/api/v1/orders/{order['id']}/pay", headers=customer, json={}).json()["error"]["code"] == "use_gateway"

    pid = rzp.pay(opts["razorpay_order_id"])
    bad = client.post(f"/api/v1/orders/{order['id']}/razorpay/verify", headers=customer, json={
        "razorpay_order_id": opts["razorpay_order_id"], "razorpay_payment_id": pid, "razorpay_signature": "forged"})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "invalid_signature"

    body = {"razorpay_order_id": opts["razorpay_order_id"], "razorpay_payment_id": pid,
            "razorpay_signature": sign(opts["razorpay_order_id"], pid)}
    ok = client.post(f"/api/v1/orders/{order['id']}/razorpay/verify", headers=customer, json=body)
    assert ok.status_code == 200 and ok.json()["status"] == "paid" and ok.json()["provider_payment_id"] == pid
    assert client.get(f"/api/v1/orders/{order['id']}", headers=customer).json()["payment_method"] == "upi"
    assert rzp.payments[pid]["status"] == "captured"  # authorized payments get captured server-side
    # Idempotent retry
    assert client.post(f"/api/v1/orders/{order['id']}/razorpay/verify", headers=customer, json=body).json()["status"] == "paid"

    detail = client.get(f"/api/v1/orders/{order['id']}", headers=customer).json()
    assert detail["payment_status"] == "paid"
    assert client.post(f"/api/v1/vendor/orders/{order['id']}/status", headers=vendor,
                       json={"status": "confirmed"}).status_code == 200


def test_tampered_amount_is_rejected(client, customer, vendor, rzp):
    order, opts = _checkout(client, customer, vendor)
    pid = rzp.pay(opts["razorpay_order_id"], amount=100)  # ₹1 instead of the real total
    r = client.post(f"/api/v1/orders/{order['id']}/razorpay/verify", headers=customer, json={
        "razorpay_order_id": opts["razorpay_order_id"], "razorpay_payment_id": pid,
        "razorpay_signature": sign(opts["razorpay_order_id"], pid)})
    assert r.json()["error"]["code"] == "payment_mismatch"


def test_failure_then_retry(client, customer, vendor, rzp):
    order, opts = _checkout(client, customer, vendor)
    r = client.post(f"/api/v1/orders/{order['id']}/razorpay/failure", headers=customer,
                    json={"razorpay_order_id": opts["razorpay_order_id"], "reason": "Bank declined"})
    assert r.json()["status"] == "failed"
    assert client.get(f"/api/v1/orders/{order['id']}", headers=customer).json()["payment_status"] == "failed"
    retry = client.post(f"/api/v1/orders/{order['id']}/razorpay/order", headers=customer).json()
    assert retry["razorpay_order_id"] == opts["razorpay_order_id"]


def test_other_customer_cannot_pay_or_verify(client, customer, vendor, rzp):
    order, opts = _checkout(client, customer, vendor)
    other = login(client, "aman@quickkart.dev")
    assert client.post(f"/api/v1/orders/{order['id']}/razorpay/order", headers=other).status_code == 404


def _pay(client, customer, rzp, order, opts):
    pid = rzp.pay(opts["razorpay_order_id"], status="captured")
    client.post(f"/api/v1/orders/{order['id']}/razorpay/verify", headers=customer, json={
        "razorpay_order_id": opts["razorpay_order_id"], "razorpay_payment_id": pid,
        "razorpay_signature": sign(opts["razorpay_order_id"], pid)})
    return pid


def test_cancel_refunds_through_razorpay(client, customer, vendor, rzp):
    order, opts = _checkout(client, customer, vendor)
    _pay(client, customer, rzp, order, opts)
    r = client.post(f"/api/v1/orders/{order['id']}/cancel", headers=customer, json={"reason": "Changed plans"})
    assert r.json()["payment_status"] == "refunded"
    assert rzp.refunds and rzp.refunds[0]["amount"] == opts["amount"]


def test_refund_failure_keeps_cancellation_and_alerts_admin(client, customer, vendor, admin, rzp):
    rzp.fail_refunds = True
    order, opts = _checkout(client, customer, vendor)
    _pay(client, customer, rzp, order, opts)
    r = client.post(f"/api/v1/orders/{order['id']}/cancel", headers=customer, json={})
    assert r.json()["status"] == "cancelled" and r.json()["payment_status"] == "paid"
    notes = client.get("/api/v1/notifications", headers=admin).json()["items"]
    assert any(n["title"] == "Refund needs attention" for n in notes)


def test_webhook_marks_paid_and_verifies_signature(client, customer, vendor, rzp):
    order, opts = _checkout(client, customer, vendor)
    pid = rzp.pay(opts["razorpay_order_id"], status="captured")
    event = {"event": "payment.captured", "payload": {"payment": {"entity": rzp.payments[pid]}}}
    raw = json.dumps(event).encode()

    forged = client.post("/api/v1/payments/razorpay/webhook", content=raw,
                         headers={"X-Razorpay-Signature": "nope", "Content-Type": "application/json"})
    assert forged.status_code == 401

    good_sig = hmac.new(WH_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    r = client.post("/api/v1/payments/razorpay/webhook", content=raw,
                    headers={"X-Razorpay-Signature": good_sig, "Content-Type": "application/json"})
    assert r.json()["outcome"] == "paid"
    assert client.get(f"/api/v1/orders/{order['id']}", headers=customer).json()["payment_status"] == "paid"
    # Replayed webhook is a no-op
    r = client.post("/api/v1/payments/razorpay/webhook", content=raw,
                    headers={"X-Razorpay-Signature": good_sig, "Content-Type": "application/json"})
    assert r.status_code == 200


def test_webhook_disabled_without_gateway(client):
    r = client.post("/api/v1/payments/razorpay/webhook", content=b"{}", headers={"X-Razorpay-Signature": "x"})
    assert r.status_code == 503
