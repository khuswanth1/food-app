import time
from urllib.parse import parse_qs, urlparse

import httpx
import jwt
import pytest

from app.core.config import settings
from app.routers.auth import STATE_COOKIE
from app.services import google_oauth

CLIENT_ID = "test-client.apps.googleusercontent.com"


@pytest.fixture(autouse=True)
def google_creds(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", CLIENT_ID)
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "secret")
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://web.test")


def id_token(**claims) -> str:
    base = {"iss": "https://accounts.google.com", "aud": CLIENT_ID, "sub": "g-123", "email": "Gina@Example.com",
            "email_verified": True, "name": "Gina Google", "exp": int(time.time()) + 300}
    return jwt.encode({**base, **claims}, "google-signs-these-with-its-own-rsa-keys", algorithm="HS256")


def fake_google(monkeypatch, token: str, status: int = 200):
    def handler(request: httpx.Request):
        assert request.url == google_oauth.TOKEN_URL
        return httpx.Response(status, json={"id_token": token} if status == 200 else {"error": "invalid_grant"})
    real = google_oauth.exchange_code
    monkeypatch.setattr(google_oauth, "exchange_code", lambda code: real(code, transport=httpx.MockTransport(handler)))


def start(client, role="customer") -> str:
    r = client.get(f"/api/v1/auth/google/login?role={role}", follow_redirects=False)
    assert r.status_code == 302
    query = parse_qs(urlparse(r.headers["location"]).query)
    assert query["client_id"] == [CLIENT_ID]
    return query["state"][0]


def callback(client, state: str) -> dict:
    r = client.get(f"/api/v1/auth/google/callback?code=abc&state={state}", follow_redirects=False)
    assert r.status_code == 302
    url = urlparse(r.headers["location"])
    assert f"{url.scheme}://{url.netloc}{url.path}" == "http://web.test/auth/google"
    return {k: v[0] for k, v in parse_qs(url.fragment).items()}


def test_providers_reports_google(client, monkeypatch):
    assert client.get("/api/v1/auth/providers").json() == {"google": True}
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "")
    assert client.get("/api/v1/auth/providers").json() == {"google": False}
    assert client.get("/api/v1/auth/google/login", follow_redirects=False).status_code == 404


def test_google_signup_then_exchange(client, monkeypatch):
    fake_google(monkeypatch, id_token())
    result = callback(client, start(client, role="vendor"))
    tokens = client.post("/api/v1/auth/google/exchange", json={"ticket": result["ticket"]})
    assert tokens.status_code == 200, tokens.text
    user = tokens.json()["user"]
    assert (user["email"], user["role"], user["full_name"]) == ("gina@example.com", "vendor", "Gina Google")

    # Google-only accounts can't log in with a password
    r = client.post("/api/v1/auth/login", json={"email": "gina@example.com", "password": "!google"})
    assert r.status_code == 401


def test_google_links_existing_account(client, monkeypatch):
    fake_google(monkeypatch, id_token(email="customer@quickkart.dev", sub="g-777"))
    result = callback(client, start(client, role="vendor"))
    user = client.post("/api/v1/auth/google/exchange", json={"ticket": result["ticket"]}).json()["user"]
    assert user["role"] == "customer"  # existing account keeps its role


def test_state_must_match_cookie(client, monkeypatch):
    fake_google(monkeypatch, id_token())
    state = start(client)
    client.cookies.delete(STATE_COOKIE)
    assert callback(client, state) == {"error": "google_state"}


@pytest.mark.parametrize("claims, status, error", [
    ({"email_verified": False}, 200, "google_unverified"),
    ({"aud": "someone-else"}, 200, "google_failed"),
    ({}, 400, "google_failed"),
])
def test_rejected_google_responses(client, monkeypatch, claims, status, error):
    fake_google(monkeypatch, id_token(**claims), status=status)
    assert callback(client, start(client)) == {"error": error}


def test_user_cancelled(client):
    r = client.get("/api/v1/auth/google/callback?error=access_denied", follow_redirects=False)
    assert r.headers["location"].endswith("#error=google_cancelled")


def test_access_token_is_not_a_ticket(client, customer):
    token = customer["Authorization"].split()[1]
    assert client.post("/api/v1/auth/google/exchange", json={"ticket": token}).status_code == 401
