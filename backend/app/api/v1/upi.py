from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ...db.base import get_db
from ...db import models
from ..deps import get_current_session

router = APIRouter()


class UPIReconcileRequest(BaseModel):
    id: str
    txnRef: str
    amount: float
    upiId: str
    timestamp: int


class UPIReconcileResponse(BaseModel):
    success: bool
    message: str
    reconcileId: Optional[str] = None


@router.post("/upi/reconcile", response_model=UPIReconcileResponse)
async def reconcile_upi_payment(
    request: UPIReconcileRequest,
    db: Session = Depends(get_db),
    _session=Depends(get_current_session),
):
    if not request.id or not request.txnRef:
        raise HTTPException(status_code=400, detail="Missing required fields")
    if request.amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")

    try:
        row = models.UpiReconcileLog(
            id=request.id,
            txn_ref=request.txnRef,
            amount=request.amount,
            upi_id=request.upiId,
            timestamp=request.timestamp,
            status="reconciled",
        )
        db.merge(row)  # INSERT OR REPLACE semantics
        db.commit()
        return UPIReconcileResponse(
            success=True,
            message=f"UPI reconciliation logged: {request.txnRef}",
            reconcileId=request.id,
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Reconciliation failed: {str(e)}")


@router.get("/upi/reconcile/{txn_ref}")
async def get_reconcile_status(
    txn_ref: str,
    db: Session = Depends(get_db),
    _session=Depends(get_current_session),
):
    row = db.query(models.UpiReconcileLog).filter(
        models.UpiReconcileLog.txn_ref == txn_ref
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {
        "id": row.id,
        "txnRef": row.txn_ref,
        "amount": row.amount,
        "upiId": row.upi_id,
        "timestamp": row.timestamp,
        "status": row.status,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("/upi/reconcile")
async def list_reconcile_logs(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    _session=Depends(get_current_session),
):
    rows = (
        db.query(models.UpiReconcileLog)
        .order_by(models.UpiReconcileLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "txnRef": r.txn_ref,
            "amount": r.amount,
            "upiId": r.upi_id,
            "timestamp": r.timestamp,
            "status": r.status,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.delete("/upi/reconcile/{reconcile_id}")
async def delete_reconcile_log(
    reconcile_id: str,
    db: Session = Depends(get_db),
    _session=Depends(get_current_session),
):
    row = db.query(models.UpiReconcileLog).filter(
        models.UpiReconcileLog.id == reconcile_id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Reconciliation log not found")
    db.delete(row)
    db.commit()
    return {"success": True, "message": "Reconciliation log deleted"}
