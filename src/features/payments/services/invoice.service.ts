/**
 * Invoice Number Generation Service
 * Generates invoice numbers in format: INV-YYYY-XXX
 */

const INVOICE_NUMBER_KEY = 'digbahi_last_invoice_number';
const INVOICE_YEAR_KEY = 'digbahi_invoice_year';

/**
 * Get next invoice number (preview, doesn't increment)
 * Format: INV-YYYY-XXX (e.g., INV-2025-001)
 */
export function getNextInvoiceNumber(): string {
  const currentYear = new Date().getFullYear().toString();
  const lastYear = localStorage.getItem(INVOICE_YEAR_KEY);
  
  // Reset counter if year changed
  if (lastYear !== currentYear) {
    return `INV-${currentYear}-001`;
  }
  
  const lastNumber = parseInt(localStorage.getItem(INVOICE_NUMBER_KEY) || '0', 10);
  const nextNumber = lastNumber + 1;
  
  // Format: INV-2025-001
  const paddedNumber = nextNumber.toString().padStart(3, '0');
  return `INV-${currentYear}-${paddedNumber}`;
}

/**
 * Commit and increment invoice number (use when actually creating invoice)
 * This increments the counter after using the preview number
 */
export function commitInvoiceNumber(): void {
  const currentYear = new Date().getFullYear().toString();
  const lastYear = localStorage.getItem(INVOICE_YEAR_KEY);
  
  // Reset counter if year changed
  if (lastYear !== currentYear) {
    localStorage.setItem(INVOICE_YEAR_KEY, currentYear);
    localStorage.setItem(INVOICE_NUMBER_KEY, '0');
  }
  
  const lastNumber = parseInt(localStorage.getItem(INVOICE_NUMBER_KEY) || '0', 10);
  const nextNumber = lastNumber + 1;
  
  // Save next number for future use
  localStorage.setItem(INVOICE_NUMBER_KEY, nextNumber.toString());
}

/**
 * Get last invoice number (without incrementing)
 */
export function getLastInvoiceNumber(): string {
  const currentYear = new Date().getFullYear().toString();
  const lastYear = localStorage.getItem(INVOICE_YEAR_KEY);
  
  if (lastYear !== currentYear) {
    return `INV-${currentYear}-000`;
  }
  
  const lastNumber = parseInt(localStorage.getItem(INVOICE_NUMBER_KEY) || '0', 10);
  const paddedNumber = lastNumber.toString().padStart(3, '0');
  return `INV-${currentYear}-${paddedNumber}`;
}

/**
 * Reset invoice number (for testing or manual reset)
 */
export function resetInvoiceNumber(): void {
  localStorage.removeItem(INVOICE_NUMBER_KEY);
  localStorage.removeItem(INVOICE_YEAR_KEY);
}

