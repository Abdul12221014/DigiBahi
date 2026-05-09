"""
Shared FastAPI dependencies — authentication and role-based access control.
"""
import logging
from datetime import datetime, timezone

def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
from typing import List

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..db.base import get_db
from ..db.models import Session as SessionModel, User

logger = logging.getLogger(__name__)

# ─── Authentication ───────────────────────────────────────────────────────────

def get_current_session(
    x_session_token: str = Header(..., description="Session token from /login"),
    db: Session = Depends(get_db),
) -> SessionModel:
    """
    Validate the X-Session-Token header and return the live session row.
    Raises 401 if missing, invalid, or expired.
    """
    s = db.query(SessionModel).filter(
        SessionModel.session_token == x_session_token
    ).first()
    if not s:
        raise HTTPException(status_code=401, detail="Invalid or missing session token")
    if s.expires_at < _utcnow():
        db.delete(s)
        db.commit()
        raise HTTPException(status_code=401, detail="Session expired — please log in again")
    return s


# ─── Role-based access control ────────────────────────────────────────────────

def _get_user(session: SessionModel, db: Session) -> User:
    user = db.query(User).filter(User.id == session.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found for this session")
    return user


def require_role(allowed_roles: List[str]):
    """
    FastAPI dependency factory. Usage:
        _user = Depends(require_role(["owner", "accountant"]))

    Raises 403 if the authenticated user's role is not in allowed_roles.
    """
    def _check(
        session: SessionModel = Depends(get_current_session),
        db: Session = Depends(get_db),
    ) -> User:
        user = _get_user(session, db)
        if user.role not in allowed_roles:
            logger.warning(
                "Access denied: user %s (role=%s) attempted action requiring roles=%s",
                user.id, user.role, allowed_roles,
            )
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required role: {' or '.join(allowed_roles)}."
            )
        return user
    return _check


# ─── Convenience shortcuts ────────────────────────────────────────────────────

def require_owner(
    session: SessionModel = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> User:
    """Only the owner may perform this action."""
    return require_role(["owner"])(session, db)


def require_owner_or_accountant(
    session: SessionModel = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> User:
    """Owner or accountant may perform this action (employees cannot)."""
    return require_role(["owner", "accountant"])(session, db)
