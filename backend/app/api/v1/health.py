from fastapi import APIRouter, Depends
from ...api.deps import get_current_session

router = APIRouter(prefix="/api/v1")

@router.get("/health")
def health():
    """Public health check for load balancers and uptime monitors."""
    return {"status": "ok"}


@router.get("/health/detail")
def health_detail(_session=Depends(get_current_session)):
    """Authenticated system diagnostics — memory and platform info."""
    try:
        from ...utils.memory import get_memory_usage, is_raspberry_pi
        mem = get_memory_usage()
        return {
            "status": "ok",
            "platform": "raspberry_pi" if is_raspberry_pi() else "unknown",
            "memory": {
                "total_mb": round(mem["total_mb"], 2),
                "available_mb": round(mem["available_mb"], 2),
                "used_mb": round(mem["used_mb"], 2),
                "percent": round(mem["percent"], 2),
                "status": mem["status"]
            }
        }
    except Exception as e:
        return {"status": "ok", "memory": {"error": str(e)}}


