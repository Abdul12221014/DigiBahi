from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from .base import Base


def _utcnow() -> datetime:
    """Naive UTC datetime — compatible with SQLite's DateTime column."""
    return datetime.now(timezone.utc).replace(tzinfo=None)

class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(String, index=True)
    description = Column(String, default="")
    amount = Column(Float, nullable=False)
    type = Column(String, index=True)  # sale|purchase|expense|receipt
    gstRate = Column(Float, default=0.0)  # GST rate (e.g., 5.0, 12.0, 18.0)
    gstAmount = Column(Float, default=0.0)  # Calculated GST amount
    created_at = Column(DateTime, default=_utcnow)
    # NEW FIELDS (Week-1 Ledger Enhancement)
    party_name = Column(String, index=True, default="")
    reference_no = Column(String, index=True, default="")
    tags = Column(String, default="")  # comma-separated for now
    is_active = Column(Boolean, default=True, nullable=False)  # for soft delete
    deleted_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
    created_by = Column(Integer, nullable=True)  # placeholder for auth integration

# Roles and audit (Phase 9)
class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True)
    description = Column(String, default="")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    pin_hash = Column(String)
    device_id = Column(String, index=True)
    role = Column(String, default="employee", nullable=False)  # owner | accountant | employee
    created_at = Column(DateTime, default=_utcnow)

class UserRole(Base):
    __tablename__ = "user_roles"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    role_id = Column(Integer, ForeignKey("roles.id"))

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String)
    resource = Column(String)
    timestamp = Column(DateTime, default=_utcnow)
    device_id = Column(String)

# Session model for multi-user sessions
class Session(Base):
    __tablename__ = "sessions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    session_token = Column(String, unique=True, index=True, nullable=False)
    device_id = Column(String, index=True)
    expires_at = Column(DateTime)

# ========================================
# INVENTORY MODELS (Week 1 - Backend Foundation)
# ========================================

class InventoryItem(Base):
    __tablename__ = "inventory_items"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    name_key = Column(String, nullable=False, index=True)  # normalized for search
    sku = Column(String, unique=True, index=True)  # unique SKU
    hsn_code = Column(String)
    gst_rate = Column(Float, default=0.0)  # 0, 5, 12, 18, 28
    opening_qty = Column(Float, default=0.0)
    unit = Column(String, nullable=False)
    min_qty = Column(Float, default=0.0)
    mrp = Column(Float)
    sale_price = Column(Float)
    purchase_price = Column(Float)
    is_active = Column(Boolean, default=True, nullable=False)  # for soft delete
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
    
    # Relationships
    stock_transactions = relationship("StockTransaction", back_populates="item")
    
    def __repr__(self):
        return f"<InventoryItem id={self.id} name='{self.name}' sku='{self.sku}'>"


class StockTransaction(Base):
    __tablename__ = "stock_transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)
    date = Column(String, nullable=False, index=True)  # YYYY-MM-DD
    type = Column(String, nullable=False, index=True)  # open|purchase|sale|adjustment
    qty = Column(Float, nullable=False)
    ref_ledger_id = Column(Integer, ForeignKey("ledger_entries.id"))
    is_active = Column(Boolean, default=True, nullable=False)  # soft delete
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
    
    # Relationships
    item = relationship("InventoryItem", back_populates="stock_transactions")
    
    def __repr__(self):
        return f"<StockTransaction id={self.id} item_id={self.item_id} type='{self.type}' qty={self.qty}>"


# ========================================
# WHATSAPP OTP SESSIONS (persistent across restarts)
# ========================================

class OtpSession(Base):
    __tablename__ = "otp_sessions"
    id = Column(Integer, primary_key=True)
    phone_number = Column(String, index=True, nullable=False)
    otp_hash = Column(String, nullable=False)  # sha256 of OTP — never store plaintext
    message_id = Column(String, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=_utcnow, nullable=False)


# ========================================
# UPI RECONCILIATION LOG (migrated from separate SQLite file)
# ========================================

class UpiReconcileLog(Base):
    __tablename__ = "upi_reconcile_log"
    id = Column(String, primary_key=True, index=True)
    txn_ref = Column(String, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    upi_id = Column(String, nullable=False)
    timestamp = Column(Integer, nullable=False)
    status = Column(String, default="reconciled", nullable=False)
    created_at = Column(DateTime, default=_utcnow, nullable=False)


# ========================================
# INVOICE NUMBER SEQUENCE (server-side, multi-device safe)
# ========================================

class InvoiceSequence(Base):
    __tablename__ = "invoice_sequence"
    id = Column(Integer, primary_key=True)
    year = Column(Integer, unique=True, nullable=False, index=True)
    last_number = Column(Integer, default=0, nullable=False)


# ========================================
# LEDGER IDEMPOTENCY (Week-1 Ledger Enhancement)
# ========================================

class LedgerIdempotencyKey(Base):
    __tablename__ = "ledger_idempotency_keys"
    key = Column(String, primary_key=True, index=True)
    entry_id = Column(Integer, index=True, nullable=False)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    
    def __repr__(self):
        return f"<LedgerIdempotencyKey key='{self.key}' entry_id={self.entry_id}>"


