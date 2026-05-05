import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_, func, case
from typing import List, Optional, Dict, Any
from datetime import datetime
from ...db.base import get_db
from ...db import models
from ...db import schemas
from .sync_ws import broadcast
from ..deps import get_current_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["Ledger"])

def http_error(status: int, code: str, message: str, details: dict = None):
    """Helper for consistent error envelope"""
    raise HTTPException(
        status_code=status,
        detail={
            "error": code,
            "message": message,
            "details": details or {}
        }
    )

def broadcast_event(event_data: dict):
    """
    Schedule a WebSocket broadcast on the running event loop.
    Uses run_coroutine_threadsafe so the broadcast runs on the same loop
    that uvicorn owns — no new loops, no silent daemon-thread teardown loss.
    """
    import asyncio
    try:
        loop = asyncio._get_running_loop()  # noqa: SLF001 — non-raising, works on 3.8–3.12
        if loop is not None:
            asyncio.run_coroutine_threadsafe(broadcast(event_data), loop)
    except Exception as e:
        logger.warning("Broadcast error (non-critical): %s", e)
    
@router.get("/ledger/entries")
def get_ledger_entries_alias(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str = Query("", description="Search description, party_name, reference_no, tags"),
    type: Optional[str] = Query(None, description="Filter by type"),
    from_: str = Query("", alias="from", description="Date from (YYYY-MM-DD)"),
    to: str = Query("", description="Date to (YYYY-MM-DD)"),
    tags: str = Query("", description="Filter by tags (comma-separated)"),
    include_total: bool = Query(False, description="Include total count in response"),
    db: Session = Depends(get_db),
    _session=Depends(get_current_session)
):
    """Alias for GET /ledger for compatibility"""
    return get_ledger(skip, limit, search, type, from_, to, tags, include_total, db, _session)


