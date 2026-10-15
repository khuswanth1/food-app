"""WebSocket endpoints. Auth via ``?token=<access JWT>`` since browsers can't set WS headers."""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.database import SessionLocal
from app.core.exceptions import AppError
from app.core.deps import user_from_token
from app.models import Role
from app.routers.orders import load_order
from app.services.realtime import hub

router = APIRouter(tags=["Realtime"])


async def _serve(ws: WebSocket, channels: list[str]) -> None:
    for ch in channels:
        await hub.connect(ch, ws)
    try:
        await ws.send_json({"type": "connected", "channels": channels})
        while True:
            msg = await ws.receive_text()  # keep-alive pings from client
            if msg == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        for ch in channels:
            hub.disconnect(ch, ws)


@router.websocket("/ws/notifications")
async def notifications_ws(ws: WebSocket, token: str):
    await ws.accept()
    with SessionLocal() as db:
        try:
            user = user_from_token(db, token)
        except AppError:
            await ws.close(code=4401)
            return
        channels = [f"user:{user.id}"]
        if user.role == Role.DELIVERY:
            channels.append("partners")
    await _serve(ws, channels)


@router.websocket("/ws/orders/{order_id}")
async def order_ws(ws: WebSocket, order_id: int, token: str):
    await ws.accept()
    with SessionLocal() as db:
        try:
            user = user_from_token(db, token)
            load_order(db, order_id, user)
        except AppError:
            await ws.close(code=4403)
            return
    await _serve(ws, [f"order:{order_id}"])
