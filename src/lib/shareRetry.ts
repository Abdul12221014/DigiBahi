/**
 * Share Retry Service — 3-level fallback chain
 * ─────────────────────────────────────────────
 * 1. Web Share API     — native mobile share, can attach PDF
 * 2. wa.me link        — opens WhatsApp with pre-filled message
 * 3. PDF download      — last resort, user receives the file locally
 *
 * No sharing logic should live in components. Always use this module.
 */

import { analytics } from './analytics';

export type ShareMethod = 'web_share' | 'wa_me' | 'pdf_download';

export interface ShareResult {
  method: ShareMethod;
  success: boolean;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildWaUrl(
  dialCode: string,
  phone: string,
  message: string,
): string {
  // Strip leading zeros from phone (e.g. 0XXXXXXXXXX → XXXXXXXXXX)
  const cleanPhone = phone.replace(/^0+/, '');
  return `https://wa.me/${dialCode}${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Main Fallback Chain ──────────────────────────────────────────────────────

export interface SharePayload {
  pdfBlob: Blob;
  filename: string;
  message: string;
  phone: string;
  dialCode: string;
  title: string;
}

/**
 * Attempt to share using the best available method.
 * Automatically falls through to the next on failure.
 *
 * @param payload  - Share content
 * @param onMethod - Called each time a method is attempted (for UI feedback)
 */
export async function shareWithFallback(
  payload: SharePayload,
  onMethod?: (method: ShareMethod) => void,
): Promise<ShareResult> {
  const { pdfBlob, filename, message, phone, dialCode, title } = payload;

  // ── Level 1: Web Share API ────────────────────────────────────────────────
  const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });
  const shareData = { files: [pdfFile], title, text: message };

  if (navigator.canShare?.(shareData)) {
    try {
      onMethod?.('web_share');
      await navigator.share(shareData);
      analytics.track('invoice_share_success', { method: 'web_share' });
      return { method: 'web_share', success: true };
    } catch (err: any) {
      // User cancelled — not a failure, propagate the cancel
      if (err?.name === 'AbortError') {
        analytics.track('invoice_share_cancelled', { method: 'web_share' });
        throw err;
      }
      // Otherwise fall through to Level 2
      analytics.track('whatsapp_fallback_used', {
        reason: 'web_share_error',
        error: err?.message,
      });
    }
  }

  // ── Level 2: wa.me Link ───────────────────────────────────────────────────
  try {
    onMethod?.('wa_me');
    const waUrl = buildWaUrl(dialCode, phone, message);
    // Append PDF attachment note to message if we can also trigger download
    const waUrlWithNote = buildWaUrl(
      dialCode,
      phone,
      message + '\n\n📄 PDF invoice sent separately — please attach in chat.',
    );
    const win = window.open(waUrlWithNote, '_blank');
    if (win && !win.closed) {
      // Also trigger PDF download so user can attach it
      downloadBlob(pdfBlob, filename);
      analytics.track('invoice_share_success', { method: 'wa_me' });
      analytics.track('whatsapp_fallback_used', { reason: 'no_web_share_api' });
      return { method: 'wa_me', success: true };
    }
  } catch (err: any) {
    analytics.track('whatsapp_fallback_used', {
      reason: 'wa_me_blocked',
      error: err?.message,
    });
  }

  // ── Level 3: PDF Download ─────────────────────────────────────────────────
  onMethod?.('pdf_download');
  downloadBlob(pdfBlob, filename);
  analytics.track('pdf_download_fallback', { phone });
  return { method: 'pdf_download', success: true };
}
