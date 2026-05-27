import logging
from datetime import datetime, timedelta, timezone

def _utcnow() -> datetime:
    """Return current UTC time as a naive datetime (SQLite-compatible)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
from secrets import token_urlsafe
from typing import Optional
import hashlib

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session as DBSession

from ...db.base import get_db
from ...db.models import Session as SessionModel, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/session")

SESSION_TTL_MIN = 60 * 24  # 24 hours

# ─── Brute-force protection (DB-backed, survives restarts) ───────────────────
_MAX_ATTEMPTS = 5
_LOCKOUT_DURATION = timedelta(minutes=15)


def _check_lockout(device_id: str, db: DBSession) -> None:
    """Raise 423 if the device is currently locked out (from DB)."""
    user = db.query(User).filter(User.device_id == device_id).first()
    if user and user.locked_until and user.locked_until > _utcnow():
        remaining = int((user.locked_until - _utcnow()).total_seconds())
        raise HTTPException(
            status_code=423,
            detail={
                "message": f"Too many failed attempts. Try again in {remaining} seconds.",
                "locked_until": user.locked_until.isoformat(),
                "retry_after_seconds": remaining,
            }
        )


def _record_failure(user: Optional[User], device_id: str, db: DBSession) -> None:
    """Increment failure counter in DB; lock if threshold exceeded."""
    if user is None:
        return  # Can't track unknown device without a user row
    user.failed_attempts = (user.failed_attempts or 0) + 1
    if user.failed_attempts >= _MAX_ATTEMPTS:
        user.locked_until = _utcnow() + _LOCKOUT_DURATION
        logger.warning("Device %s (user %s) locked after %d failures", device_id, user.id, _MAX_ATTEMPTS)
    db.commit()


def _clear_attempts(user: User, db: DBSession) -> None:
    """Reset failure counter on successful login."""
    user.failed_attempts = 0
    user.locked_until = None
    db.commit()


# ─── Models ───────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    # Modern password-based login
    password: Optional[str] = Field(None, min_length=1, max_length=256)
    identifier: Optional[str] = Field(None, max_length=256)  # email or username

    # Legacy PIN-based login (kept for backward compat)
    pin: Optional[str] = Field(None, min_length=4, max_length=256)
    username: Optional[str] = Field(None, max_length=128)

    device_id: str = Field(..., min_length=1, max_length=128)

    @model_validator(mode='after')
    def at_least_one_credential(self) -> 'LoginRequest':
        if not self.password and not self.pin:
            raise ValueError('Either password or pin must be provided')
        return self

    @property
    def effective_password(self) -> str:
        return self.password or self.pin or ''

    @property
    def effective_identifier(self) -> Optional[str]:
        return self.identifier or self.username


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
    _check_lockout(device_id, db)

    try:
        # Look up user by identifier (modern path) or device_id (legacy path)
        user = None
        if body.effective_identifier:
            user = db.query(User).filter(User.name == body.effective_identifier).first()
        if user is None:
            user = db.query(User).filter(User.device_id == device_id).first()

        # Verify credential against stored SHA-256 PIN hash
        credential = body.effective_password
        credential_valid = (
            user is not None
            and user.pin_hash is not None
            and _hash_pin(credential) == user.pin_hash
        )

        if not credential_valid:
            _record_failure(user, device_id, db)
            raise HTTPException(status_code=401, detail="Invalid credentials")

        # Successful — clear failure counter and issue session token
        _clear_attempts(user, db)

        expires = _utcnow() + timedelta(minutes=SESSION_TTL_MIN)
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
            "role": getattr(user, 'role', 'employee'),
            "username": user.name,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Backend login DB error (falling through to local auth): %s", exc)
        raise HTTPException(status_code=401, detail="Backend auth unavailable")


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
    if s.expires_at < _utcnow():
        db.delete(s)
        db.commit()
        raise HTTPException(status_code=401, detail="Session expired")
    s.expires_at = _utcnow() + timedelta(minutes=SESSION_TTL_MIN)
    db.commit()
    db.refresh(s)
    return {
        "session_token": s.session_token,
        "expires_at": s.expires_at.isoformat(),
    }
