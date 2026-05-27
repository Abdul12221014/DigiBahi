// GST rate slabs as per Indian GST regulations
export const GST_RATES = [0, 5, 12, 18, 28] as const;

export type GSTRate = typeof GST_RATES[number];

export interface GSTCalculation {
  baseAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
}

/**
 * @deprecated Use `splitTax()` from `@/features/gst/services/tax-splitter.service`
 * which works in integer paise and avoids floating-point accumulation errors.
 * This function performs float arithmetic and rounds per-call — acceptable for
 * one-off display, NOT safe for accumulated totals or GSTR filing.
 */
export function calculateGST(amount: number, rate: GSTRate): GSTCalculation {
  const gstAmount = (amount * rate) / 100;
  return {
    baseAmount: amount,
    gstRate: rate,
    gstAmount: Math.round(gstAmount * 100) / 100,
    totalAmount: Math.round((amount + gstAmount) * 100) / 100,
  };
}

/**
 * @deprecated Use `splitTax()` from `@/features/gst/services/tax-splitter.service`
 * which returns `taxableValuePaise` directly without reverse-computing from totals.
 * This function loses precision when `totalAmount` is not a round-paise value.
 */
export function extractBaseAmount(totalAmount: number, rate: GSTRate): number {
  const baseAmount = (totalAmount * 100) / (100 + rate);
  return Math.round(baseAmount * 100) / 100;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(date));
}
