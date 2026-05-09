import asyncio
from typing import List, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(prefix="/api/v1/sync")

connections: List[WebSocket] = []

# Stored by main.py lifespan so sync route handlers can dispatch broadcasts
# from the thread-pool without using the private asyncio._get_running_loop().
_event_loop: Optional[asyncio.AbstractEventLoop] = None


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _event_loop
    _event_loop = loop


def schedule_broadcast(event: dict) -> None:
    """Thread-safe: schedule a broadcast onto the main event loop."""
    if _event_loop is not None and _event_loop.is_running():
        asyncio.run_coroutine_threadsafe(broadcast(event), _event_loop)


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connections.append(ws)
    try:
        while True:
            # Receive pings or ignore; echo small ack
            _ = await ws.receive_text()
            await ws.send_text("ack")
    except WebSocketDisconnect:
        if ws in connections:
            connections.remove(ws)


async def broadcast(event: dict):
    dead = []
    for c in connections:
        try:
            await c.send_json(event)
        except Exception:
            dead.append(c)
    for d in dead:
        if d in connections:
            connections.remove(d)


