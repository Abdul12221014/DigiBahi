/**
 * Invoice Number Service
 * Primary: server-side atomic sequence (multi-device safe).
 * Fallback: localStorage counter (used when backend is unreachable).
 */

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000';
const LOCAL_NUMBER_KEY = 'digbahi_last_invoice_number';
const LOCAL_YEAR_KEY   = 'digbahi_invoice_year';

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

// ─── Local fallback ───────────────────────────────────────────────────────────

function localNext(): string {
  const year = new Date().getFullYear().toString();
  if (localStorage.getItem(LOCAL_YEAR_KEY) !== year) {
    localStorage.setItem(LOCAL_YEAR_KEY, year);
    localStorage.setItem(LOCAL_NUMBER_KEY, '0');
  }
  const next = parseInt(localStorage.getItem(LOCAL_NUMBER_KEY) || '0', 10) + 1;
  localStorage.setItem(LOCAL_NUMBER_KEY, next.toString());
  const padded = next < 1000 ? String(next).padStart(3, '0') : String(next);
  return `INV-${year}-${padded}`;
}

function localPeek(): string {
  const year = new Date().getFullYear().toString();
  if (localStorage.getItem(LOCAL_YEAR_KEY) !== year) return `INV-${year}-000`;
  const last = parseInt(localStorage.getItem(LOCAL_NUMBER_KEY) || '0', 10);
  const padded = last < 1000 ? String(last).padStart(3, '0') : String(last);
  return `INV-${year}-${padded}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reserve the next invoice number.
 * Tries the backend first (atomic, multi-device safe).
 * Falls back to localStorage if the backend is unreachable.
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
 * Preview the next invoice number without committing it.
 * Always reads from localStorage (cheap, synchronous).
 * The real number is only reserved when getNextInvoiceNumber() is called.
 */
export function previewNextInvoiceNumber(): string {
  const year = new Date().getFullYear().toString();
  if (localStorage.getItem(LOCAL_YEAR_KEY) !== year) return `INV-${year}-001`;
  const last = parseInt(localStorage.getItem(LOCAL_NUMBER_KEY) || '0', 10);
  const next = last + 1;
  const padded = next < 1000 ? String(next).padStart(3, '0') : String(next);
  return `INV-${year}-${padded}`;
}

/**
 * Get the last issued invoice number (no increment).
 */
export function getLastInvoiceNumber(): string {
  return localPeek();
}

/**
 * Reset local counter (testing / manual override only).
 */
export function resetInvoiceNumber(): void {
  localStorage.removeItem(LOCAL_NUMBER_KEY);
  localStorage.removeItem(LOCAL_YEAR_KEY);
}
