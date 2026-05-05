from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
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


class LoginRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=8, pattern=r'^\d+$')
    device_id: str = Field(..., min_length=1, max_length=128)


@router.post("/login")
def session_login(body: LoginRequest, db: DBSession = Depends(get_db)):
    pin = body.pin
    device_id = body.device_id
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
        "role": user.role,
    }


class TokenRequest(BaseModel):
    session_token: str = Field(..., min_length=1)


@router.post("/logout")
def session_logout(body: TokenRequest, db: DBSession = Depends(get_db)):
    db.query(SessionModel).filter(
        SessionModel.session_token == body.session_token
    ).delete()
    db.commit()
    return {"ok": True}


@router.post("/refresh")
def session_refresh(body: TokenRequest, db: DBSession = Depends(get_db)):
    session_token = body.session_token
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
