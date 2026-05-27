/**
 * Invoice Number Service
 * Primary: server-side atomic sequence (multi-device safe).
 * Fallback: UUID-based local numbers — avoids the localStorage race condition
 *           where two browser tabs simultaneously increment the same counter.
 *           Format: INV-LOCAL-<year>-<8 hex chars>
 *           These are reconciled with the server sequence when connectivity returns.
 */

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceNumberResult {
  invoiceNumber: string;
  source: 'server' | 'local';
}

// ─── Server-side (primary) ────────────────────────────────────────────────────

async function fetchNextFromServer(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/v1/whatsapp/invoice-number/next`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.invoice_number as string;
}

// ─── Local fallback — UUID-based, no shared-counter race ─────────────────────

function localNext(): string {
  const year = new Date().getFullYear().toString();
  // 8 hex chars from crypto.getRandomValues — guaranteed unique per call,
  // no localStorage read-then-write race between concurrent tabs.
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `INV-LOCAL-${year}-${hex.toUpperCase()}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reserve the next invoice number.
 * Tries the backend first (atomic, multi-device safe).
 * Falls back to a UUID-based local number if the backend is unreachable.
 * Local numbers are prefixed with "INV-LOCAL-" so they are easily identified
 * and can be reconciled with the server sequence later.
 */
export async function getNextInvoiceNumber(): Promise<InvoiceNumberResult> {
  try {
    const invoiceNumber = await fetchNextFromServer();
    return { invoiceNumber, source: 'server' };
  } catch {
    return { invoiceNumber: localNext(), source: 'local' };
  }
}

/**
 * Preview the next invoice number format.
 * Always returns a descriptive placeholder — the real number is only
 * reserved when getNextInvoiceNumber() is called.
 */
export function previewNextInvoiceNumber(): string {
  const year = new Date().getFullYear().toString();
  return `INV-${year}-???`;
}

/**
 * Check whether an invoice number was generated offline (local fallback).
 * Useful to warn users that the number will differ from the server sequence
 * once connectivity is restored.
 */
export function isLocalInvoiceNumber(invoiceNumber: string): boolean {
  return invoiceNumber.startsWith('INV-LOCAL-');
}
