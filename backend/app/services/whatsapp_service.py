"""
WhatsApp Business API (Cloud API) Service
Handles sending messages, documents, and templates via WhatsApp Business API
"""
import os
import requests
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()


class WhatsAppService:
    """WhatsApp Business API (Cloud API) service for sending messages"""
    
    def __init__(self):
        self.phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
        self.access_token = os.getenv("WHATSAPP_ACCESS_TOKEN")
        self.api_version = os.getenv("WHATSAPP_API_VERSION", "v22.0")
        self.base_url = f"https://graph.facebook.com/{self.api_version}"
        
        if not self.phone_number_id or not self.access_token:
            raise ValueError(
                "WhatsApp credentials not configured. "
                "Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in .env"
            )
    
    def _format_phone_number(self, phone: str) -> str:
        """
        Format phone number with country code
        
        Args:
            phone: Phone number (10 digits or with country code)
        
        Returns:
            Formatted phone number with country code (e.g., 919876543210)
        """
        # Remove all non-digits
        cleaned = ''.join(filter(str.isdigit, phone))
        
        # Handle double zero prefix (0091...)
        if cleaned.startswith('0091') and len(cleaned) >= 13:
            cleaned = '91' + cleaned[4:]  # Remove 0091, keep 91
        
        # If already has country code (starts with 91), return as is
        if cleaned.startswith('91') and len(cleaned) == 12:
            return cleaned
        
        # If 10 digits, add India country code (91)
        if len(cleaned) == 10:
            return f"91{cleaned}"
        
        # If other format, return cleaned
        return cleaned
    
    def send_otp(self, phone_number: str, otp_code: str, template_name: str = "digbahi_otp") -> Dict[str, Any]:
        """
        Send OTP via WhatsApp Business API using template message
        
        Args:
            phone_number: Recipient phone number (10 digits or with country code)
            otp_code: 6-digit OTP code
            template_name: WhatsApp template name (default: "digbahi_otp")
        
        Returns:
            Dict with success status and message ID or error details
        """
        formatted_phone = self._format_phone_number(phone_number)
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "messaging_product": "whatsapp",
            "to": formatted_phone,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {
                    "code": "en_US"  # Can be changed to "en_IN" for India
                },
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            {
                                "type": "text",
                                "text": otp_code
                            }
                        ]
                    }
                ]
            }
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            
            # Check if request was successful
            if response.status_code == 200:
                result = response.json()
                return {
                    "success": True,
                    "message_id": result.get("messages", [{}])[0].get("id"),
                    "status": "sent",
                    "phone_number": formatted_phone
                }
            
            # Handle error response - parse JSON error
            try:
                error_data = response.json()
                error_info = error_data.get("error", {})
                return {
                    "success": False,
                    "error": error_info.get("message", f"HTTP {response.status_code}"),
                    "error_code": error_info.get("code"),
                    "error_type": error_info.get("type"),
                    "error_subcode": error_info.get("error_subcode"),
                    "status": "failed"
                }
            except (ValueError, KeyError):
                # If response is not JSON or malformed
                return {
                    "success": False,
                    "error": f"HTTP {response.status_code}: {response.text[:200]}",
                    "error_code": None,
                    "status": "failed"
                }
        
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": str(e),
                "status": "error"
            }
    
    def send_document(
        self, 
        phone_number: str, 
        document_url: str, 
        filename: str = "document.pdf",
        caption: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send document (PDF) via WhatsApp Business API
        
        Args:
            phone_number: Recipient phone number
            document_url: Public URL of the document (PDF)
            filename: Name of the file
            caption: Optional caption text
        
        Returns:
            Dict with success status and message ID or error details
        """
        formatted_phone = self._format_phone_number(phone_number)
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "messaging_product": "whatsapp",
            "to": formatted_phone,
            "type": "document",
            "document": {
                "link": document_url,
                "filename": filename
            }
        }
        
        if caption:
            payload["document"]["caption"] = caption
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            response.raise_for_status()
            
            result = response.json()
            
            return {
                "success": True,
                "message_id": result.get("messages", [{}])[0].get("id"),
                "status": "sent",
                "phone_number": formatted_phone
            }
        
        except requests.exceptions.HTTPError as e:
            error_data = e.response.json() if e.response else {}
            error_info = error_data.get("error", {})
            return {
                "success": False,
                "error": error_info.get("message", str(e)),
                "error_code": error_info.get("code"),
                "error_type": error_info.get("type"),
                "status": "failed"
            }
        
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": str(e),
                "status": "error"
            }
    
    def send_document_base64(
        self,
        phone_number: str,
        document_base64: str,
        filename: str = "document.pdf",
        caption: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send document via WhatsApp using base64 encoded data
        Note: WhatsApp API requires document to be hosted at a public URL.
        This method uploads to a temporary location first.
        
        For now, this is a placeholder. In production, you'd need to:
        1. Upload base64 to cloud storage (S3, CloudFront, etc.)
        2. Get public URL
        3. Call send_document() with that URL
        
        Args:
            phone_number: Recipient phone number
            document_base64: Base64 encoded document data
            filename: Name of the file
            caption: Optional caption text
        
        Returns:
            Dict with success status or error details
        """
        # For now, return error suggesting to use cloud storage
        return {
            "success": False,
            "error": "Base64 upload not directly supported. Please upload document to cloud storage first and use send_document() with public URL.",
            "status": "error"
        }
    
    def send_text_message(
        self,
        phone_number: str,
        message: str
    ) -> Dict[str, Any]:
        """
        Send text message via WhatsApp (within 24-hour window)
        
        Args:
            phone_number: Recipient phone number
            message: Text message content
        
        Returns:
            Dict with success status and message ID or error details
        """
        formatted_phone = self._format_phone_number(phone_number)
        url = f"{self.base_url}/{self.phone_number_id}/messages"
        
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "messaging_product": "whatsapp",
            "to": formatted_phone,
            "type": "text",
            "text": {
                "body": message
            }
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            
            result = response.json()
            
            return {
                "success": True,
                "message_id": result.get("messages", [{}])[0].get("id"),
                "status": "sent",
                "phone_number": formatted_phone
            }
        
        except requests.exceptions.HTTPError as e:
            error_data = e.response.json() if e.response else {}
            error_info = error_data.get("error", {})
            return {
                "success": False,
                "error": error_info.get("message", str(e)),
                "error_code": error_info.get("code"),
                "error_type": error_info.get("type"),
                "status": "failed"
            }
        
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": str(e),
                "status": "error"
            }
    
    def get_message_status(self, message_id: str) -> Dict[str, Any]:
        """
        Get delivery status of a sent message
        
        Args:
            message_id: Message ID from send response
        
        Returns:
            Dict with message status
        """
        url = f"{self.base_url}/{self.phone_number_id}/messages/{message_id}"
        
        headers = {
            "Authorization": f"Bearer {self.access_token}"
        }
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            return {
                "success": True,
                "data": response.json()
            }
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": str(e)
            }

