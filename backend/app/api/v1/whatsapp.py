"""
WhatsApp Business API Endpoints
Handles OTP, invoice, and report sending via WhatsApp
"""
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional
import secrets
import string
import time
import base64
from io import BytesIO

from ...services.whatsapp_service import WhatsAppService

router = APIRouter(prefix="/api/v1/whatsapp", tags=["whatsapp"])

# Initialize WhatsApp service
try:
    whatsapp_service = WhatsAppService()
except ValueError as e:
    # Service will be None if credentials not configured
    whatsapp_service = None
    print(f"Warning: WhatsApp service not initialized: {e}")

# In-memory OTP storage (use database in production)
otp_storage = {}


# Request/Response Models
class SendOTPRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number (10 digits, without country code)", min_length=10, max_length=10)
    template_name: Optional[str] = Field("digbahi_otp", description="WhatsApp template name")


class SendOTPResponse(BaseModel):
    success: bool
    message: str
    otp_code: Optional[str] = None  # Only for testing - remove in production
    message_id: Optional[str] = None
    expires_at: Optional[int] = None


class VerifyOTPRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number", min_length=10, max_length=10)
    otp_code: str = Field(..., description="6-digit OTP code", min_length=6, max_length=6)


class VerifyOTPResponse(BaseModel):
    success: bool
    message: str


class SendInvoiceRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number (10 digits)", min_length=10, max_length=10)
    invoice_data: dict = Field(..., description="Invoice data (for generating message)")
    pdf_base64: Optional[str] = Field(None, description="Base64 encoded PDF (if already generated)")


class SendInvoiceResponse(BaseModel):
    success: bool
    message: str
    message_id: Optional[str] = None


class SendReportRequest(BaseModel):
    phone_number: str = Field(..., description="Phone number (10 digits)", min_length=10, max_length=10)
    report_type: str = Field(..., description="Report type: pl, gst, or ledger")
    report_data: Optional[dict] = Field(None, description="Report data")
    pdf_base64: Optional[str] = Field(None, description="Base64 encoded PDF")


class SendReportResponse(BaseModel):
    success: bool
    message: str
    message_id: Optional[str] = None


# Helper Functions
def generate_otp() -> str:
    """Generate 6-digit OTP"""
    return ''.join(secrets.choice(string.digits) for _ in range(6))


