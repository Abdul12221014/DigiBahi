from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from typing import List
from datetime import datetime
from ...db.base import get_db
from ...db import models
from ...db import schemas
from .sync_ws import broadcast
from ..deps import get_current_session, require_owner, require_owner_or_accountant
from ...db.models import User as UserModel

router = APIRouter(prefix="/api/v1/inventory", tags=["Inventory"])


def normalize_name(name: str) -> str:
    """Normalize name to lowercase for search"""
    return name.lower().strip().replace('  ', ' ')


def broadcast_event(event_data: dict):
    """Schedule a WS broadcast on uvicorn's running event loop."""
    import asyncio, logging as _log
    try:
        loop = asyncio._get_running_loop()  # noqa: SLF001
        if loop is not None:
            asyncio.run_coroutine_threadsafe(broadcast(event_data), loop)
    except Exception as e:
        _log.getLogger(__name__).warning("Broadcast error (non-critical): %s", e)


# ---------------------------
# Inventory Item CRUD
# ---------------------------

@router.get("/items", response_model=List[schemas.InventoryItemOut])
def get_items(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: str = Query("", description="Search by name, SKU, or HSN"),
    db: Session = Depends(get_db),
    _session=Depends(get_current_session)
):
    """Get paginated inventory items with search"""
    query = db.query(models.InventoryItem).filter(models.InventoryItem.is_active == True)
    
    if search:
        search_key = f"%{search.lower()}%"
        query = query.filter(
            (models.InventoryItem.name_key.ilike(search_key)) |
            (models.InventoryItem.sku.ilike(search_key)) |
            (models.InventoryItem.hsn_code.ilike(search_key))
        )
    
    return query.offset(skip).limit(limit).all()


@router.post("/items", response_model=schemas.InventoryItemOut)
def create_item(item: schemas.InventoryItemCreate, db: Session = Depends(get_db), _user: UserModel = Depends(require_owner_or_accountant)):
    """Create new inventory item"""
    try:
        # Check for duplicate SKU
        if item.sku:
            existing = db.query(models.InventoryItem).filter(
                models.InventoryItem.sku == item.sku,
                models.InventoryItem.is_active == True
            ).first()
            if existing:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "DUPLICATE_SKU",
                        "message": f"An item with SKU '{item.sku}' already exists",
                        "field": "sku",
                        "existing_item_id": existing.id
                    }
                )
        
        # Create item with normalized name
        db_item = models.InventoryItem(
            name=item.name,
            name_key=normalize_name(item.name),
            sku=item.sku,
            hsn_code=item.hsn_code,
            gst_rate=item.gst_rate,
            opening_qty=item.opening_qty,
            unit=item.unit,
            min_qty=item.min_qty,
            mrp=item.mrp,
            sale_price=item.sale_price,
            purchase_price=item.purchase_price
        )
        
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        
        # Broadcast inventory creation event to all connected devices
        broadcast_event({
            "type": "inventory_item_created",
            "data": {
                "id": db_item.id,
                "name": db_item.name,
                "name_key": db_item.name_key,
                "sku": db_item.sku,
                "hsn_code": db_item.hsn_code,
                "gst_rate": db_item.gst_rate,
                "opening_qty": db_item.opening_qty,
                "unit": db_item.unit,
                "min_qty": db_item.min_qty,
                "mrp": db_item.mrp,
                "sale_price": db_item.sale_price,
                "purchase_price": db_item.purchase_price,
                "is_active": db_item.is_active,
                "created_at": db_item.created_at.isoformat() if db_item.created_at else None,
                "updated_at": db_item.updated_at.isoformat() if db_item.updated_at else None
            },
            "timestamp": datetime.utcnow().isoformat()
        })
        
        return db_item
    except HTTPException:
        raise
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail={
                "error": "DATABASE_ERROR",
                "message": "Database integrity constraint violation",
                "details": str(e)
            }
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "message": "Failed to create item",
                "details": str(e)
            }
        )


