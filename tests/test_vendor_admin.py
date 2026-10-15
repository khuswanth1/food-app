from tests.conftest import place_order, vendor_store


def test_vendor_store_requires_approval(client, vendor, admin):
    r = client.post("/api/v1/vendor/stores", headers=vendor, json={
        "name": "Test Kitchen", "store_type": "restaurant", "cuisines": ["Thai"], "address": "1 Test Rd",
        "lat": 12.97, "lng": 77.59})
    assert r.status_code == 201 and r.json()["is_approved"] is False
    sid = r.json()["id"]
    assert "Test Kitchen" not in [s["name"] for s in client.get("/api/v1/stores?size=100").json()["items"]]
    client.post(f"/api/v1/admin/stores/{sid}/approval?approved=true", headers=admin)
    assert "Test Kitchen" in [s["name"] for s in client.get("/api/v1/stores?size=100").json()["items"]]


def test_vendor_product_crud_and_low_stock(client, vendor):
    store = vendor_store(client, vendor)
    r = client.post(f"/api/v1/vendor/stores/{store['id']}/products", headers=vendor, json={
        "name": "Test Thali", "category": "Meals", "price": 199, "stock": 50, "tags": ["new"]})
    assert r.status_code == 201
    pid = r.json()["id"]
    r = client.patch(f"/api/v1/vendor/products/{pid}", headers=vendor, json={"price": 219})
    assert r.json()["price"] == 219
    r = client.put(f"/api/v1/vendor/products/{pid}/stock", headers=vendor, json={"stock": 3})
    assert r.json()["is_low_stock"] is True
    assert pid in [p["id"] for p in client.get("/api/v1/vendor/inventory/low-stock", headers=vendor).json()]
    notes = client.get("/api/v1/notifications", headers=vendor).json()["items"]
    assert any(n["kind"] == "stock" for n in notes)
    assert client.delete(f"/api/v1/vendor/products/{pid}", headers=vendor).status_code == 200


def test_vendor_cannot_touch_other_vendor_data(client, vendor):
    from tests.conftest import login
    other = login(client, "meera.vendor@quickkart.dev")
    store = vendor_store(client, vendor)
    assert client.patch(f"/api/v1/vendor/stores/{store['id']}", headers=other, json={"name": "Hijack"}).status_code == 404
    pid = client.get(f"/api/v1/vendor/stores/{store['id']}/products", headers=vendor).json()[0]["id"]
    assert client.patch(f"/api/v1/vendor/products/{pid}", headers=other, json={"price": 1}).status_code == 404


def test_vendor_analytics(client, vendor):
    a = client.get("/api/v1/vendor/analytics?days=30", headers=vendor).json()
    assert len(a["daily"]) == 30 and a["totals"]["orders"] >= 0 and "status_breakdown" in a


def test_admin_overview_and_reports(client, admin):
    a = client.get("/api/v1/admin/analytics", headers=admin).json()
    assert a["users_by_role"]["customer"] == 8 and a["pending_stores"] == 1 and len(a["daily"]) == 30
    rep = client.get("/api/v1/admin/reports/sales?days=30", headers=admin).json()
    assert rep["summary"]["gmv"] > 0


def test_admin_coupon_crud_and_audit(client, admin, customer):
    r = client.post("/api/v1/admin/coupons", headers=admin, json={
        "code": "TEST10", "discount_type": "flat", "value": 10})
    assert r.status_code == 201
    assert client.post("/api/v1/admin/coupons", headers=admin, json={
        "code": "TEST10", "discount_type": "flat", "value": 10}).status_code == 409
    logs = client.get("/api/v1/admin/audit-logs?action=coupon", headers=admin).json()["items"]
    assert logs[0]["action"] == "coupon.created"


def test_admin_moderation(client, admin):
    rv = client.get("/api/v1/admin/reviews", headers=admin).json()["items"][0]
    hidden = client.post(f"/api/v1/admin/reviews/{rv['id']}/toggle-hidden", headers=admin).json()
    assert hidden["is_hidden"] is True
    reviews = client.get(f"/api/v1/stores/{rv['store_id']}/reviews?size=100").json()["items"]
    assert rv["id"] not in [r["id"] for r in reviews]


def test_admin_cancel_and_payments(client, admin, customer, vendor):
    order = place_order(client, customer, vendor_store(client, vendor)["id"], method="card")
    client.post(f"/api/v1/orders/{order['id']}/pay", headers=customer, json={})
    r = client.post(f"/api/v1/admin/orders/{order['id']}/cancel", headers=admin, json={"reason": "Fraud check"})
    assert r.json()["payment_status"] == "refunded"
    refunds = client.get("/api/v1/admin/payments?status=refunded", headers=admin).json()
    assert refunds["total"] >= 1


def test_support_ticket_flow(client, customer, admin):
    t = client.post("/api/v1/support/tickets", headers=customer, json={"subject": "Late order", "message": "Was 20 min late"}).json()
    client.post(f"/api/v1/admin/support/{t['id']}/reply", headers=admin, json={"reply": "Sorry! ₹50 credited."})
    mine = client.get("/api/v1/support/tickets", headers=customer).json()
    assert mine[0]["status"] == "resolved" and mine[0]["admin_reply"]
