"""Redis-backed JSON cache with a transparent in-memory fallback for local dev/tests."""
import json
import logging
import time
from typing import Any

from app.core.config import settings

log = logging.getLogger("quickkart.cache")


class _MemoryBackend:
    def __init__(self):
        self._data: dict[str, tuple[float, str]] = {}

    def get(self, key):
        item = self._data.get(key)
        if not item:
            return None
        expires, value = item
        if expires < time.time():
            self._data.pop(key, None)
            return None
        return value

    def setex(self, key, ttl, value):
        self._data[key] = (time.time() + ttl, value)

    def delete_prefix(self, prefix):
        for k in [k for k in self._data if k.startswith(prefix)]:
            self._data.pop(k, None)

    def flush(self):
        self._data.clear()


class Cache:
    def __init__(self, url: str | None):
        self.backend_name = "memory"
        self._redis = None
        self._mem = _MemoryBackend()
        if url:
            try:
                import redis

                client = redis.Redis.from_url(url, decode_responses=True, socket_connect_timeout=1)
                client.ping()
                self._redis = client
                self.backend_name = "redis"
            except Exception as e:  # noqa: BLE001 - degrade gracefully
                log.warning("Redis unavailable (%s); using in-memory cache", e)

    def get(self, key: str) -> Any | None:
        try:
            raw = self._redis.get(key) if self._redis else self._mem.get(key)
        except Exception:  # noqa: BLE001
            return None
        return json.loads(raw) if raw else None

    def set(self, key: str, value: Any, ttl: int = 60) -> None:
        raw = json.dumps(value, default=str)
        try:
            if self._redis:
                self._redis.setex(key, ttl, raw)
            else:
                self._mem.setex(key, ttl, raw)
        except Exception:  # noqa: BLE001
            pass

    def invalidate(self, prefix: str) -> None:
        try:
            if self._redis:
                for key in self._redis.scan_iter(f"{prefix}*"):
                    self._redis.delete(key)
            else:
                self._mem.delete_prefix(prefix)
        except Exception:  # noqa: BLE001
            pass

    def clear(self) -> None:
        if self._redis:
            self.invalidate("qk:")
        else:
            self._mem.flush()


cache = Cache(settings.REDIS_URL)
