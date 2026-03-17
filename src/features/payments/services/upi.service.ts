import type { UPIIntent, UPIIntentLink, UPIReconcileRequest } from '../types/upi.types';
import { enqueueReconcile } from '@/lib/db';

/**
 * Generate a collision-safe transaction reference
 * Format: DIGBAHI_YYYYMMDD_HHMMSS_RANDOM
 */
export function generateTxnRef(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  return `DIGBAHI_${dateStr}_${timeStr}_${random}`;
}

/**
 * Build UPI intent link for payment
 * Format: upi://pay?pa=<upiId>&pn=<payeeName>&am=<amount>&cu=INR&tn=<note>&tr=<txnRef>
 */
export function buildUPIIntentLink(params: {
  upiId: string;
  amount: number;
  note?: string;
  txnRef: string;
  payeeName?: string;
}): string {
  const { upiId, amount, note, txnRef, payeeName = 'DigBahi' } = params;
  
  const urlParams = new URLSearchParams({
    pa: upiId,                    // Payee Address (UPI ID)
    pn: payeeName,                // Payee Name
    am: amount.toString(),        // Amount
    cu: 'INR',                   // Currency
    tr: txnRef,                  // Transaction Reference
    ...(note && { tn: note })    // Transaction Note (optional)
  });
  
  return `upi://pay?${urlParams.toString()}`;
}

/**
 * Convert UPI intent link to QR code data
 * For QR generation libraries
 */
export function toUPIQRData(link: string): string {
  return link;
}

/**
 * Create UPI intent object
 */
export function createUPIIntent(params: {
  upiId: string;
  amount: number;
  note?: string;
  payerName?: string;
}): UPIIntent {
  const txnRef = generateTxnRef();
  const now = Date.now();
  
  return {
    id: crypto.randomUUID(),
    upiId: params.upiId,
    payerName: params.payerName,
    amount: params.amount,
    note: params.note,
    txnRef,
    status: 'draft',
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Generate UPI intent link and QR data
 */
export function generateUPIIntentLink(intent: UPIIntent): UPIIntentLink {
  const link = buildUPIIntentLink({
    upiId: intent.upiId,
    amount: intent.amount,
    note: intent.note,
    txnRef: intent.txnRef,
    payerName: intent.payerName
  });
  
  return {
    link,
    qrData: toUPIQRData(link),
    txnRef: intent.txnRef
  };
}

/**
 * Enqueue reconciliation request for backend sync
 */
export async function enqueueReconcileRequest(intent: UPIIntent): Promise<void> {
  const reconcileRequest: UPIReconcileRequest = {
    id: intent.id,
    txnRef: intent.txnRef,
    amount: intent.amount,
    upiId: intent.upiId,
    timestamp: Date.now()
  };
  
  await enqueueReconcile(reconcileRequest);
}

/**
 * Validate UPI ID format
 * Basic validation for common UPI ID patterns
 */
export function validateUPIId(upiId: string): { valid: boolean; error?: string } {
  if (!upiId || upiId.trim().length === 0) {
    return { valid: false, error: 'UPI ID is required' };
  }
  
  const trimmed = upiId.trim().toLowerCase();
  
  // Common UPI ID patterns
  const patterns = [
    /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/,  // email format
    /^[a-zA-Z0-9._-]+@paytm$/,           // Paytm
    /^[a-zA-Z0-9._-]+@phonepe$/,         // PhonePe
    /^[a-zA-Z0-9._-]+@gpay$/,            // Google Pay
    /^[a-zA-Z0-9._-]+@ybl$/,             // Yono (SBI)
    /^[a-zA-Z0-9._-]+@okaxis$/,          // Axis Bank
    /^[a-zA-Z0-9._-]+@okhdfcbank$/,      // HDFC Bank
    /^[a-zA-Z0-9._-]+@okicici$/,         // ICICI Bank
    /^[a-zA-Z0-9._-]+@oksbi$/,           // SBI
    /^[a-zA-Z0-9._-]+@okbob$/,           // Bank of Baroda
    /^[a-zA-Z0-9._-]+@okkotak$/,          // Kotak Bank
    /^[a-zA-Z0-9._-]+@okunionbank$/,      // Union Bank
    /^[a-zA-Z0-9._-]+@okpnb$/,            // Punjab National Bank
    /^[a-zA-Z0-9._-]+@okaxis$/,           // Axis Bank
    /^[a-zA-Z0-9._-]+@okbob$/,           // Bank of Baroda
    /^[a-zA-Z0-9._-]+@okunionbank$/       // Union Bank
  ];
  
  const isValid = patterns.some(pattern => pattern.test(trimmed));
  
  if (!isValid) {
    return { 
      valid: false, 
      error: 'Invalid UPI ID format. Use format: username@bankname' 
    };
  }
  
  return { valid: true };
}

/**
 * Format amount for display
 */
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Format UPI ID for display (mask sensitive parts)
 */
export function formatUPIIdForDisplay(upiId: string): string {
  if (!upiId || upiId.length < 5) return upiId;
  
  const [username, domain] = upiId.split('@');
  if (!domain) return upiId;
  
  const maskedUsername = username.length > 3 
    ? `${username.slice(0, 2)}***${username.slice(-1)}`
    : `${username.slice(0, 1)}***`;
    
  return `${maskedUsername}@${domain}`;
}