@router.get("/items/{item_id}", response_model=schemas.InventoryItemOut)
def get_item(item_id: int, db: Session = Depends(get_db), _session=Depends(get_current_session)):
    """Get single inventory item"""
    item = db.query(models.InventoryItem).filter(
        models.InventoryItem.id == item_id,
        models.InventoryItem.is_active == True
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    return item


@router.put("/items/{item_id}", response_model=schemas.InventoryItemOut)
def update_item(item_id: int, item: schemas.InventoryItemCreate, db: Session = Depends(get_db), _user: UserModel = Depends(require_owner_or_accountant)):
    """Update inventory item"""
    db_item = db.query(models.InventoryItem).filter(
        models.InventoryItem.id == item_id,
        models.InventoryItem.is_active == True
    ).first()
    
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Check for duplicate SKU if changing
    if item.sku and item.sku != db_item.sku:
        existing = db.query(models.InventoryItem).filter(models.InventoryItem.sku == item.sku).first()
        if existing and existing.id != item_id:
            raise HTTPException(status_code=400, detail=f"Duplicate SKU: {item.sku}")
    
    # Update fields
    for field, value in item.dict().items():
        setattr(db_item, field, value)
    
    db_item.name_key = normalize_name(db_item.name)
    db.commit()
    db.refresh(db_item)
    
    # Broadcast inventory update event
    broadcast_event({
        "type": "inventory_item_updated",
        "data": {
            "id": db_item.id,
            "name": db_item.name,
            "name_key": db_item.name_key,
            "sku": db_item.sku,
            "hsn_code": db_item.hsn_code,
            "gst_rate": db_item.gst_rate,
            "opening_qty": db_item.opening_qty,
            "unit": db_item.unit,
            "min_qty": db_item.min_qty,
            "mrp": db_item.mrp,
            "sale_price": db_item.sale_price,
            "purchase_price": db_item.purchase_price,
            "is_active": db_item.is_active,
            "created_at": db_item.created_at.isoformat() if db_item.created_at else None,
            "updated_at": db_item.updated_at.isoformat() if db_item.updated_at else None
        },
        "timestamp": datetime.utcnow().isoformat()
    })
    
    return db_item


@router.delete("/items/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db), _user: UserModel = Depends(require_owner)):
    """Soft delete inventory item"""
    try:
        item = db.query(models.InventoryItem).filter(
            models.InventoryItem.id == item_id,
            models.InventoryItem.is_active == True
        ).first()
        
        if not item:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "NOT_FOUND",
                    "message": f"Inventory item with ID {item_id} not found",
                    "item_id": item_id
                }
            )
        
        # Soft delete the item
        item.is_active = False
        item.deleted_at = datetime.utcnow()
        
        # Soft delete related stock transactions so inventory calculations stay correct
        db.query(models.StockTransaction).filter(
            models.StockTransaction.item_id == item_id
        ).update({"is_active": False, "updated_at": datetime.utcnow()})
        
        db.commit()
        
        # Broadcast inventory delete event
        broadcast_event({
            "type": "inventory_item_deleted",
            "data": {
                "id": item_id,
                "name": item.name,
                "deleted_at": item.deleted_at.isoformat() if item.deleted_at else None
            },
            "timestamp": datetime.utcnow().isoformat()
        })
        
        return {
            "message": "Item and related stock transactions soft-deleted successfully",
            "item_id": item_id
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail={
                "error": "INTERNAL_ERROR",
                "message": "Failed to delete item",
                "details": str(e)
            }
        )


# ---------------------------
# Stock Transactions
# ---------------------------

@router.post("/stock-transactions", response_model=schemas.StockTransactionOut)
def create_stock_transaction(txn: schemas.StockTransactionCreate, db: Session = Depends(get_db), _user: UserModel = Depends(require_owner_or_accountant)):
    """Create stock transaction"""
    # Validate item exists
    item = db.query(models.InventoryItem).filter(
        models.InventoryItem.id == txn.item_id,
        models.InventoryItem.is_active == True
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    db_txn = models.StockTransaction(
        item_id=txn.item_id,
        date=txn.date,
        type=txn.type,
        qty=txn.qty,
        ref_ledger_id=txn.ref_ledger_id
    )
    
    try:
        db.add(db_txn)
        db.commit()
        db.refresh(db_txn)
        
        # Broadcast stock transaction event
        broadcast_event({
            "type": "inventory_stock_changed",
            "data": {
                "id": db_txn.id,
                "item_id": db_txn.item_id,
                "item_name": item.name,
                "date": db_txn.date,
                "type": db_txn.type,
                "qty": db_txn.qty,
                "ref_ledger_id": db_txn.ref_ledger_id,
                "created_at": db_txn.created_at.isoformat() if db_txn.created_at else None,
                "updated_at": db_txn.updated_at.isoformat() if db_txn.updated_at else None
            },
            "timestamp": datetime.utcnow().isoformat()
        })
        
        return db_txn
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/summary", response_model=List[schemas.InventorySummary])
def get_inventory_summary(db: Session = Depends(get_db), _session=Depends(get_current_session)):
    """Get inventory summary with stock levels — uses SQL aggregation to avoid N+1 queries."""
    # Aggregate stock quantities per item in a single query
    stock_totals = dict(
        db.query(models.StockTransaction.item_id, func.sum(models.StockTransaction.qty))
        .filter(models.StockTransaction.is_active == True)
        .group_by(models.StockTransaction.item_id)
        .all()
    )

    items = db.query(models.InventoryItem).filter(models.InventoryItem.is_active == True).all()

    result = []
    for item in items:
        current_stock = (stock_totals.get(item.id) or 0) + (item.opening_qty or 0)
        unit_price = item.sale_price or item.purchase_price or 0
        result.append({
            "item_id": item.id,
            "name": item.name,
            "stock": current_stock,
            "value": current_stock * unit_price,
            "gst_rate": item.gst_rate
        })

    return result


@router.get("/stock-value")
def get_total_stock_value(db: Session = Depends(get_db), _session=Depends(get_current_session)):
    """Calculate total inventory value using a single SQL aggregate (no N+1)."""
    stock_totals = dict(
        db.query(models.StockTransaction.item_id, func.sum(models.StockTransaction.qty))
        .filter(models.StockTransaction.is_active == True)
        .group_by(models.StockTransaction.item_id)
        .all()
    )

    items = db.query(models.InventoryItem).filter(models.InventoryItem.is_active == True).all()

    total_value = 0.0
    for item in items:
        current_stock = (stock_totals.get(item.id) or 0) + (item.opening_qty or 0)
        unit_price = item.sale_price or item.purchase_price or 0
        total_value += current_stock * unit_price

    return {
        "total_items": len(items),
        "total_value": round(total_value, 2),
        "currency": "INR"
    }

