from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.v1.health import router as health_router
from .api.v1.ledger import router as ledger_router
from .api.v1.sync import router as sync_router
from .api.v1.roles import router as roles_router
from .api.v1.audit import router as audit_router
from .api.v1.session import router as session_router
from .api.v1.sync_ws import router as sync_ws_router
from .api.v1.reports import router as reports_router
from .api.v1.upi import router as upi_router
from .api.v1.upi_sync import router as upi_sync_router
from .api.v1.inventory import router as inventory_router  # NEW: Inventory API
from .api.v1.whatsapp import router as whatsapp_router
from .ai.analytics.routes import router as analytics_router

# Optional: Federated learning (requires numpy)
try:
    from .ai.federated.routes import router as federated_router
    FEDERATED_AVAILABLE = True
except ImportError as e:
    print(f"⚠️  Federated learning module not available: {e}")
    federated_router = None
    FEDERATED_AVAILABLE = False

app = FastAPI(title="DigBahi Local API")

# Add CORS middleware - Allow specific origins for security and LAN access
import os

cors_env = os.getenv("CORS_ORIGINS")
if cors_env:
    origins = [o.strip() for o in cors_env.split(",")]
else:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health_router)
app.include_router(ledger_router)
app.include_router(sync_router)
app.include_router(roles_router)
app.include_router(audit_router)
app.include_router(session_router)
app.include_router(sync_ws_router)
app.include_router(reports_router)
app.include_router(upi_router)
app.include_router(upi_sync_router, prefix="/api/v1/upi")
app.include_router(inventory_router)  # NEW: Register inventory router
app.include_router(whatsapp_router)  # WhatsApp Business API
from .api.v1.printer import router as printer_router
app.include_router(printer_router)
app.include_router(analytics_router)
if FEDERATED_AVAILABLE and federated_router:
    app.include_router(federated_router)


