import logging
from collections import defaultdict
from datetime import datetime, timedelta
from secrets import token_urlsafe
import hashlib
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from ...db.base import get_db
from ...db.models import Session as SessionModel, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/session")

SESSION_TTL_MIN = 60 * 24  # 24 hours

# ─── Brute-force protection ───────────────────────────────────────────────────
# In-memory per-device attempt tracker. Survives process restarts only within
# the same uvicorn process — sufficient for LAN kiosk deployments.
_MAX_ATTEMPTS = 5
_LOCKOUT_SECONDS = 15 * 60  # 15 minutes

# {device_id: {"attempts": int, "locked_until": float}}
_login_attempts: dict[str, dict] = defaultdict(lambda: {"attempts": 0, "locked_until": 0.0})


def _check_lockout(device_id: str) -> None:
    state = _login_attempts[device_id]
    if state["locked_until"] > time.monotonic():
        remaining = int(state["locked_until"] - time.monotonic())
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {remaining} seconds."
        )


def _record_failure(device_id: str) -> None:
    state = _login_attempts[device_id]
    state["attempts"] += 1
    if state["attempts"] >= _MAX_ATTEMPTS:
        state["locked_until"] = time.monotonic() + _LOCKOUT_SECONDS
        logger.warning("Device %s locked out after %d failed PIN attempts", device_id, _MAX_ATTEMPTS)


def _clear_attempts(device_id: str) -> None:
    _login_attempts[device_id] = {"attempts": 0, "locked_until": 0.0}


# ─── Models ───────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=8, pattern=r'^\d+$')
    device_id: str = Field(..., min_length=1, max_length=128)


class TokenRequest(BaseModel):
    session_token: str = Field(..., min_length=1)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _hash_pin(pin: str) -> str:
    """SHA-256 hash of PIN — matches frontend hashPin() in src/lib/auth.ts."""
    return hashlib.sha256(pin.encode()).hexdigest()


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("/login")
def session_login(body: LoginRequest, db: DBSession = Depends(get_db)):
    device_id = body.device_id

    # Check lockout before any DB query so we don't reveal user existence
    _check_lockout(device_id)

    user = db.query(User).filter(User.device_id == device_id).first()
    if not user or not user.pin_hash or _hash_pin(body.pin) != user.pin_hash:
        _record_failure(device_id)
        raise HTTPException(status_code=401, detail="Invalid device or PIN")

    # Successful login — clear failure counter
    _clear_attempts(device_id)

    expires = datetime.utcnow() + timedelta(minutes=SESSION_TTL_MIN)
    token = token_urlsafe(32)
    s = SessionModel(
        user_id=user.id,
        session_token=token,
        device_id=device_id,
        expires_at=expires,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    logger.info("User %s logged in from device %s", user.id, device_id)
    return {
        "session_token": token,
        "expires_at": expires.isoformat(),
        "user_id": user.id,
        "role": user.role,
    }


@router.post("/logout")
def session_logout(body: TokenRequest, db: DBSession = Depends(get_db)):
    db.query(SessionModel).filter(
        SessionModel.session_token == body.session_token
    ).delete()
    db.commit()
    return {"ok": True}


@router.post("/refresh")
def session_refresh(body: TokenRequest, db: DBSession = Depends(get_db)):
    s = db.query(SessionModel).filter(
        SessionModel.session_token == body.session_token
    ).first()
    if not s:
        raise HTTPException(status_code=401, detail="Invalid session")
    if s.expires_at < datetime.utcnow():
        db.delete(s)
        db.commit()
        raise HTTPException(status_code=401, detail="Session expired")
    s.expires_at = datetime.utcnow() + timedelta(minutes=SESSION_TTL_MIN)
    db.commit()
    db.refresh(s)
    return {
        "session_token": s.session_token,
        "expires_at": s.expires_at.isoformat(),
    }
