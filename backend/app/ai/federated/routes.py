from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from ...db.base import get_db
from ...db.models import LedgerEntry
from .schemas import (
    ModelUpdateRequest, AggregateRequest, ModelStatusResponse, 
    UploadResponse, AggregateResponse
)
from .trainer import LocalTrainer
from .aggregator import FederatedAggregator
from .secure_sync import SecureSync

router = APIRouter(prefix="/api/v1/ai/federated")

# Global instances
trainer = LocalTrainer()
aggregator = FederatedAggregator()
# Lazy initialization - only create when needed
_secure_sync = None

def get_secure_sync():
    """Lazy initialization of SecureSync — requires FEDERATED_MASTER_SECRET env var."""
    global _secure_sync
    if _secure_sync is None:
        import os
        if not os.getenv('FEDERATED_MASTER_SECRET'):
            raise RuntimeError(
                "FEDERATED_MASTER_SECRET environment variable is not set. "
                "Set it to a random 32+ character string before starting the server."
            )
        _secure_sync = SecureSync()
    return _secure_sync

@router.post("/upload", response_model=UploadResponse)
def upload_model_update(request: ModelUpdateRequest, db: Session = Depends(get_db)):
    """Upload encrypted model update from client"""
    try:
        # Decrypt the model update
        secure_sync = get_secure_sync()
        decrypted_data = secure_sync.decrypt_model_update(request.encrypted_data)
        
        # Verify integrity
        if not secure_sync.verify_integrity(decrypted_data, request.hash):
            raise HTTPException(status_code=400, detail="Model integrity verification failed")
        
        # Store update in database (simplified - in production, use proper table)
        # For now, we'll just validate and return success
        
        return UploadResponse(
            status="success",
            message=f"Model update received from {request.device_id}",
            received_at=datetime.now().isoformat()
        )
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Upload failed: {str(e)}")

@router.post("/aggregate", response_model=AggregateResponse)
def aggregate_model_updates(request: AggregateRequest, db: Session = Depends(get_db)):
    """Aggregate multiple model updates using FedAvg"""
    try:
        # Decrypt all client updates
        secure_sync = get_secure_sync()
        decrypted_updates = []
        for update in request.client_updates:
            decrypted_data = secure_sync.decrypt_model_update(update.encrypted_data)
            
            # Verify integrity
            if not secure_sync.verify_integrity(decrypted_data, update.hash):
                raise HTTPException(status_code=400, detail=f"Integrity check failed for {update.device_id}")
            
            decrypted_updates.append(decrypted_data)
        
        # Aggregate using FedAvg
        aggregated_model = aggregator.aggregate_updates(decrypted_updates)
        
        return AggregateResponse(
            status="success",
            aggregated_model=aggregated_model,
            client_count=len(request.client_updates),
            aggregation_timestamp=datetime.now().isoformat()
        )
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Aggregation failed: {str(e)}")

@router.get("/status", response_model=ModelStatusResponse)
def get_model_status(db: Session = Depends(get_db)):
    """Get current global model status"""
    try:
        summary = aggregator.get_update_summary()
        
        return ModelStatusResponse(
            global_model=summary["global_model"],
            update_count=summary["update_count"],
            last_update=summary["last_update"],
            model_hash=summary["model_hash"],
            version=summary["global_model"]["version"]
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Status retrieval failed: {str(e)}")

@router.post("/train-local")
def train_local_model(db: Session = Depends(get_db)):
    """Trigger local model training on current ledger data"""
    try:
        # Get recent ledger entries
        entries = db.query(LedgerEntry).order_by(LedgerEntry.id.desc()).limit(1000).all()
        
        # Train locally
        trained_weights = trainer.train_locally(entries)
        
        # Export for potential sync
        export_data = trainer.export_weights()
        
        return {
            "status": "success",
            "message": f"Local training completed on {len(entries)} entries",
            "model_version": trained_weights["version"],
            "trained_at": trained_weights["trained_at"],
            "export_ready": True
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Local training failed: {str(e)}")
