/**
 * WhatsApp Business API Service (Frontend)
 * Handles communication with backend WhatsApp API endpoints
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WHATSAPP_API_ENDPOINT = `${API_BASE_URL}/api/v1/whatsapp`;

export interface SendOTPResponse {
  success: boolean;
  message: string;
  otp_code?: string; // Only in development/testing
  message_id?: string;
  expires_at?: number;
}

export interface VerifyOTPResponse {
  success: boolean;
  message: string;
}

export interface SendInvoiceResponse {
  success: boolean;
  message: string;
  message_id?: string;
}

export interface SendReportResponse {
  success: boolean;
  message: string;
  message_id?: string;
}

class WhatsAppAPIService {
  /**
   * Send OTP via WhatsApp Business API
   */
  async sendOTP(phoneNumber: string, templateName: string = 'digbahi_otp'): Promise<SendOTPResponse> {
    try {
      const response = await fetch(`${WHATSAPP_API_ENDPOINT}/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone_number: phoneNumber,
          template_name: templateName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      // If network error or API unavailable, throw to allow fallback
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('API_UNAVAILABLE');
      }
      throw error;
    }
  }

  /**
   * Verify OTP code
   */
  async verifyOTP(phoneNumber: string, otpCode: string): Promise<VerifyOTPResponse> {
    try {
      const response = await fetch(`${WHATSAPP_API_ENDPOINT}/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone_number: phoneNumber,
          otp_code: otpCode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('API_UNAVAILABLE');
      }
      throw error;
    }
  }

  /**
   * Send invoice PDF via WhatsApp using public URL
   */
  async sendInvoiceURL(
    phoneNumber: string,
    documentUrl: string,
    filename: string = 'invoice.pdf',
    caption?: string
  ): Promise<SendInvoiceResponse> {
    try {
      const params = new URLSearchParams({
        phone_number: phoneNumber,
        document_url: documentUrl,
        filename: filename,
      });
      if (caption) {
        params.append('caption', caption);
      }

      const response = await fetch(`${WHATSAPP_API_ENDPOINT}/send-invoice-url?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('API_UNAVAILABLE');
      }
      throw error;
    }
  }

  /**
   * Send report PDF via WhatsApp using public URL
   */
  async sendReportURL(
    phoneNumber: string,
    documentUrl: string,
    filename: string = 'report.pdf',
    caption?: string
  ): Promise<SendReportResponse> {
    try {
      const params = new URLSearchParams({
        phone_number: phoneNumber,
        document_url: documentUrl,
        filename: filename,
      });
      if (caption) {
        params.append('caption', caption);
      }

      const response = await fetch(`${WHATSAPP_API_ENDPOINT}/send-report-url?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('API_UNAVAILABLE');
      }
      throw error;
    }
  }
}

export const whatsappAPIService = new WhatsAppAPIService();

