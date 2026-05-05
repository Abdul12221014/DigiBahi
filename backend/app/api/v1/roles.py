from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ...db.base import get_db
from ...db.models import User
from ...services.role_service import list_roles, create_role, assign_role
from ..deps import get_current_session, require_owner

router = APIRouter(prefix="/api/v1")


@router.get("/roles")
def get_roles(db: Session = Depends(get_db), _session=Depends(get_current_session)):
    """Any authenticated user can read the role list."""
    return list_roles(db)


@router.post("/roles")
def post_role(
    name: str,
    description: str = "",
    db: Session = Depends(get_db),
    _user: User = Depends(require_owner),
):
    """Only owners can create new roles."""
    return create_role(db, name, description)


@router.post("/assign-role")
def post_assign_role(
    user_id: int,
    role_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_owner),
):
    """Only owners can assign roles to users."""
    return assign_role(db, user_id, role_id)
