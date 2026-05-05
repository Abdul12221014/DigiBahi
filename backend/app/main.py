import os
import sys
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .db.base import Base, engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Startup env validation ──────────────────────────────────────────────────
_REQUIRED_ENV = ["CORS_ORIGINS"]
_missing = [v for v in _REQUIRED_ENV if not os.getenv(v)]
if _missing:
    logger.error("FATAL: missing required environment variables: %s", _missing)
    sys.exit(1)

# Warn (don't abort) for optional but important vars
_OPTIONAL_WARN = ["WHATSAPP_ACCESS_TOKEN", "GOOGLE_CREDENTIALS_JSON"]
for _var in _OPTIONAL_WARN:
    if not os.getenv(_var):
        logger.warning("Optional env var %s not set — related features will be degraded", _var)
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
from .api.v1.ocr import router as ocr_router
from .ai.analytics.routes import router as analytics_router

# Optional: Federated learning (requires numpy)
try:
    from .ai.federated.routes import router as federated_router
    FEDERATED_AVAILABLE = True
except ImportError as e:
    logger.warning("Federated learning module not available: %s", e)
    federated_router = None
    FEDERATED_AVAILABLE = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables once at startup — idempotent, safe on existing schemas.
    # Route files no longer call create_all() individually.
    import app.db.models  # ensure all model classes are imported before create_all
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="DigBahi Local API", lifespan=lifespan)

cors_env = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
origins = [o.strip() for o in cors_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Session-Token", "Authorization"],
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
app.include_router(ocr_router)
if FEDERATED_AVAILABLE and federated_router:
    app.include_router(federated_router)


