from tests.conftest import login


def test_register_login_and_me(client):
    r = client.post("/api/v1/auth/register", json={
        "email": "new@example.com", "password": "Secret@123", "full_name": "New User", "role": "customer"})
    assert r.status_code == 201
    tokens = r.json()
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me.json()["email"] == "new@example.com"

    refreshed = client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200


def test_duplicate_email_rejected(client):
    body = {"email": "customer@quickkart.dev", "password": "Secret@123", "full_name": "X Y"}
    r = client.post("/api/v1/auth/register", json=body)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "email_taken"


def test_cannot_self_register_as_admin(client):
    r = client.post("/api/v1/auth/register", json={
        "email": "evil@example.com", "password": "Secret@123", "full_name": "Evil", "role": "admin"})
    assert r.status_code == 422


def test_bad_password_and_validation_shape(client):
    r = client.post("/api/v1/auth/login", json={"email": "customer@quickkart.dev", "password": "nope"})
    assert r.status_code == 401
    r = client.post("/api/v1/auth/register", json={"email": "bad", "password": "1"})
    assert r.status_code == 422
    assert {d["field"] for d in r.json()["error"]["details"]} >= {"email", "password"}


def test_refresh_token_cannot_be_used_as_access(client):
    r = client.post("/api/v1/auth/login", json={"email": "customer@quickkart.dev", "password": "Password@123"})
    bad = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {r.json()['refresh_token']}"})
    assert bad.status_code == 401


def test_rbac_blocks_other_roles(client, customer, vendor):
    assert client.get("/api/v1/admin/analytics", headers=customer).status_code == 403
    assert client.get("/api/v1/vendor/stores", headers=customer).status_code == 403
    assert client.get("/api/v1/cart", headers=vendor).status_code == 403
    assert client.get("/api/v1/cart").status_code == 401


def test_suspended_user_cannot_login(client, admin):
    users = client.get("/api/v1/admin/users?q=aman", headers=admin).json()["items"]
    client.post(f"/api/v1/admin/users/{users[0]['id']}/toggle-active", headers=admin)
    r = client.post("/api/v1/auth/login", json={"email": "aman@quickkart.dev", "password": "Password@123"})
    assert r.status_code == 403


def test_profile_and_addresses(client, customer):
    r = client.patch("/api/v1/users/me", headers=customer, json={"full_name": "Priya S."})
    assert r.json()["full_name"] == "Priya S."
    r = client.post("/api/v1/users/me/addresses", headers=customer, json={
        "label": "Gym", "line1": "1 Fitness St", "city": "Bengaluru", "pincode": "560001",
        "lat": 12.9, "lng": 77.6, "is_default": True})
    assert r.status_code == 201
    addrs = client.get("/api/v1/users/me/addresses", headers=customer).json()
    assert addrs[0]["label"] == "Gym" and sum(a["is_default"] for a in addrs) == 1
    other = login(client, "aman@quickkart.dev")
    assert client.delete(f"/api/v1/users/me/addresses/{addrs[0]['id']}", headers=other).status_code == 404
