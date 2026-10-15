from tests.conftest import login, place_order, vendor_store


def test_cart_single_store_rule(client, customer):
    stores = client.get("/api/v1/stores?size=50").json()["items"]
    a, b = (client.get(f"/api/v1/stores/{s['id']}").json() for s in stores[:2])
    client.post("/api/v1/cart/items", headers=customer, json={"product_id": a["products"][0]["id"], "replace_cart": True})
    r = client.post("/api/v1/cart/items", headers=customer, json={"product_id": b["products"][0]["id"]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "cart_store_conflict"
    r = client.post("/api/v1/cart/items", headers=customer,
                    json={"product_id": b["products"][0]["id"], "replace_cart": True})
    assert r.json()["store_id"] == b["id"]


def test_cart_quantity_and_stock_limit(client, customer):
    store = client.get(f"/api/v1/stores/{client.get('/api/v1/stores').json()['items'][0]['id']}").json()
    p = store["products"][0]
    cart = client.post("/api/v1/cart/items", headers=customer, json={"product_id": p["id"], "replace_cart": True}).json()
    item_id = cart["items"][0]["id"]
    r = client.patch(f"/api/v1/cart/items/{item_id}", headers=customer, json={"quantity": 3})
    assert r.json()["items"][0]["quantity"] == 3
    r = client.patch(f"/api/v1/cart/items/{item_id}", headers=customer, json={"quantity": 50})
    if p["stock"] < 50:
        assert r.json()["error"]["code"] == "insufficient_stock"


def test_coupons(client, customer):
    sid = client.get("/api/v1/stores?q=napoli").json()["items"][0]["id"]
    store = client.get(f"/api/v1/stores/{sid}").json()
    expensive = max(store["products"], key=lambda p: p["price"])
    client.post("/api/v1/cart/items", headers=customer, json={"product_id": expensive["id"], "quantity": 2, "replace_cart": True})
    ok = client.post("/api/v1/cart/coupon", headers=customer, json={"code": "welcome50"})
    assert ok.status_code == 200 and ok.json()["discount"] == 100  # capped at max_discount
    for code, err in [("EXPIRED10", "coupon_expired"), ("NOPE", "coupon_invalid")]:
        r = client.post("/api/v1/cart/coupon", headers=customer, json={"code": code})
        assert r.status_code == 400 and r.json()["error"]["code"] == err
    store_locked = client.post("/api/v1/cart/coupon", headers=customer, json={"code": "FRESH20"})
    assert store_locked.status_code == 400


def test_full_order_lifecycle(client, customer, vendor, rider):
    store = vendor_store(client, vendor)
    order = place_order(client, customer, store["id"], method="upi")
    oid = order["id"]
    assert order["status"] == "placed" and order["payment_status"] == "pending"

    # Vendor can't confirm before payment
    r = client.post(f"/api/v1/vendor/orders/{oid}/status", headers=vendor, json={"status": "confirmed"})
    assert r.json()["error"]["code"] == "payment_pending"

    failed = client.post(f"/api/v1/orders/{oid}/pay", headers=customer, json={"simulate_failure": True})
    assert failed.json()["status"] == "failed"
    paid = client.post(f"/api/v1/orders/{oid}/pay", headers=customer, json={})
    assert paid.json()["status"] == "paid"

    for s in ["confirmed", "preparing"]:
        r = client.post(f"/api/v1/vendor/orders/{oid}/status", headers=vendor, json={"status": s})
        assert r.status_code == 200, r.text

    # Rider sees it, accepts it; second accept is rejected
    available = client.get("/api/v1/delivery/available?radius_km=100", headers=rider).json()
    assert oid in [j["id"] for j in available]
    assert client.post(f"/api/v1/delivery/orders/{oid}/accept", headers=rider).status_code == 200
    other = login(client, "kiran.rider@quickkart.dev")
    # Once assigned, the order is invisible to other partners (no existence leak)
    assert client.post(f"/api/v1/delivery/orders/{oid}/accept", headers=other).status_code == 404

    # Can't pick up before READY; illegal skip rejected
    r = client.post(f"/api/v1/delivery/orders/{oid}/status", headers=rider, json={"status": "picked_up"})
    assert r.json()["error"]["code"] == "invalid_transition"
    client.post(f"/api/v1/vendor/orders/{oid}/status", headers=vendor, json={"status": "ready"})
    for s in ["picked_up", "out_for_delivery"]:
        assert client.post(f"/api/v1/delivery/orders/{oid}/status", headers=rider, json={"status": s}).status_code == 200

    loc = client.post("/api/v1/delivery/location", headers=rider, json={"lat": 12.97, "lng": 77.6})
    assert oid in loc.json()["updated_orders"]
    client.post(f"/api/v1/delivery/orders/{oid}/status", headers=rider, json={"status": "delivered"})

    detail = client.get(f"/api/v1/orders/{oid}", headers=customer).json()
    assert detail["status"] == "delivered" and detail["eta_minutes"] == 0
    assert [e["status"] for e in detail["events"]][:2] == ["placed", "confirmed"]

    invoice = client.get(f"/api/v1/orders/{oid}/invoice", headers=customer)
    assert invoice.status_code == 200 and order["order_number"] in invoice.text

    r = client.post(f"/api/v1/orders/{oid}/review", headers=customer, json={"order_id": oid, "rating": 5, "comment": "Great"})
    assert r.status_code == 201
    assert client.post(f"/api/v1/orders/{oid}/review", headers=customer,
                       json={"order_id": oid, "rating": 4}).status_code == 409

    earnings = client.get("/api/v1/delivery/earnings", headers=rider).json()
    assert earnings["today_deliveries"] >= 1


def test_cancel_restocks_and_refunds(client, customer, vendor):
    store = vendor_store(client, vendor)
    before = {p["id"]: p["stock"] for p in client.get(f"/api/v1/stores/{store['id']}").json()["products"]}
    order = place_order(client, customer, store["id"], method="card", qty=2)
    pid = order["items"][0]["product_id"]
    after = {p["id"]: p["stock"] for p in client.get(f"/api/v1/stores/{store['id']}").json()["products"]}
    assert after[pid] == before[pid] - 2

    client.post(f"/api/v1/orders/{order['id']}/pay", headers=customer, json={})
    r = client.post(f"/api/v1/orders/{order['id']}/cancel", headers=customer, json={"reason": "Ordered by mistake"})
    assert r.json()["status"] == "cancelled" and r.json()["payment_status"] == "refunded"
    restored = {p["id"]: p["stock"] for p in client.get(f"/api/v1/stores/{store['id']}").json()["products"]}
    assert restored[pid] == before[pid]


def test_cod_order_and_cancel_window(client, customer, vendor):
    store = vendor_store(client, vendor)
    order = place_order(client, customer, store["id"], method="cod")
    oid = order["id"]
    assert client.post(f"/api/v1/orders/{oid}/pay", headers=customer, json={}).json()["error"]["code"] == "cod"
    for s in ["confirmed", "preparing"]:
        client.post(f"/api/v1/vendor/orders/{oid}/status", headers=vendor, json={"status": s})
    r = client.post(f"/api/v1/orders/{oid}/cancel", headers=customer, json={})
    assert r.json()["error"]["code"] == "not_cancellable"


def test_orders_are_private(client, customer):
    sid = client.get("/api/v1/stores").json()["items"][0]["id"]
    order = place_order(client, customer, sid, method="cod")
    other = login(client, "aman@quickkart.dev")
    assert client.get(f"/api/v1/orders/{order['id']}", headers=other).status_code == 404
    assert client.get(f"/api/v1/orders/{order['id']}/invoice", headers=other).status_code == 404


def test_empty_cart_checkout(client, customer):
    client.delete("/api/v1/cart", headers=customer)
    address = client.get("/api/v1/users/me/addresses", headers=customer).json()[0]
    r = client.post("/api/v1/orders", headers=customer, json={"address_id": address["id"]})
    assert r.json()["error"]["code"] == "cart_empty"


def test_notifications_flow(client, customer, vendor):
    store = vendor_store(client, vendor)
    place_order(client, customer, store["id"], method="cod")
    notes = client.get("/api/v1/notifications", headers=vendor).json()
    assert notes["unread"] >= 1 and any(n["title"] == "New order" for n in notes["items"])
    client.post("/api/v1/notifications/read-all", headers=vendor)
    assert client.get("/api/v1/notifications", headers=vendor).json()["unread"] == 0


def _limited_product(client, vendor, **limits):
    store = vendor_store(client, vendor)
    product = max(client.get(f"/api/v1/vendor/stores/{store['id']}/products", headers=vendor).json(),
                  key=lambda p: p["stock"])
    r = client.patch(f"/api/v1/vendor/products/{product['id']}", headers=vendor, json=limits)
    assert r.status_code == 200, r.text
    return r.json()


def test_product_min_and_max_quantity(client, customer, vendor):
    p = _limited_product(client, vendor, min_qty=2, max_qty=4)
    assert (p["min_qty"], p["max_qty"]) == (2, 4)

    # "ADD" with quantity 1 is raised to the minimum
    cart = client.post("/api/v1/cart/items", headers=customer, json={"product_id": p["id"], "replace_cart": True}).json()
    item = cart["items"][0]
    assert item["quantity"] == 2

    r = client.patch(f"/api/v1/cart/items/{item['id']}", headers=customer, json={"quantity": 1})
    assert r.status_code == 400 and r.json()["error"]["code"] == "below_min_qty"
    r = client.patch(f"/api/v1/cart/items/{item['id']}", headers=customer, json={"quantity": 5})
    assert r.status_code == 400 and r.json()["error"]["code"] == "above_max_qty"
    r = client.post("/api/v1/cart/items", headers=customer, json={"product_id": p["id"], "quantity": 3})
    assert r.json()["error"]["code"] == "above_max_qty"
    assert client.patch(f"/api/v1/cart/items/{item['id']}", headers=customer, json={"quantity": 4}).status_code == 200
    # Zero still removes the line
    r = client.patch(f"/api/v1/cart/items/{item['id']}", headers=customer, json={"quantity": 0})
    assert r.json()["items"] == []


def test_checkout_rechecks_limits_changed_after_adding(client, customer, vendor):
    p = _limited_product(client, vendor, min_qty=1, max_qty=None)
    client.post("/api/v1/cart/items", headers=customer, json={"product_id": p["id"], "quantity": 5, "replace_cart": True})
    _limited_product(client, vendor, max_qty=3)  # vendor tightens the cap afterwards
    address = client.get("/api/v1/users/me/addresses", headers=customer).json()[0]
    r = client.post("/api/v1/orders", headers=customer, json={"address_id": address["id"], "payment_method": "cod"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "above_max_qty"


def test_invalid_quantity_limits_rejected(client, vendor):
    store = vendor_store(client, vendor)
    product = client.get(f"/api/v1/vendor/stores/{store['id']}/products", headers=vendor).json()[0]
    r = client.patch(f"/api/v1/vendor/products/{product['id']}", headers=vendor, json={"min_qty": 5, "max_qty": 2})
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_qty_limits"
    r = client.post(f"/api/v1/vendor/stores/{store['id']}/products", headers=vendor,
                    json={"name": "Combo", "category": "Mains", "price": 100, "min_qty": 3, "max_qty": 1})
    assert r.status_code == 422


def test_store_minimum_order_value(client, customer, vendor):
    store = vendor_store(client, vendor)
    cheapest = min((p for p in client.get(f"/api/v1/stores/{store['id']}").json()["products"] if p["stock"] > 0),
                   key=lambda p: p["price"])
    assert client.patch(f"/api/v1/vendor/stores/{store['id']}", headers=vendor,
                        json={"min_order": cheapest["price"] * 3}).status_code == 200
    cart = client.post("/api/v1/cart/items", headers=customer,
                       json={"product_id": cheapest["id"], "replace_cart": True}).json()
    assert cart["min_order"] == cheapest["price"] * 3
    address = client.get("/api/v1/users/me/addresses", headers=customer).json()[0]
    r = client.post("/api/v1/orders", headers=customer, json={"address_id": address["id"], "payment_method": "cod"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "min_order"
