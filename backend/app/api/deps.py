"""
Shared FastAPI dependencies.
"""
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from .db.base import get_db
from .db.models import Session as SessionModel


def get_current_session(
    x_session_token: str = Header(..., description="Session token from /login"),
    db: Session = Depends(get_db),
) -> SessionModel:
    """
    Validate the X-Session-Token header and return the live session row.
    Raises 401 if missing, invalid, or expired.
    Applied to all state-mutating endpoints (POST/PUT/DELETE).
    Read-only GET endpoints on sensitive data should also use this.
    """
    s = db.query(SessionModel).filter(
        SessionModel.session_token == x_session_token
    ).first()
    if not s:
        raise HTTPException(status_code=401, detail="Invalid or missing session token")
    if s.expires_at < datetime.utcnow():
        db.delete(s)
        db.commit()
        raise HTTPException(status_code=401, detail="Session expired — please log in again")
    return s
