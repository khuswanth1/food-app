from math import asin, cos, radians, sin, sqrt

AVG_SPEED_KMH = 25
HANDOFF_MIN = 4


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    lat1, lng1, lat2, lng2 = map(radians, (lat1, lng1, lat2, lng2))
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lng2 - lng1) / 2) ** 2
    return 2 * 6371 * asin(sqrt(a))


def travel_minutes(distance_km: float) -> int:
    return round(distance_km / AVG_SPEED_KMH * 60) + HANDOFF_MIN


def delivery_eta(prep_time: int, distance_km: float) -> int:
    return prep_time + travel_minutes(distance_km)
