from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/v1")


@router.post("/sync")
def sync():
    """
    Batch sync endpoint — NOT YET IMPLEMENTED.
    Returns 501 so the frontend knows the submission was not processed
    rather than silently discarding data.
    Ledger entries written offline are durably stored in the client's
    IndexedDB (Dexie) and are safe until the user re-enters them
    via the normal create flow when back online.
    """
    return JSONResponse(
        status_code=501,
        content={
            "ok": False,
            "error": "SYNC_NOT_IMPLEMENTED",
            "message": (
                "Batch sync is not implemented. Offline ledger entries are "
                "stored locally in IndexedDB and should be re-submitted "
                "through the normal ledger API when connectivity is restored."
            ),
        },
    )
