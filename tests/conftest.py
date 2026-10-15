import os

# CI points these at real Postgres/Redis service containers; locally tests run on in-memory SQLite.
os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", "sqlite://")
os.environ["REDIS_URL"] = os.getenv("TEST_REDIS_URL", "")
os.environ["SEED_ON_STARTUP"] = "false"
# Tests default to the mock gateway even if backend/.env holds real Razorpay keys
os.environ["RAZORPAY_KEY_ID"] = ""
os.environ["RAZORPAY_KEY_SECRET"] = ""
os.environ["RAZORPAY_WEBHOOK_SECRET"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.cache import cache  # noqa: E402
from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import DEMO_PASSWORD, seed  # noqa: E402


@pytest.fixture()
def db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    cache.clear()
    with SessionLocal() as session:
        seed(session, orders=40)
        yield session


@pytest.fixture()
def client(db):
    with TestClient(app) as c:
        yield c


def login(client, email: str) -> dict:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def customer(client):
    return login(client, "customer@quickkart.dev")


@pytest.fixture()
def vendor(client):
    return login(client, "vendor@quickkart.dev")


@pytest.fixture()
def rider(client):
    return login(client, "rider@quickkart.dev")


@pytest.fixture()
def admin(client):
    return login(client, "admin@quickkart.dev")


def vendor_store(client, vendor) -> dict:
    stores = client.get("/api/v1/vendor/stores", headers=vendor).json()
    return next(s for s in stores if s["is_approved"])


def place_order(client, customer, store_id: int, *, method="upi", coupon=None, qty=2) -> dict:
    store = client.get(f"/api/v1/stores/{store_id}").json()
    product = max((p for p in store["products"] if p["stock"] >= qty), key=lambda p: p["price"])
    r = client.post("/api/v1/cart/items", headers=customer,
                    json={"product_id": product["id"], "quantity": qty, "replace_cart": True})
    assert r.status_code == 200, r.text
    address = client.get("/api/v1/users/me/addresses", headers=customer).json()[0]
    r = client.post("/api/v1/orders", headers=customer,
                    json={"address_id": address["id"], "payment_method": method, "coupon_code": coupon})
    assert r.status_code == 201, r.text
    return r.json()
