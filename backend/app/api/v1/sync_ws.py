import asyncio
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from ...db.base import get_db
from ...db.models import Session as SessionModel

router = APIRouter(prefix="/api/v1/sync")

# Map session_token → (WebSocket, user_id) so we can scope broadcasts
connections: Dict[str, Tuple[WebSocket, int]] = {}

_event_loop: Optional[asyncio.AbstractEventLoop] = None


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _event_loop
    _event_loop = loop


def schedule_broadcast(event: dict, user_id: Optional[int] = None) -> None:
    """Thread-safe: schedule a broadcast onto the main event loop.

    If user_id is provided, only that user's connections receive the event.
    """
    if _event_loop is not None and _event_loop.is_running():
        asyncio.run_coroutine_threadsafe(broadcast(event, user_id), _event_loop)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(...)):
    """
    Authenticated WebSocket endpoint.
    Requires ?token=<session_token> query param.
    Closes with code 1008 (Policy Violation) if token is missing, invalid, or expired.
    """
    db = next(get_db())
    session = db.query(SessionModel).filter(
        SessionModel.session_token == token
    ).first()

    if not session or session.expires_at < _utcnow():
        await ws.close(code=1008)
        return

    user_id: int = session.user_id
    await ws.accept()
    connections[token] = (ws, user_id)

    try:
        while True:
            _ = await ws.receive_text()
            await ws.send_text("ack")
    except WebSocketDisconnect:
        connections.pop(token, None)


async def broadcast(event: dict, user_id: Optional[int] = None) -> None:
    """Send event to all authenticated connections, optionally scoped to one user."""
    dead: list[str] = []
    for tok, (ws, uid) in list(connections.items()):
        if user_id is not None and uid != user_id:
            continue
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(tok)
    for tok in dead:
        connections.pop(tok, None)