@router.get("/ledger")
def get_ledger(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str = Query("", description="Search description, party_name, reference_no, tags"),
    type: Optional[str] = Query(None, description="Filter by type"),
    from_: str = Query("", alias="from", description="Date from (YYYY-MM-DD)"),
    to: str = Query("", description="Date to (YYYY-MM-DD)"),
    tags: str = Query("", description="Filter by tags (comma-separated)"),
    include_total: bool = Query(False, description="Include total count in response"),
    db: Session = Depends(get_db),
    _session=Depends(get_current_session)
):
    """Get paginated ledger entries with filters"""
    query = db.query(models.LedgerEntry).filter(models.LedgerEntry.is_active == True)
    
    # Type filter
    if type:
        query = query.filter(models.LedgerEntry.type == type)
    
    # Date range filter
    if from_ and to:
        try:
            # Validate date format
            datetime.strptime(from_, "%Y-%m-%d")
            datetime.strptime(to, "%Y-%m-%d")
            query = query.filter(
                models.LedgerEntry.date >= from_,
                models.LedgerEntry.date <= to
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    
    # Tags filter (comma-separated tags)
    if tags:
        tag_list = [t.strip() for t in tags.split(',') if t.strip()]
        if tag_list:
            # Filter entries that contain any of the specified tags
            tag_filters = [models.LedgerEntry.tags.ilike(f"%{tag}%") for tag in tag_list]
            query = query.filter(or_(*tag_filters))
    
    # Search filter (ILIKE on multiple fields)
    if search:
        search_like = f"%{search.strip().lower()}%"
        query = query.filter(
            (models.LedgerEntry.description.ilike(search_like)) |
            (models.LedgerEntry.party_name.ilike(search_like)) |
            (models.LedgerEntry.reference_no.ilike(search_like)) |
            (models.LedgerEntry.tags.ilike(search_like))
        )
    
    # Get total count if requested (before pagination)
    total = None
    if include_total:
        total = query.count()
    
    # Order by id DESC (newest first)
    entries = query.order_by(models.LedgerEntry.id.desc()).offset(skip).limit(limit).all()
    
    # Return array for backward compatibility, or object with total if requested
    if include_total:
        return {
            "items": entries,
            "total": total,
            "hasNext": len(entries) == limit and (skip + limit) < total
        }
    
    return entries  # Return plain array for backward compatibility


@router.post("/ledger", response_model=schemas.LedgerEntryOut)
def create_ledger_entry(entry: schemas.LedgerEntryCreate, db: Session = Depends(get_db), _session=Depends(get_current_session)):
    """Create ledger entry with idempotency support"""
    try:
        # Idempotency check (within transaction)
        if entry.idempotency_key:
            existing_key = db.query(models.LedgerIdempotencyKey).filter(
                models.LedgerIdempotencyKey.key == entry.idempotency_key
            ).first()
            
            if existing_key:
                # Return existing entry
                existing_entry = db.query(models.LedgerEntry).filter(
                    models.LedgerEntry.id == existing_key.entry_id
                ).first()
                
                if existing_entry:
                    http_error(
                        409,
                        "IDEMPOTENT_DUPLICATE",
                        "Entry with this idempotency_key already exists",
                        {"entry_id": existing_key.entry_id}
                    )
        
        # Create entry
        db_entry = models.LedgerEntry(
            date=entry.date,
            description=entry.description,
            amount=entry.amount,
            type=entry.type,
            gstRate=entry.gstRate,
            gstAmount=entry.gstAmount,
            party_name=entry.party_name,
            reference_no=entry.reference_no,
            tags=entry.tags,
            created_by=_session.user_id
        )
        
        db.add(db_entry)
        db.flush()  # Get entry.id without committing
        
        # Store idempotency key if provided
        if entry.idempotency_key:
            db.add(models.LedgerIdempotencyKey(
                key=entry.idempotency_key,
                entry_id=db_entry.id
            ))
        
        db.commit()
        db.refresh(db_entry)
        
        # Broadcast WebSocket event (full entry data to match inventory pattern)
        broadcast_event({
            "type": "ledger_entry_created",
            "data": {
                "id": db_entry.id,
                "date": db_entry.date,
                "description": db_entry.description,
                "amount": db_entry.amount,
                "type": db_entry.type,
                "gstRate": db_entry.gstRate,
                "gstAmount": db_entry.gstAmount,
                "party_name": db_entry.party_name,
                "reference_no": db_entry.reference_no,
                "tags": db_entry.tags,
                "is_active": db_entry.is_active,
                "created_at": db_entry.created_at.isoformat() if db_entry.created_at else None,
                "updated_at": db_entry.updated_at.isoformat() if db_entry.updated_at else None
            },
            "timestamp": datetime.utcnow().isoformat()
        })
        
        return db_entry
        
    except HTTPException:
        raise
    except IntegrityError as e:
        db.rollback()
        http_error(400, "DATABASE_ERROR", "Database integrity constraint violation", {"details": str(e)})
    except Exception as e:
        db.rollback()
        http_error(500, "INTERNAL_ERROR", "Failed to create entry", {"details": str(e)})


@router.put("/ledger/{id}", response_model=schemas.LedgerEntryOut)
def update_ledger_entry(
    id: int,
    entry: schemas.LedgerEntryCreate,
    db: Session = Depends(get_db),
    _session=Depends(get_current_session),
):
    """Update ledger entry"""
    db_entry = db.query(models.LedgerEntry).filter(
        models.LedgerEntry.id == id,
        models.LedgerEntry.is_active == True
    ).first()
    
    if not db_entry:
        http_error(404, "NOT_FOUND", f"Ledger entry {id} not found")
    
    # Update mutable fields
    db_entry.date = entry.date
    db_entry.description = entry.description
    db_entry.amount = entry.amount
    db_entry.type = entry.type
    db_entry.gstRate = entry.gstRate
    db_entry.gstAmount = entry.gstAmount
    db_entry.party_name = entry.party_name
    db_entry.reference_no = entry.reference_no
    db_entry.tags = entry.tags
    db_entry.updated_at = datetime.utcnow()
    
    try:
        db.commit()
        db.refresh(db_entry)
        
        # Broadcast update event
        broadcast_event({
            "type": "ledger_entry_updated",
            "data": {
                "id": db_entry.id,
                "date": db_entry.date,
                "description": db_entry.description,
                "amount": db_entry.amount,
                "type": db_entry.type,
                "gstRate": db_entry.gstRate,
                "gstAmount": db_entry.gstAmount,
                "party_name": db_entry.party_name,
                "reference_no": db_entry.reference_no,
                "tags": db_entry.tags,
                "is_active": db_entry.is_active,
                "created_at": db_entry.created_at.isoformat() if db_entry.created_at else None,
                "updated_at": db_entry.updated_at.isoformat() if db_entry.updated_at else None
            },
            "timestamp": datetime.utcnow().isoformat()
        })
        
        return db_entry
    except Exception as e:
        db.rollback()
        http_error(500, "INTERNAL_ERROR", "Failed to update entry", {"details": str(e)})


@router.delete("/ledger/{id}")
def delete_ledger_entry(id: int, db: Session = Depends(get_db), _session=Depends(get_current_session)):
    """Soft delete ledger entry"""
    db_entry = db.query(models.LedgerEntry).filter(
        models.LedgerEntry.id == id,
        models.LedgerEntry.is_active == True
    ).first()
    
    if not db_entry:
        http_error(404, "NOT_FOUND", f"Ledger entry {id} not found")
    
    # Soft delete
    db_entry.is_active = False
    db_entry.deleted_at = datetime.utcnow()
    
    try:
        db.commit()
        
        # Broadcast delete event
        broadcast_event({
            "type": "ledger_entry_deleted",
            "data": {
                "id": db_entry.id,
                "date": db_entry.date,
                "type": db_entry.type,
                "amount": db_entry.amount
            },
            "timestamp": datetime.utcnow().isoformat()
        })
        
        return {"message": "Entry soft-deleted successfully"}
    except Exception as e:
        db.rollback()
        http_error(500, "INTERNAL_ERROR", "Failed to delete entry", {"details": str(e)})


# ============================================================================
# ANALYTICS ENDPOINTS (Phase D)
# ============================================================================
# METRIC CALCULATION LOGIC (matches frontend src/lib/ledger.metrics.ts)
# ============================================================================
# Credit Types (money coming in): sale, receipt
# Debit Types (money going out): purchase, expense
# 
# Total calculation includes: amount + gstAmount
# This ensures consistency between API and Dexie fallback
# 
# Date filter: Inclusive range (date >= from AND date <= to)
# ============================================================================

@router.get("/ledger/analytics/summary")
def get_summary(
    from_: str = Query(None, alias="from", description="Date from (YYYY-MM-DD)"),
    to: str = Query(None, description="Date to (YYYY-MM-DD)"),
    type: Optional[str] = Query(None, description="Filter by type"),
    db: Session = Depends(get_db),
    _session=Depends(get_current_session)
):
    """
    Returns totals for period:
    {
        "total_sales": float,
        "total_purchases": float,
        "total_expenses": float,
        "total_receipts": float,
        "net_profit": float,
        "cash_flow": float,
        "gst_collected": float,
        "gst_paid": float,
        "net_gst": float
    }
    """
    try:
        query = db.query(models.LedgerEntry).filter(models.LedgerEntry.is_active == True)
        
        # Type filter
        if type:
            query = query.filter(models.LedgerEntry.type == type)
        
        # Date range filter
        if from_ and to:
            try:
                datetime.strptime(from_, "%Y-%m-%d")
                datetime.strptime(to, "%Y-%m-%d")
                query = query.filter(
                    models.LedgerEntry.date >= from_,
                    models.LedgerEntry.date <= to
                )
            except ValueError:
                pass  # Ignore invalid dates
        
        entries = query.all()
        
        # Calculate totals
        total_sales = sum(e.amount + e.gstAmount for e in entries if e.type == 'sale')
        total_purchases = sum(e.amount + e.gstAmount for e in entries if e.type == 'purchase')
        total_expenses = sum(e.amount + e.gstAmount for e in entries if e.type == 'expense')
        total_receipts = sum(e.amount + e.gstAmount for e in entries if e.type == 'receipt')
        
        gst_collected = sum(e.gstAmount for e in entries if e.type == 'sale')
        gst_paid = sum(e.gstAmount for e in entries if e.type == 'purchase')
        
        net_profit = total_sales - total_purchases - total_expenses
        cash_flow = total_receipts - (total_purchases + total_expenses)
        net_gst = gst_collected - gst_paid
        
        return {
            "total_sales": round(total_sales, 2),
            "total_purchases": round(total_purchases, 2),
            "total_expenses": round(total_expenses, 2),
            "total_receipts": round(total_receipts, 2),
            "net_profit": round(net_profit, 2),
            "cash_flow": round(cash_flow, 2),
            "gst_collected": round(gst_collected, 2),
            "gst_paid": round(gst_paid, 2),
            "net_gst": round(net_gst, 2)
        }
    except Exception as e:
        http_error(500, "INTERNAL_ERROR", "Failed to get summary", {"details": str(e)})


@router.get("/ledger/analytics/monthly")
def get_monthly_summary(
    year: int = Query(..., ge=2000, le=2100, description="Year (2000-2100)"),
    type: Optional[str] = Query(None, description="Filter by type"),
    db: Session = Depends(get_db),
    _session=Depends(get_current_session)
):
    """
    Returns monthly aggregates for year:
    [
        { "month": 1, "sales": 1000.0, "expenses": 800.0, "receipts": 500.0, "purchases": 600.0 },
        { "month": 2, "sales": 1200.0, "expenses": 900.0, "receipts": 600.0, "purchases": 700.0 },
        ...
    ]
    """
    try:
        query = db.query(models.LedgerEntry).filter(
            models.LedgerEntry.is_active == True,
            models.LedgerEntry.date.like(f"{year}-%")
        )
        
        if type:
            query = query.filter(models.LedgerEntry.type == type)
        
        entries = query.all()
        
        # Group by month
        monthly_data = {}
        for i in range(1, 13):
            monthly_data[i] = {
                "month": i,
                "sales": 0.0,
                "expenses": 0.0,
                "receipts": 0.0,
                "purchases": 0.0
            }
        
        for entry in entries:
            try:
                entry_date = datetime.strptime(entry.date, "%Y-%m-%d")
                month = entry_date.month
                amount = entry.amount + entry.gstAmount
                
                if month in monthly_data:
                    if entry.type == 'sale':
                        monthly_data[month]["sales"] += amount
                    elif entry.type == 'expense':
                        monthly_data[month]["expenses"] += amount
                    elif entry.type == 'receipt':
                        monthly_data[month]["receipts"] += amount
                    elif entry.type == 'purchase':
                        monthly_data[month]["purchases"] += amount
            except (ValueError, AttributeError):
                continue  # Skip invalid dates
        
        # Round values and return as list
        result = []
        for month in range(1, 13):
            data = monthly_data[month]
            result.append({
                "month": month,
                "sales": round(data["sales"], 2),
                "expenses": round(data["expenses"], 2),
                "receipts": round(data["receipts"], 2),
                "purchases": round(data["purchases"], 2)
            })
        
        return result
    except Exception as e:
        http_error(500, "INTERNAL_ERROR", "Failed to get monthly summary", {"details": str(e)})


@router.get("/ledger/analytics/parties")
def get_party_summary(
    limit: int = Query(5, ge=1, le=20, description="Top N parties"),
    from_: str = Query(None, alias="from", description="Date from (YYYY-MM-DD)"),
    to: str = Query(None, description="Date to (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    _session=Depends(get_current_session)
):
    """
    Returns top parties by transaction volume:
    [
        {
            "party_name": "Customer A",
            "total_sales": 10000.0,
            "total_receipts": 5000.0,
            "total_purchases": 0.0,
            "transaction_count": 15,
            "net_balance": 15000.0
        },
        ...
    ]
    """
    try:
        query = db.query(models.LedgerEntry).filter(
            models.LedgerEntry.is_active == True,
            models.LedgerEntry.party_name != None,
            models.LedgerEntry.party_name != ""
        )
        
        # Date range filter
        if from_ and to:
            try:
                datetime.strptime(from_, "%Y-%m-%d")
                datetime.strptime(to, "%Y-%m-%d")
                query = query.filter(
                    models.LedgerEntry.date >= from_,
                    models.LedgerEntry.date <= to
                )
            except ValueError:
                pass  # Ignore invalid dates
        
        entries = query.all()
        
        # Group by party_name
        party_data = {}
        for entry in entries:
            party_name = entry.party_name.strip()
            if not party_name:
                continue
            
            if party_name not in party_data:
                party_data[party_name] = {
                    "party_name": party_name,
                    "total_sales": 0.0,
                    "total_receipts": 0.0,
                    "total_purchases": 0.0,
                    "transaction_count": 0,
                    "net_balance": 0.0
                }
            
            amount = entry.amount + entry.gstAmount
            party_data[party_name]["transaction_count"] += 1
            
            if entry.type == 'sale':
                party_data[party_name]["total_sales"] += amount
                party_data[party_name]["net_balance"] += amount
            elif entry.type == 'receipt':
                party_data[party_name]["total_receipts"] += amount
                party_data[party_name]["net_balance"] -= amount  # Receipt reduces balance
            elif entry.type == 'purchase':
                party_data[party_name]["total_purchases"] += amount
                party_data[party_name]["net_balance"] -= amount
        
        # Sort by transaction count (volume) and return top N
        sorted_parties = sorted(
            party_data.values(),
            key=lambda x: x["transaction_count"],
            reverse=True
        )[:limit]
        
        # Round values
        for party in sorted_parties:
            party["total_sales"] = round(party["total_sales"], 2)
            party["total_receipts"] = round(party["total_receipts"], 2)
            party["total_purchases"] = round(party["total_purchases"], 2)
            party["net_balance"] = round(party["net_balance"], 2)
        
        return sorted_parties
    except Exception as e:
        http_error(500, "INTERNAL_ERROR", "Failed to get party summary", {"details": str(e)})
