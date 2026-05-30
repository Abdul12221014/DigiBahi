"""
Shared rate-limiter instance.

Extracted into its own module to avoid circular imports:
  main.py → ocr.py / whatsapp.py → main.py (for `limiter`)

Import as:
    from app.rate_limit import limiter
"""
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _device_or_ip(request: Request) -> str:
    """Key by X-Device-ID header when present, fall back to IP."""
    return request.headers.get("X-Device-ID") or get_remote_address(request)


limiter = Limiter(key_func=_device_or_ip)
