from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from datetime import datetime, timedelta
from secrets import token_urlsafe
from ...db.base import get_db, Base, engine
from ...db.models import Session as SessionModel, User

router = APIRouter(prefix="/api/v1/session")
Base.metadata.create_all(bind=engine)

SESSION_TTL_MIN = 60 * 24  # 24h

@router.post("/login")
def session_login(pin: str, device_id: str, db: DBSession = Depends(get_db)):
    # Minimal: find first user with matching device (demo), or check pin_hash if available
    user = db.query(User).filter(User.device_id == device_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid device")
    # In real flow, verify pin against bcrypt hash
    expires = datetime.utcnow() + timedelta(minutes=SESSION_TTL_MIN)
    token = token_urlsafe(32)
    s = SessionModel(user_id=user.id, session_token=token, device_id=device_id, expires_at=expires)
    db.add(s); db.commit(); db.refresh(s)
    return {"session_token": token, "expires_at": expires.isoformat(), "user_id": user.id}

@router.post("/logout")
def session_logout(session_token: str, db: DBSession = Depends(get_db)):
    db.query(SessionModel).filter(SessionModel.session_token == session_token).delete()
    db.commit()
    return {"ok": True}

@router.post("/refresh")
def session_refresh(session_token: str, db: DBSession = Depends(get_db)):
    s = db.query(SessionModel).filter(SessionModel.session_token == session_token).first()
    if not s:
        raise HTTPException(status_code=401, detail="Invalid session")
    if s.expires_at < datetime.utcnow():
        db.delete(s); db.commit()
        raise HTTPException(status_code=401, detail="Session expired")
    s.expires_at = datetime.utcnow() + timedelta(minutes=SESSION_TTL_MIN)
    db.add(s); db.commit(); db.refresh(s)
    return {"session_token": s.session_token, "expires_at": s.expires_at.isoformat()}


