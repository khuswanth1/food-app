"""Reverse geocoding (GPS coordinates -> street, city, pincode) for "Use my current location".

Uses OpenStreetMap's Nominatim, the same OSM data the app's maps show. Requests go through the API, not the
browser, so Nominatim sees one identifying User-Agent, and results are cached because its usage policy allows
about one request per second (https://operations.osmfoundation.org/policies/nominatim/)."""
import logging

import httpx
from fastapi import status

from app.core.cache import cache
from app.core.config import settings
from app.core.exceptions import AppError

log = logging.getLogger("quickkart.geocode")
CACHE_TTL = 24 * 3600


def _first(addr: dict, *keys: str) -> str:
    return next((addr[k] for k in keys if addr.get(k)), "")


def _to_address(data: dict) -> dict:
    a = data.get("address") or {}
    street = " ".join(p for p in (a.get("house_number"), _first(a, "road", "pedestrian", "residential")) if p)
    area = _first(a, "neighbourhood", "suburb", "quarter", "city_district")
    return {
        "line1": ", ".join(p for p in (street, area) if p) or data.get("display_name", "").split(",")[0],
        "city": _first(a, "city", "town", "village", "municipality", "state_district", "county"),
        "pincode": a.get("postcode", "").replace(" ", ""),
        "display_name": data.get("display_name", ""),
    }


def reverse(lat: float, lng: float, transport: httpx.BaseTransport | None = None) -> dict:
    if not settings.GEOCODER_URL:
        raise AppError("Address lookup is turned off on this server", code="geocode_disabled",
                       status_code=status.HTTP_503_SERVICE_UNAVAILABLE)
    # ~11 m precision: nearby lookups share a cache entry without changing the street they resolve to.
    key = f"qk:geo:{lat:.4f},{lng:.4f}"
    if (hit := cache.get(key)) is not None:
        return hit
    try:
        with httpx.Client(timeout=8, transport=transport,
                          headers={"User-Agent": settings.GEOCODER_USER_AGENT, "Accept-Language": "en"}) as client:
            r = client.get(settings.GEOCODER_URL, params={"format": "jsonv2", "lat": lat, "lon": lng,
                                                          "addressdetails": 1, "zoom": 18})
            r.raise_for_status()
            data = r.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("Reverse geocoding failed: %s", exc)
        raise AppError("Couldn't look up an address for this spot. Please type it in.", code="geocode_failed",
                       status_code=status.HTTP_502_BAD_GATEWAY) from exc
    if "error" in data:
        raise AppError("No address found at this location. Please type it in.", code="geocode_not_found",
                       status_code=status.HTTP_404_NOT_FOUND)
    result = _to_address(data)
    cache.set(key, result, ttl=CACHE_TTL)
    return result
