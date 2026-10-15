import io

import pytest

from app.core.config import settings
from app.product_photos import stock_photo
from tests.conftest import vendor_store

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
API = "/api/v1"


@pytest.fixture(autouse=True)
def upload_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    return tmp_path


def _own_product(client, vendor):
    store = vendor_store(client, vendor)
    return client.get(f"{API}/vendor/stores/{store['id']}/products", headers=vendor).json()[0]


def _upload(client, headers, product_id, data=PNG, name="dish.png", ctype="image/png"):
    return client.post(f"{API}/vendor/products/{product_id}/image", headers=headers,
                       files={"file": (name, io.BytesIO(data), ctype)})


def test_seeded_products_have_stock_photos(client):
    store_id = client.get(f"{API}/stores").json()["items"][0]["id"]
    products = client.get(f"{API}/stores/{store_id}").json()["products"]
    assert products and all(p["image_url"] == stock_photo(p["name"]) for p in products)
    assert products[0]["image_url"].startswith("https://images.unsplash.com/")


def test_vendor_uploads_and_removes_photo(client, vendor, upload_dir):
    product = _own_product(client, vendor)
    r = _upload(client, vendor, product["id"])
    assert r.status_code == 200, r.text
    url = r.json()["image_url"]
    assert url.startswith("/api/v1/uploads/products/") and url.endswith(".png")
    saved = upload_dir / "products" / url.rsplit("/", 1)[1]
    assert saved.read_bytes() == PNG

    # Replacing deletes the previous upload
    url2 = _upload(client, vendor, product["id"]).json()["image_url"]
    assert url2 != url and not saved.exists()

    # Removing falls back to the stock photo and deletes the file
    r = client.delete(f"{API}/vendor/products/{product['id']}/image", headers=vendor)
    assert r.json()["image_url"] == stock_photo(product["name"])
    assert not (upload_dir / "products" / url2.rsplit("/", 1)[1]).exists()


def test_rejects_non_images_and_oversized_files(client, vendor, monkeypatch):
    product = _own_product(client, vendor)
    # The content decides, not the filename or declared type
    r = _upload(client, vendor, product["id"], data=b"<svg onload=alert(1)>", name="x.png", ctype="image/png")
    assert r.status_code == 415 and r.json()["error"]["code"] == "invalid_image"
    monkeypatch.setattr(settings, "MAX_IMAGE_MB", 0)
    r = _upload(client, vendor, product["id"])
    assert r.status_code == 413 and r.json()["error"]["code"] == "image_too_large"


def test_only_owner_vendor_can_upload(client, vendor, customer):
    own = {s["id"] for s in client.get(f"{API}/vendor/stores", headers=vendor).json()}
    other_store = next(s for s in client.get(f"{API}/stores?size=50").json()["items"] if s["id"] not in own)
    other_product = client.get(f"{API}/stores/{other_store['id']}").json()["products"][0]
    assert _upload(client, vendor, other_product["id"]).status_code == 404
    assert _upload(client, customer, other_product["id"]).status_code == 403


def test_image_url_must_be_web_or_upload(client, vendor):
    product = _own_product(client, vendor)
    r = client.patch(f"{API}/vendor/products/{product['id']}", headers=vendor, json={"image_url": "javascript:alert(1)"})
    assert r.status_code == 422
