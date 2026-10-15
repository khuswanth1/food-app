from datetime import datetime

from app.models import User
from app.services import recommendations as reco
from tests.conftest import place_order, vendor_store


def test_store_recommendations_have_reasons(client, customer):
    recos = client.get("/api/v1/recommendations/stores", headers=customer).json()
    assert len(recos) == 8
    assert all(r["reason"] for r in recos)
    scores = [r["score"] for r in recos]
    assert scores == sorted(scores, reverse=True)


def test_anonymous_recommendations_cold_start(client):
    assert len(client.get("/api/v1/recommendations/stores?limit=4").json()) == 4


def test_affinity_drives_ranking(client, db):
    """A brand-new user who only orders pizza should get the pizza place near the top with a taste reason."""
    tokens = client.post("/api/v1/auth/register", json={
        "email": "pizzafan@example.com", "password": "Secret@123", "full_name": "Pizza Fan"}).json()
    h = {"Authorization": f"Bearer {tokens['access_token']}"}
    client.post("/api/v1/users/me/addresses", headers=h, json={
        "line1": "1 Test Rd", "city": "Bengaluru", "pincode": "560001", "lat": 12.97, "lng": 77.59})
    napoli = client.get("/api/v1/stores?q=napoli").json()["items"][0]["id"]
    for _ in range(2):
        place_order(client, h, napoli, method="cod", qty=1)

    user = db.query(User).filter_by(email="pizzafan@example.com").one()
    recos = reco.recommend_stores(db, user, limit=5, now=datetime(2026, 1, 1, 20, 0))
    assert napoli in [r["store_id"] for r in recos[:3]]
    top = next(r for r in recos if r["store_id"] == napoli)
    assert top["reason"].startswith("Because you enjoy")


def test_smart_cart_suggestions(client, customer):
    sid = client.get("/api/v1/stores?q=spice route").json()["items"][0]["id"]
    store = client.get(f"/api/v1/stores/{sid}").json()
    main = next(p for p in store["products"] if p["category"] == "Main Course")
    client.post("/api/v1/cart/items", headers=customer, json={"product_id": main["id"], "replace_cart": True})
    sugg = client.get("/api/v1/recommendations/cart", headers=customer).json()
    assert sugg and main["id"] not in [s["product"]["id"] for s in sugg]
    assert all(s["product"]["store_id"] == sid for s in sugg)
    categories = {s["product"]["category"] for s in sugg}
    assert categories & {"Breads", "Beverages", "Desserts", "Biryani", "Starters"}


def test_product_recommendations(client, customer):
    r = client.get("/api/v1/recommendations/products", headers=customer)
    assert r.status_code == 200


def test_order_websocket_receives_updates(client, customer, vendor):
    order = place_order(client, customer, vendor_store(client, vendor)["id"], method="cod")
    token = customer["Authorization"].split()[1]
    with client.websocket_connect(f"/ws/orders/{order['id']}?token={token}") as ws:
        assert ws.receive_json()["type"] == "connected"
        client.post(f"/api/v1/vendor/orders/{order['id']}/status", headers=vendor, json={"status": "confirmed"})
        msg = ws.receive_json()
        assert msg["type"] == "order_update" and msg["data"]["status"] == "confirmed"


def test_websocket_rejects_strangers(client, customer):
    from tests.conftest import login
    order = place_order(client, customer, client.get("/api/v1/stores").json()["items"][0]["id"], method="cod")
    other = login(client, "aman@quickkart.dev")["Authorization"].split()[1]
    import pytest
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/orders/{order['id']}?token={other}") as ws:
            ws.receive_json()


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"