# API Endpoints
@router.post("/send-otp", response_model=SendOTPResponse)
async def send_otp(request: SendOTPRequest):
    """
    Send OTP via WhatsApp Business API
    
    - Generates 6-digit OTP
    - Sends via WhatsApp template message
    - Stores OTP for verification (expires in 10 minutes)
    """
    if not whatsapp_service:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp service not configured. Please check environment variables."
        )
    
    try:
        # Validate phone number
        if not request.phone_number.isdigit() or len(request.phone_number) != 10:
            raise HTTPException(
                status_code=400,
                detail="Invalid phone number. Must be exactly 10 digits."
            )
        
        # Generate OTP
        otp_code = generate_otp()
        
        # Send via WhatsApp
        result = whatsapp_service.send_otp(
            phone_number=request.phone_number,
            otp_code=otp_code,
            template_name=request.template_name
        )
        
        if not result.get("success"):
            error_msg = result.get("error", "Unknown error")
            error_code = result.get("error_code")
            error_type = result.get("error_type", "")
            
            # Debug logging
            print(f"WhatsApp API Error - Code: {error_code}, Type: {error_type}, Message: {error_msg[:100]}")
            
            # Handle specific WhatsApp API errors
            # Error codes: 131047 = Template not found, 132001 = Template doesn't exist in translation
            # Check template errors FIRST (even if type is OAuthException)
            # Check by error code first, then by message content
            is_template_error = (
                error_code in [131047, 132001] or 
                "template" in error_msg.lower() or 
                "does not exist in the translation" in error_msg or
                "template name" in error_msg.lower()
            )
            
            if is_template_error:
                raise HTTPException(
                    status_code=400,
                    detail=f"Template '{request.template_name}' not found. Please create the template in WhatsApp Manager: https://business.facebook.com/wa/manage/message-templates/"
                )
            elif error_code == 131030:  # Phone number not in allowed list
                raise HTTPException(
                    status_code=400,
                    detail=f"Phone number {request.phone_number} is not in the allowed list. Please add it in Meta Developer Console → WhatsApp → API Setup → Add phone number to test list."
                )
            elif error_code == 190 or (error_type == "OAuthException" and error_code not in [131047, 132001, 131030] and not is_template_error):  # Invalid access token (but not template/phone errors)
                raise HTTPException(
                    status_code=401,
                    detail="Invalid or expired access token. Please generate a new token in Meta Developer Console."
                )
            elif error_code == 100:  # Invalid parameter
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid request: {error_msg}"
                )
            else:
                # Log full error for debugging
                print(f"WhatsApp API Error - Code: {error_code}, Type: {error_type}, Message: {error_msg}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to send OTP: {error_msg} (Error code: {error_code})"
                )
        
        # Store OTP (expires in 10 minutes)
        expires_at = int(time.time()) + (10 * 60)  # 10 minutes
        
        otp_storage[request.phone_number] = {
            "otp": otp_code,
            "expires_at": expires_at,
            "message_id": result.get("message_id")
        }
        
        return SendOTPResponse(
            success=True,
            message="OTP sent successfully via WhatsApp",
            otp_code=otp_code,  # Only for testing - remove in production
            message_id=result.get("message_id"),
            expires_at=expires_at
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/verify-otp", response_model=VerifyOTPResponse)
async def verify_otp(request: VerifyOTPRequest):
    """
    Verify OTP code
    
    - Checks if OTP matches
    - Validates expiration
    - Clears OTP after successful verification
    """
    try:
        # Validate phone number
        if not request.phone_number.isdigit() or len(request.phone_number) != 10:
            raise HTTPException(status_code=400, detail="Invalid phone number")
        
        # Validate OTP format
        if not request.otp_code.isdigit() or len(request.otp_code) != 6:
            raise HTTPException(
                status_code=400,
                detail="Invalid OTP format. Must be 6 digits."
            )
        
        # Check if OTP exists
        stored_data = otp_storage.get(request.phone_number)
        if not stored_data:
            return VerifyOTPResponse(
                success=False,
                message="OTP not found. Please request a new OTP."
            )
        
        # Check expiration
        if time.time() > stored_data["expires_at"]:
            del otp_storage[request.phone_number]
            return VerifyOTPResponse(
                success=False,
                message="OTP has expired. Please request a new OTP."
            )
        
        # Verify OTP
        if stored_data["otp"] != request.otp_code:
            return VerifyOTPResponse(
                success=False,
                message="Invalid OTP. Please check and try again."
            )
        
        # Success - clear OTP
        del otp_storage[request.phone_number]
        
        return VerifyOTPResponse(
            success=True,
            message="OTP verified successfully"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/send-invoice", response_model=SendInvoiceResponse)
async def send_invoice(request: SendInvoiceRequest):
    """
    Send invoice PDF via WhatsApp
    
    Note: Currently requires PDF to be uploaded to cloud storage first.
    For base64 PDFs, we'll need to implement cloud storage upload.
    """
    if not whatsapp_service:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp service not configured."
        )
    
    try:
        # Validate phone number
        if not request.phone_number.isdigit() or len(request.phone_number) != 10:
            raise HTTPException(status_code=400, detail="Invalid phone number")
        
        # For now, if PDF is base64, we need to handle it
        # In production, upload to cloud storage (S3/CloudFront) first
        if request.pdf_base64:
            # TODO: Upload base64 PDF to cloud storage and get public URL
            # For now, return error suggesting manual upload
            return SendInvoiceResponse(
                success=False,
                message="PDF upload to cloud storage not yet implemented. Please use cloud storage URL instead."
            )
        
        # If we have a document URL, send it
        # This would be set when PDF is uploaded to cloud storage
        raise HTTPException(
            status_code=501,
            detail="Invoice sending via base64 not yet implemented. Please upload PDF to cloud storage first."
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/send-invoice-url", response_model=SendInvoiceResponse)
async def send_invoice_url(
    phone_number: str,
    document_url: str,
    filename: str = "invoice.pdf",
    caption: Optional[str] = None
):
    """
    Send invoice PDF via WhatsApp using public URL
    
    Args:
        phone_number: Recipient phone number (10 digits)
        document_url: Public URL of the PDF document
        filename: Name of the file
        caption: Optional caption text
    """
    if not whatsapp_service:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp service not configured."
        )
    
    try:
        # Validate phone number
        if not phone_number.isdigit() or len(phone_number) != 10:
            raise HTTPException(status_code=400, detail="Invalid phone number")
        
        # Send document via WhatsApp
        result = whatsapp_service.send_document(
            phone_number=phone_number,
            document_url=document_url,
            filename=filename,
            caption=caption
        )
        
        if not result.get("success"):
            error_msg = result.get("error", "Unknown error")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to send invoice: {error_msg}"
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


@router.post("/send-report", response_model=SendReportResponse)
async def send_report(request: SendReportRequest):
    """
    Send report PDF via WhatsApp
    
    Note: Currently requires PDF to be uploaded to cloud storage first.
    """
    if not whatsapp_service:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp service not configured."
        )
    
    try:
        # Validate phone number
        if not request.phone_number.isdigit() or len(request.phone_number) != 10:
            raise HTTPException(status_code=400, detail="Invalid phone number")
        
        # For now, return not implemented
        raise HTTPException(
            status_code=501,
            detail="Report sending not yet implemented. Please upload PDF to cloud storage first and use send-report-url endpoint."
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/send-report-url", response_model=SendReportResponse)
async def send_report_url(
    phone_number: str,
    document_url: str,
    filename: str = "report.pdf",
    caption: Optional[str] = None
):
    """
    Send report PDF via WhatsApp using public URL
    """
    if not whatsapp_service:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp service not configured."
        )
    
    try:
        # Validate phone number
        if not phone_number.isdigit() or len(phone_number) != 10:
            raise HTTPException(status_code=400, detail="Invalid phone number")
        
        # Send document via WhatsApp
        result = whatsapp_service.send_document(
            phone_number=phone_number,
            document_url=document_url,
            filename=filename,
            caption=caption
        )
        
        if not result.get("success"):
            error_msg = result.get("error", "Unknown error")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to send report: {error_msg}"
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

