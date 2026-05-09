import { db } from '@/lib/db';
import { getLedger } from '@/services/ledger.service';
import { GST_RATES, DEFAULT_GST_RATE, GST_CONFIG, validateAmount } from '../constants/gst.constants';
import type { GSTR1Row, GSTR3BSummary, LedgerLocal } from '../types/gst.types';

export class GSTReportError extends Error {
  constructor(
    message: string,
    public code: string,
    public userMessage: string = "Error generating GST reports.",
    public recoverable: boolean = true,
    public retryable: boolean = false,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GSTReportError";
  }
}

/** Strict ISO date (YYYY-MM-DD) */
export function isIsoDate(date?: string): boolean {
  if (!date || typeof date !== "string" || date.length !== 10) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  try {
    const [y,m,d] = date.split("-").map(Number);
    const parsed = new Date(date);
    return (
      !isNaN(parsed.getTime()) &&
      parsed.getFullYear() === y &&
      parsed.getMonth() === m - 1 &&
      parsed.getDate() === d &&
      parsed.toISOString().slice(0,10) === date
    );
  } catch { return false; }
}

/** Round to 2dp with floating-point safety */
export function round2(n: number): number {
  const v = Number(n);
  if (!isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Runtime entry validation (no schema changes) */
export function validateEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  return typeof e.amount === "number" && isFinite(e.amount)
    && typeof e.type === "string"
    && typeof e.date === "string" && isIsoDate(e.date)
    && ["sale","purchase","expense","receipt","return"].includes(e.type);
}

/** Safe processing of negative/return entries */
export function handleReturn(e: unknown) {
  const entry = (e && typeof e === 'object') ? e as Record<string, unknown> : null;
  const amt = Number(entry?.amount ?? 0);
  if (amt >= 0 && entry?.type !== "return") return null;

  const rate = Math.min(Math.max(Number(entry?.gstRate ?? 0), 0), 28);
  if (!isFinite(rate) || rate <= 0) return null;

  const divisor = 1 + rate / 100;
  if (!isFinite(divisor) || divisor <= 0) return null;

  const absAmt = Math.abs(amt);
  if (absAmt === 0) return null;

  const taxable = round2(absAmt / divisor);
  const gstAmount = round2(absAmt - taxable);
  if (taxable < 0 || gstAmount < 0) return null;

  return { taxable, gstAmount, rate };
}

/** Precise heuristic mode detection (both GST fields missing/invalid) */
export function isHeuristicMode(entries: unknown[]): boolean {
  if (!Array.isArray(entries) || !entries.length) return false;
  return entries.some(e => {
    const entry = (e && typeof e === 'object') ? e as Record<string, unknown> : null;
    const hasRate = entry?.gstRate != null && isFinite(Number(entry.gstRate));
    const hasAmt = entry?.gstAmount != null && isFinite(Number(entry.gstAmount));
    return !hasRate && !hasAmt;
  });
}

/** Wrap a fn and warn in DEV if it exceeds threshold (ms) */
export function withPerformanceMonitoring<T>(
  fn: () => T,
  threshold = 2000,
  label = "GST"
): T {
  const start = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  const result = fn();
  const end = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  const duration = end - start;
  if (import.meta.env.DEV && duration > threshold) {
    // Keep the string short to protect bundle size
    console.warn(`[${label}] slow: ${Math.round(duration)}ms`);
  }
  return result;
}

type Entry = {
  date: string;
  description?: string;
  amount: number;
  type?: 'sale' | 'purchase' | 'expense' | 'receipt';
  gstRate?: number;
  gstAmount?: number;
};


function mapLedgerLocalToEntry(local: LedgerLocal): Entry {
  return {
    date: local.date,
    description: local.description,
    amount: local.amount,
    type: local.type,
    gstRate: local.gstRate,
    gstAmount: local.gstAmount,
  };
}

async function getLedgerEntries(period: string): Promise<Entry[]> {
  try {
    if (db?.ledger) {
      const rows = await db.ledger.where('date').startsWith(period).toArray();
      return rows.filter((e: { is_active?: boolean }) => e.is_active !== false) as Entry[];
    }
    const localEntries = await getLedger();
    return localEntries
      .filter(e => e.date?.startsWith(period) && (e as { is_active?: boolean }).is_active !== false)
      .map(mapLedgerLocalToEntry);
  } catch (err) {
    console.warn('[GST] Ledger fetch failed:', err);
    return [];
  }
}

/** Configurable business logic for GST rates */
function getBusinessGSTRate(amount: number, type: string | undefined): number {
  if (type === 'sale' && amount > GST_CONFIG.highValueThreshold) return 18;
  if (type === 'sale' && amount < GST_CONFIG.lowValueThreshold) return 5;
  if (type === 'purchase') return GST_CONFIG.defaultPurchaseRate;
  return DEFAULT_GST_RATE;
}

/** Normalizes GST data even if missing fields */
function normalizeTax(e: Entry) {
  const rate = GST_RATES.includes(e.gstRate as 0 | 5 | 12 | 18 | 28)
    ? e.gstRate!
    : getBusinessGSTRate(e.amount, e.type);

  const amt = Math.max(0, Number(e.amount || 0));
  if (typeof e.gstAmount === 'number' && e.gstAmount < amt) {
    const taxable = amt - e.gstAmount;
    return { taxable, gstRate: rate, gstAmount: e.gstAmount, total: amt };
  }
  const divisor = 1 + rate / 100;
  const taxable = +(amt / divisor).toFixed(2);
  const gstAmount = +(amt - taxable).toFixed(2);
  return { taxable, gstRate: rate, gstAmount, total: amt };
}

/** GSTR-1: Sales Register */
export async function generateGSTR1(period: string): Promise<GSTR1Row[]> {
  if (!period || !period.match(/^\d{4}-\d{2}$/))
    throw new GSTReportError('Invalid period', 'INVALID_PERIOD');

  const entries = await getLedgerEntries(period);
  if (!entries.length) return [];

  return entries
    .filter(e => e.type === 'sale' && validateEntry(e))
    .map(e => {
      const n = normalizeTax(e);
      return {
        invoiceDate: e.date,
        description: e.description,
        type: e.type,
        taxableAmount: n.taxable,
        gstRate: n.gstRate,
        gstAmount: n.gstAmount,
        totalAmount: n.total,
      };
    });
}

/** GSTR-3B: Summary */
export async function generateGSTR3B(period: string): Promise<GSTR3BSummary> {
  const entries = await getLedgerEntries(period);
  const sales = entries.filter(e => e.type === 'sale');
  const purchases = entries.filter(e => e.type === 'purchase');

  let outwardTaxable = 0, outwardGST = 0, inwardTaxable = 0, inwardGST = 0;
  for (const s of sales) {
    const n = normalizeTax(s);
    outwardTaxable += n.taxable; outwardGST += n.gstAmount;
  }
  for (const p of purchases) {
    const n = normalizeTax(p);
    inwardTaxable += n.taxable; inwardGST += n.gstAmount;
  }

  return {
    period,
    outwardTaxable,
    outwardGST,
    inwardTaxable,
    inwardGST,
    netGSTLiability: Math.max(outwardGST - inwardGST, 0),
  };
}
