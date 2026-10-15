import httpx
import pytest

from app.services import geocode

URL = "/api/v1/users/me/reverse-geocode"
NOMINATIM = {
    "display_name": "12, MG Road, Shanthala Nagar, Bengaluru, Karnataka, 560001, India",
    "address": {"house_number": "12", "road": "MG Road", "suburb": "Shanthala Nagar", "city": "Bengaluru",
                "postcode": "560 001", "country": "India"},
}


@pytest.fixture()
def nominatim(monkeypatch):
    calls = []
    real = httpx.Client

    def install(handler):
        def wrapped(request):
            calls.append(request)
            return handler(request)
        monkeypatch.setattr(geocode.httpx, "Client", lambda **kw: real(**{**kw, "transport": httpx.MockTransport(wrapped)}))
        return calls
    return install


def test_reverse_geocode_fills_address(client, customer, nominatim):
    calls = nominatim(lambda req: httpx.Response(200, json=NOMINATIM))
    r = client.get(URL, params={"lat": 12.9756, "lng": 77.6050}, headers=customer)
    assert r.status_code == 200, r.text
    assert r.json() == {"line1": "12 MG Road, Shanthala Nagar", "city": "Bengaluru", "pincode": "560001",
                        "display_name": NOMINATIM["display_name"]}
    assert calls[0].url.params["lat"] == "12.9756" and "QuickKart" in calls[0].headers["user-agent"]
    # Same spot again is served from cache
    client.get(URL, params={"lat": 12.97561, "lng": 77.60501}, headers=customer)
    assert len(calls) == 1


def test_reverse_geocode_errors(client, customer, nominatim):
    nominatim(lambda req: httpx.Response(200, json={"error": "Unable to geocode"}))
    r = client.get(URL, params={"lat": 0.5, "lng": -160}, headers=customer)
    assert r.status_code == 404 and r.json()["error"]["code"] == "geocode_not_found"

    nominatim(lambda req: httpx.Response(503))
    r = client.get(URL, params={"lat": 1.5, "lng": -150}, headers=customer)
    assert r.status_code == 502 and r.json()["error"]["code"] == "geocode_failed"


def test_reverse_geocode_validates_and_requires_login(client, customer):
    assert client.get(URL, params={"lat": 200, "lng": 0}, headers=customer).status_code == 422
    assert client.get(URL, params={"lat": 12.9, "lng": 77.5}).status_code == 401
