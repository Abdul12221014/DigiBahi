from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from datetime import datetime, timedelta
from secrets import token_urlsafe
import hashlib
from ...db.base import get_db
from ...db.models import Session as SessionModel, User

router = APIRouter(prefix="/api/v1/session")

SESSION_TTL_MIN = 60 * 24  # 24 hours


def _hash_pin(pin: str) -> str:
    """SHA-256 hash of PIN — matches frontend hashPin() in src/lib/auth.ts."""
    return hashlib.sha256(pin.encode()).hexdigest()


@router.post("/login")
def session_login(pin: str, device_id: str, db: DBSession = Depends(get_db)):
    user = db.query(User).filter(User.device_id == device_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid device or PIN")

    # Verify PIN against stored sha-256 hash
    if not user.pin_hash or _hash_pin(pin) != user.pin_hash:
        raise HTTPException(status_code=401, detail="Invalid device or PIN")

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
    return {
        "session_token": token,
        "expires_at": expires.isoformat(),
        "user_id": user.id,
    }


@router.post("/logout")
def session_logout(session_token: str, db: DBSession = Depends(get_db)):
    db.query(SessionModel).filter(
        SessionModel.session_token == session_token
    ).delete()
    db.commit()
    return {"ok": True}


@router.post("/refresh")
def session_refresh(session_token: str, db: DBSession = Depends(get_db)):
    s = db.query(SessionModel).filter(
        SessionModel.session_token == session_token
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
