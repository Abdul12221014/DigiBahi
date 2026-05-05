from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ...db.base import get_db
from ...services.audit_service import list_recent, record_action
from ..deps import get_current_session

router = APIRouter(prefix="/api/v1")


@router.get("/audit")
def audit_list(limit: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db), _session=Depends(get_current_session)):
    return list_recent(db, limit)


@router.post("/audit/test")
def audit_test(action: str, resource: str, db: Session = Depends(get_db), _session=Depends(get_current_session)):
    return record_action(db, user_id=_session.user_id, action=action, resource=resource)
