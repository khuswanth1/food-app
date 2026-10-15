"""WebSocket fan-out hub.

Channels: ``user:{id}`` (notifications), ``order:{id}`` (status/location), ``partners`` (new jobs).
Sync request handlers call :meth:`RealtimeHub.publish`. With Redis configured, messages go through
Redis pub/sub so every API worker can deliver to its own sockets; otherwise they fan out in-process.
"""
import asyncio
import json
import logging
from collections import defaultdict

from fastapi import WebSocket

log = logging.getLogger("quickkart.realtime")
PREFIX = "qk:rt:"


class RealtimeHub:
    def __init__(self):
        self.channels: dict[str, set[WebSocket]] = defaultdict(set)
        self.loop: asyncio.AbstractEventLoop | None = None
        self._pub = None
        self._listener: asyncio.Task | None = None

    async def start(self, redis_url: str | None) -> None:
        self.loop = asyncio.get_running_loop()
        if not redis_url:
            return
        try:
            import redis
            import redis.asyncio as aioredis

            self._pub = redis.Redis.from_url(redis_url, socket_connect_timeout=1)
            self._pub.ping()
            sub = aioredis.Redis.from_url(redis_url).pubsub()
            await sub.psubscribe(f"{PREFIX}*")
            self._listener = asyncio.create_task(self._listen(sub))
            log.info("Realtime hub using Redis pub/sub")
        except Exception as e:  # noqa: BLE001
            self._pub = None
            log.warning("Realtime hub falling back to in-process (%s)", e)

    async def stop(self) -> None:
        if self._listener:
            self._listener.cancel()

    async def _listen(self, sub) -> None:
        async for msg in sub.listen():
            if msg.get("type") != "pmessage":
                continue
            channel = msg["channel"].decode().removeprefix(PREFIX)
            await self._fanout(channel, json.loads(msg["data"]))

    async def connect(self, channel: str, ws: WebSocket) -> None:
        self.channels[channel].add(ws)

    def disconnect(self, channel: str, ws: WebSocket) -> None:
        self.channels[channel].discard(ws)

    async def _fanout(self, channel: str, message: dict) -> None:
        for ws in list(self.channels.get(channel, ())):
            try:
                await ws.send_json(message)
            except Exception:  # noqa: BLE001 - dead socket
                self.disconnect(channel, ws)

    def publish(self, channel: str, message: dict) -> None:
        """Thread-safe publish usable from sync route handlers."""
        if self._pub is not None:
            try:
                self._pub.publish(PREFIX + channel, json.dumps(message, default=str))
                return
            except Exception:  # noqa: BLE001
                log.warning("Redis publish failed; delivering locally")
        if self.loop is None or self.loop.is_closed():
            return
        payload = json.loads(json.dumps(message, default=str))
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self.loop:
            self.loop.create_task(self._fanout(channel, payload))
        else:
            asyncio.run_coroutine_threadsafe(self._fanout(channel, payload), self.loop)


hub = RealtimeHub()
