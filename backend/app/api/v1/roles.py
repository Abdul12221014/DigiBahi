from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ...db.base import get_db
from ...services.role_service import list_roles, create_role, assign_role
from ..deps import get_current_session

router = APIRouter(prefix="/api/v1")


@router.get("/roles")
def get_roles(db: Session = Depends(get_db), _session=Depends(get_current_session)):
    return list_roles(db)


@router.post("/roles")
def post_role(name: str, description: str = "", db: Session = Depends(get_db), _session=Depends(get_current_session)):
    return create_role(db, name, description)


@router.post("/assign-role")
def post_assign_role(user_id: int, role_id: int, db: Session = Depends(get_db), _session=Depends(get_current_session)):
    return assign_role(db, user_id, role_id)
