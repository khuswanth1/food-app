def test_list_paginates_and_filters(client):
    r = client.get("/api/v1/stores?size=5")
    body = r.json()
    assert r.status_code == 200 and len(body["items"]) == 5 and body["total"] >= 14 and body["pages"] >= 3

    groceries = client.get("/api/v1/stores?store_type=grocery&size=50").json()["items"]
    assert groceries and all(s["store_type"] == "grocery" for s in groceries)

    veg = client.get("/api/v1/stores?veg_only=true&size=50").json()["items"]
    assert veg and all(s["is_veg_only"] for s in veg)


def test_pending_stores_hidden(client):
    names = [s["name"] for s in client.get("/api/v1/stores?size=100").json()["items"]]
    assert not any("pending" in n for n in names)


def test_search_matches_dish_names(client):
    items = client.get("/api/v1/stores?q=margherita").json()["items"]
    assert [s["name"] for s in items] == ["Napoli Wood Fired"]


def test_sort_by_distance(client):
    items = client.get("/api/v1/stores?sort=distance&lat=12.97&lng=77.59&size=50").json()["items"]
    distances = [s["distance_km"] for s in items]
    assert distances == sorted(distances)
    assert all(s["eta_minutes"] > 0 for s in items)


def test_store_detail_and_reviews(client):
    sid = client.get("/api/v1/stores?q=dosa").json()["items"][0]["id"]
    d = client.get(f"/api/v1/stores/{sid}").json()
    assert d["products"] and "Breakfast" in d["categories"]
    assert client.get(f"/api/v1/stores/{sid}/reviews").status_code == 200
    assert client.get("/api/v1/stores/99999").status_code == 404


def test_cuisines_meta(client):
    assert "Pizza" in client.get("/api/v1/stores/meta/cuisines").json()


def test_favorites_toggle(client, customer):
    sid = client.get("/api/v1/stores?q=burger").json()["items"][0]["id"]
    client.post(f"/api/v1/favorites/{sid}", headers=customer)
    favs = client.get("/api/v1/favorites", headers=customer).json()
    assert sid in [f["id"] for f in favs]
    assert client.get(f"/api/v1/stores/{sid}", headers=customer).json()["is_favorite"] is True
    client.post(f"/api/v1/favorites/{sid}", headers=customer)
    assert sid not in [f["id"] for f in client.get("/api/v1/favorites", headers=customer).json()]
