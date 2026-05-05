"""
WhatsApp Business API Endpoints
Handles OTP, invoice, and report sending via WhatsApp
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional
import secrets
import string
import hashlib
import time
from datetime import datetime, timedelta

from ...services.whatsapp_service import WhatsAppService
from ...db.base import get_db
from ...db import models
from ..deps import get_current_session
from ...db.models import Session as SessionModel

router = APIRouter(prefix="/api/v1/whatsapp", tags=["whatsapp"])

# Initialize WhatsApp service (None when credentials not configured)
try:
    whatsapp_service = WhatsAppService()
except ValueError as e:
    whatsapp_service = None
    print(f"Warning: WhatsApp service not initialized: {e}")


# ─── Constants ────────────────────────────────────────────────────────────────
OTP_TTL_SECONDS = 10 * 60   # 10 minutes
OTP_MAX_ATTEMPTS = 5


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _generate_otp() -> str:
    return ''.join(secrets.choice(string.digits) for _ in range(6))

def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()

def _normalize_phone(phone: str) -> str:
    """Strip non-digits; keep as-is (country-code-aware)."""
    return ''.join(c for c in phone if c.isdigit())


# ─── Request / Response Models ─────────────────────────────────────────────────

class SendOTPRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number (digits only, 7–15 chars)", min_length=7, max_length=15)
    template_name: Optional[str] = Field("digbahi_otp", description="WhatsApp template name")


class SendOTPResponse(BaseModel):
    success: bool
    message: str
    message_id: Optional[str] = None
    expires_at: Optional[int] = None


class VerifyOTPRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number (digits only, 7–15 chars)", min_length=7, max_length=15)
    otp_code: str = Field(..., description="6-digit OTP code", min_length=6, max_length=6)


class VerifyOTPResponse(BaseModel):
    success: bool
    message: str


class SendInvoiceRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number (digits only)", min_length=7, max_length=15)
    invoice_data: dict = Field(..., description="Invoice data")
    pdf_base64: Optional[str] = Field(None, description="Base64 encoded PDF")


class SendInvoiceResponse(BaseModel):
    success: bool
    message: str
    message_id: Optional[str] = None


class SendReportRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number (digits only)", min_length=7, max_length=15)
    report_type: str = Field(..., description="Report type: pl, gst, or ledger")
    report_data: Optional[dict] = Field(None, description="Report data")
    pdf_base64: Optional[str] = Field(None, description="Base64 encoded PDF")


class SendReportResponse(BaseModel):
    success: bool
    message: str
    message_id: Optional[str] = None


# ─── OTP Endpoints ─────────────────────────────────────────────────────────────

@router.post("/send-otp", response_model=SendOTPResponse)
async def send_otp(request: SendOTPRequest, db: Session = Depends(get_db), _session: SessionModel = Depends(get_current_session)):
    """
    Send OTP via WhatsApp Business API.
    OTP is stored in SQLite (survives restarts). Plaintext OTP is never persisted — only a sha256 hash.
    """
    if not whatsapp_service:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp service not configured. Please check environment variables."
        )

    phone = _normalize_phone(request.phone_number)
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number must contain digits only.")

    try:
        otp_code = _generate_otp()

        result = whatsapp_service.send_otp(
            phone_number=phone,
            otp_code=otp_code,
            template_name=request.template_name
        )

        if not result.get("success"):
            error_msg = result.get("error", "Unknown error")
            error_code = result.get("error_code")
            error_type = result.get("error_type", "")

            print(f"WhatsApp API Error — Code: {error_code}, Type: {error_type}, Msg: {error_msg[:100]}")

            is_template_error = (
                error_code in [131047, 132001]
                or "template" in error_msg.lower()
                or "does not exist in the translation" in error_msg
            )

            if is_template_error:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Template '{request.template_name}' not found or not approved. "
                        "Create and approve the template in WhatsApp Manager: "
                        "https://business.facebook.com/wa/manage/message-templates/"
                    )
                )
            elif error_code == 131030:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Phone number {phone} is not in the test-allowed list. "
                        "Add it in Meta Developer Console → WhatsApp → API Setup."
                    )
                )
            elif error_code == 190 or (error_type == "OAuthException" and not is_template_error):
                raise HTTPException(
                    status_code=401,
                    detail="Invalid or expired access token. Generate a new permanent token via System Users in Meta Business Manager."
                )
            elif error_code == 100:
                raise HTTPException(status_code=400, detail=f"Invalid request: {error_msg}")
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to send OTP: {error_msg} (Error code: {error_code})"
                )

        # Invalidate any previous OTP for this phone
        db.query(models.OtpSession).filter(
            models.OtpSession.phone_number == phone,
            models.OtpSession.used == False
        ).update({"used": True})

        expires_at_dt = datetime.utcnow() + timedelta(seconds=OTP_TTL_SECONDS)
        session = models.OtpSession(
            phone_number=phone,
            otp_hash=_hash_otp(otp_code),
            message_id=result.get("message_id"),
            expires_at=expires_at_dt,
            attempts=0,
            used=False,
        )
        db.add(session)
        db.commit()

        return SendOTPResponse(
            success=True,
            message="OTP sent successfully via WhatsApp",
            message_id=result.get("message_id"),
            expires_at=int(expires_at_dt.timestamp()),
        )

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/verify-otp", response_model=VerifyOTPResponse)
async def verify_otp(request: VerifyOTPRequest, db: Session = Depends(get_db), _session: SessionModel = Depends(get_current_session)):
    """
    Verify OTP code against the DB-persisted hash.
    Max 5 attempts per OTP; expired or used OTPs are rejected.
    """
    phone = _normalize_phone(request.phone_number)
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number must contain digits only.")

    if not request.otp_code.isdigit() or len(request.otp_code) != 6:
        raise HTTPException(status_code=400, detail="Invalid OTP format. Must be 6 digits.")

    try:
        session = (
            db.query(models.OtpSession)
            .filter(
                models.OtpSession.phone_number == phone,
                models.OtpSession.used == False,
            )
            .order_by(models.OtpSession.created_at.desc())
            .first()
        )

        if not session:
            return VerifyOTPResponse(success=False, message="OTP not found. Please request a new OTP.")

        # Check expiry
        if datetime.utcnow() > session.expires_at:
            session.used = True
            db.commit()
            return VerifyOTPResponse(success=False, message="OTP has expired. Please request a new OTP.")

        # Brute-force protection
        session.attempts += 1
        if session.attempts > OTP_MAX_ATTEMPTS:
            session.used = True
            db.commit()
            return VerifyOTPResponse(success=False, message="Too many failed attempts. Please request a new OTP.")

        # Constant-time compare via hashes
        if _hash_otp(request.otp_code) != session.otp_hash:
            db.commit()  # persist incremented attempts
            remaining = OTP_MAX_ATTEMPTS - session.attempts
            return VerifyOTPResponse(
                success=False,
                message=f"Invalid OTP. {remaining} attempt(s) remaining."
            )

        # Success
        session.used = True
        db.commit()
        return VerifyOTPResponse(success=True, message="OTP verified successfully")

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# ─── Invoice Endpoints ─────────────────────────────────────────────────────────

@router.post("/send-invoice", response_model=SendInvoiceResponse)
async def send_invoice(request: SendInvoiceRequest, _session: SessionModel = Depends(get_current_session)):
    """
    Send invoice via WhatsApp.
    Base64 PDFs cannot be sent directly — WhatsApp Business API requires a public URL.
    This endpoint returns a clear 200 with success=False so the frontend can fall through
    to the wa.me share fallback without treating it as an unexpected error.
    """
    if not whatsapp_service:
        return SendInvoiceResponse(
            success=False,
            message="WhatsApp Business API not configured. Invoice opened in WhatsApp via link instead."
        )

    # WhatsApp Cloud API does not accept base64 — it requires a publicly reachable URL.
    # Return a structured failure so the frontend shareWithFallback chain takes over.
    return SendInvoiceResponse(
        success=False,
        message=(
            "Direct PDF delivery requires a public cloud URL. "
            "The invoice will be shared via WhatsApp link + PDF download instead."
        )
    )


@router.post("/send-invoice-url", response_model=SendInvoiceResponse)
async def send_invoice_url(
    phone_number: str,
    document_url: str,
    filename: str = "invoice.pdf",
    caption: Optional[str] = None,
    _session: SessionModel = Depends(get_current_session),
):
    """Send invoice PDF via WhatsApp using a publicly accessible URL."""
    if not whatsapp_service:
        raise HTTPException(status_code=503, detail="WhatsApp service not configured.")

    phone = _normalize_phone(phone_number)
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number must contain digits only.")

    try:
        result = whatsapp_service.send_document(
            phone_number=phone,
            document_url=document_url,
            filename=filename,
            caption=caption
        )

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"Failed to send invoice: {result.get('error', 'Unknown error')}"
            )

        return SendInvoiceResponse(
            success=True,
            message="Invoice sent successfully via WhatsApp",
            message_id=result.get("message_id")
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# ─── Report Endpoints ──────────────────────────────────────────────────────────

@router.post("/send-report", response_model=SendReportResponse)
async def send_report(request: SendReportRequest, _session: SessionModel = Depends(get_current_session)):
    """
    Send report via WhatsApp.
    Same as send-invoice: base64 not supported; returns structured failure for frontend fallback.
    """
    if not whatsapp_service:
        return SendReportResponse(
            success=False,
            message="WhatsApp Business API not configured. Report will be downloaded instead."
        )

    return SendReportResponse(
        success=False,
        message=(
            "Direct PDF delivery requires a public cloud URL. "
            "The report will be shared via WhatsApp link + PDF download instead."
        )
    )


@router.post("/send-report-url", response_model=SendReportResponse)
async def send_report_url(
    phone_number: str,
    document_url: str,
    filename: str = "report.pdf",
    caption: Optional[str] = None,
    _session: SessionModel = Depends(get_current_session),
):
    """Send report PDF via WhatsApp using a publicly accessible URL."""
    if not whatsapp_service:
        raise HTTPException(status_code=503, detail="WhatsApp service not configured.")

    phone = _normalize_phone(phone_number)
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number must contain digits only.")

    try:
        result = whatsapp_service.send_document(
            phone_number=phone,
            document_url=document_url,
            filename=filename,
            caption=caption
        )

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=f"Failed to send report: {result.get('error', 'Unknown error')}"
            )

        return SendReportResponse(
            success=True,
            message="Report sent successfully via WhatsApp",
            message_id=result.get("message_id")
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# ─── Invoice Number Sequence ──────────────────────────────────────────────────

class InvoiceNumberResponse(BaseModel):
    invoice_number: str
    year: int
    sequence: int


@router.post("/invoice-number/next", response_model=InvoiceNumberResponse)
async def get_next_invoice_number(db: Session = Depends(get_db), _session: SessionModel = Depends(get_current_session)):
    """
    Atomically reserve the next invoice number for this calendar year.
    Format: INV-YYYY-NNN (zero-padded to 3 digits, then 4 once > 999).
    Server-side guarantees uniqueness across multiple devices on the same network.
    """
    try:
        year = datetime.utcnow().year
        row = db.query(models.InvoiceSequence).filter(
            models.InvoiceSequence.year == year
        ).first()

        if row is None:
            row = models.InvoiceSequence(year=year, last_number=1)
            db.add(row)
        else:
            row.last_number += 1

        db.commit()
        db.refresh(row)

        seq = row.last_number
        padded = str(seq).zfill(3) if seq < 1000 else str(seq)
        invoice_number = f"INV-{year}-{padded}"

        return InvoiceNumberResponse(invoice_number=invoice_number, year=year, sequence=seq)

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to generate invoice number: {str(e)}")


@router.get("/invoice-number/last", response_model=InvoiceNumberResponse)
async def get_last_invoice_number(db: Session = Depends(get_db), _session: SessionModel = Depends(get_current_session)):
    """Return the last issued invoice number without incrementing."""
    year = datetime.utcnow().year
    row = db.query(models.InvoiceSequence).filter(
        models.InvoiceSequence.year == year
    ).first()

    seq = row.last_number if row else 0
    padded = str(seq).zfill(3) if seq < 1000 else str(seq)
    return InvoiceNumberResponse(
        invoice_number=f"INV-{year}-{padded}",
        year=year,
        sequence=seq
    )


# ─── Diagnostics ───────────────────────────────────────────────────────────────

@router.get("/status")
async def whatsapp_status(_session: SessionModel = Depends(get_current_session)):
    """
    Check WhatsApp service configuration status.
    Use this during onboarding to verify credentials before going live.
    """
    if not whatsapp_service:
        return {
            "configured": False,
            "message": (
                "WhatsApp Business API not configured. "
                "Set WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, and "
                "WHATSAPP_BUSINESS_ACCOUNT_ID in backend/.env"
            )
        }
    return {
        "configured": True,
        "phone_number_id": whatsapp_service.phone_number_id,
        "api_version": whatsapp_service.api_version,
        "message": (
            "WhatsApp service is configured. "
            "Ensure your message templates (digbahi_otp, digbahi_invoice) are approved in "
            "Meta Business Manager before using OTP or invoice delivery."
        )
    }
