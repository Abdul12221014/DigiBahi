import os
import sys
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from .db.base import Base, engine

# ─── Rate limiter (shared instance) ─────────────────────────────────────────
# Key: X-Device-ID header when present, falls back to IP.
# Import this in routers that need rate limits: from app.main import limiter
def _device_or_ip(request: Request) -> str:
    return request.headers.get("X-Device-ID") or get_remote_address(request)

limiter = Limiter(key_func=_device_or_ip)

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

def _run_safe_migrations(conn) -> None:
    """Add new columns to existing tables without Alembic.
    Uses SQLite's permissive ALTER TABLE — each statement is idempotent
    because we catch the 'duplicate column name' error and continue.
    """
    migrations = [
        "ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN locked_until DATETIME",
    ]
    for sql in migrations:
        try:
            conn.execute(sql)
            conn.commit()
        except Exception:
            # Column already exists — safe to ignore
            conn.rollback()


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    import app.db.models  # ensure all model classes are imported before create_all
    Base.metadata.create_all(bind=engine)
    # Add any new columns to existing tables (idempotent, safe on re-runs)
    with engine.connect() as conn:
        _run_safe_migrations(conn)
    # Store the running event loop so sync route handlers can dispatch WS
    # broadcasts via run_coroutine_threadsafe (avoids private _get_running_loop).
    from .api.v1.sync_ws import set_event_loop
    set_event_loop(asyncio.get_running_loop())
    yield


app = FastAPI(title="DigBahi Local API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

cors_env = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
origins = [o.strip() for o in cors_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Session-Token", "Authorization"],
)

# ─── Security headers middleware ──────────────────────────────────────────────
# Interim S2 mitigation: blocks inline script XSS until session tokens migrate
# to HttpOnly cookies. CSP restricts script sources to self + Vite dev server.
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # Block inline scripts — the primary XSS vector for localStorage token theft.
    # 'self' + the CORS origins list (which includes the Vite dev server) are permitted.
    script_origins = " ".join(origins)
    response.headers["Content-Security-Policy"] = (
        f"default-src 'self'; "
        f"script-src 'self' {script_origins}; "
        f"style-src 'self' 'unsafe-inline'; "
        f"connect-src 'self' {script_origins} ws: wss:; "
        f"img-src 'self' data: blob:; "
        f"frame-ancestors 'none'"
    )
    return response
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


