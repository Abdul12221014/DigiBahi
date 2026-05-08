/**
 * Ledger API Service
 * Connects frontend with backend API for ledger entries
 */

import { getApiBaseUrl } from '@/lib/api-config';
import { getSessionToken } from '@/lib/auth';
import sessionService from '@/services/session.service';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || getApiBaseUrl();
const API_ENDPOINT = `${API_BASE_URL}/api/v1/ledger`;

export interface LedgerEntry {
  id?: number;
  date: string;
  description: string;
  amount: number;
  type: 'sale' | 'purchase' | 'expense' | 'receipt';
  gstRate: number;
  gstAmount: number;
  party_name?: string;
  reference_no?: string;
  tags?: string;
  is_active: boolean;
  deleted_at?: string | null;
  created_by?: number | null;
  created_at: string;  // ISO format
  updated_at: string;  // ISO format
}

export interface LedgerListParams {
  skip?: number;
  limit?: number;
  search?: string;
  type?: string;
  from?: string;
  to?: string;
  tags?: string;
  include_total?: boolean;
}

export interface LedgerListResult {
  items: LedgerEntry[];
  total?: number;
  hasNext: boolean;
}

export interface ApiError {
  status: number;
  error: string;
  message: string;
  details?: unknown;
}

// Analytics interfaces (Phase D)
export interface AnalyticsSummary {
  total_sales: number;
  total_purchases: number;
  total_expenses: number;
  total_receipts: number;
  net_profit: number;
  cash_flow: number;
  gst_collected: number;
  gst_paid: number;
  net_gst: number;
}

export interface MonthlySummary {
  month: number; // 1-12
  sales: number;
  expenses: number;
  receipts: number;
  purchases: number;
}

export interface PartySummary {
  party_name: string;
  total_sales: number;
  total_receipts: number;
  total_purchases: number;
  transaction_count: number;
  net_balance: number;
}

export interface AnalyticsParams {
  from?: string;
  to?: string;
  type?: string;
}

function getSessionHeaders(): Record<string, string> {
  const token = getSessionToken() ?? sessionService.loadSession()?.token;
  if (token) return { 'X-Session-Token': token };
  return {};
}

/**
 * Abortable fetch helper with timeout.
 * Automatically injects X-Session-Token from the in-memory auth state.
 */
async function fetchJSON<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10000
): Promise<T> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...getSessionHeaders(),
        ...(init.headers || {}),
      },
    });
    
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    
    if (!res.ok) {
      const err: ApiError = json?.detail || {
        status: res.status,
        error: 'HTTP_ERROR',
        message: res.statusText,
      };
      throw err;
    }
    
    return json as T;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get paginated ledger entries with filters
 * Returns either array (backward compatible) or object with total
 */
export async function fetchLedger(
  params: LedgerListParams = {},
  signal?: AbortSignal
): Promise<LedgerListResult | LedgerEntry[]> {
  const searchParams = new URLSearchParams();
  if (params.skip !== undefined) searchParams.set('skip', params.skip.toString());
  if (params.limit !== undefined) searchParams.set('limit', params.limit.toString());
  if (params.search) searchParams.set('search', params.search);
  if (params.type) searchParams.set('type', params.type);
  if (params.from) searchParams.set('from', params.from);
  if (params.to) searchParams.set('to', params.to);
  if (params.tags) searchParams.set('tags', params.tags);
  if (params.include_total) searchParams.set('include_total', 'true');
  
  const response = await fetchJSON<LedgerListResult | LedgerEntry[]>(
    `${API_ENDPOINT}?${searchParams}`,
    { signal }
  );
  
  // If response is array (backward compatible), convert to result format
  if (Array.isArray(response)) {
    // Use limit+1 trick to determine hasNext
    const limit = params.limit || 50;
    const hasNext = response.length === limit + 1;
    const items = hasNext ? response.slice(0, -1) : response;
    
    return {
      items,
      hasNext,
    };
  }
  
  // Response already has {items, total, hasNext}
  return response;
}

/**
 * Fetch analytics summary
 */
export async function fetchAnalyticsSummary(
  params?: AnalyticsParams,
  signal?: AbortSignal
): Promise<AnalyticsSummary> {
  const searchParams = new URLSearchParams();
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);
  if (params?.type) searchParams.set('type', params.type);
  
  const response = await fetchJSON<AnalyticsSummary>(
    `${API_BASE_URL}/api/v1/ledger/analytics/summary?${searchParams}`,
    { signal }
  );
  
  return response;
}

/**
 * Fetch monthly summary for a year
 */
export async function fetchMonthlySummary(
  year: number,
  type?: string,
  signal?: AbortSignal
): Promise<MonthlySummary[]> {
  const searchParams = new URLSearchParams();
  searchParams.set('year', year.toString());
  if (type) searchParams.set('type', type);
  
  const response = await fetchJSON<MonthlySummary[]>(
    `${API_BASE_URL}/api/v1/ledger/analytics/monthly?${searchParams}`,
    { signal }
  );
  
  return response;
}

/**
 * Fetch party summary (top N parties)
 */
export async function fetchPartySummary(
  limit?: number,
  params?: { from?: string; to?: string },
  signal?: AbortSignal
): Promise<PartySummary[]> {
  const searchParams = new URLSearchParams();
  if (limit) searchParams.set('limit', limit.toString());
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);
  
  const response = await fetchJSON<PartySummary[]>(
    `${API_BASE_URL}/api/v1/ledger/analytics/parties?${searchParams}`,
    { signal }
  );
  
  return response;
}

/**
 * Create new ledger entry
 */
export async function createLedger(
  entry: Omit<LedgerEntry, 'id' | 'created_at' | 'updated_at' | 'is_active'>,
  options?: { idempotencyKey?: string },
  signal?: AbortSignal
): Promise<LedgerEntry> {
  const body: Record<string, unknown> = { ...entry };
  if (options?.idempotencyKey) {
    body.idempotency_key = options.idempotencyKey;
  }
  
  return fetchJSON<LedgerEntry>(API_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
}

/**
 * Update ledger entry
 */
export async function updateLedger(
  id: number,
  patch: Partial<LedgerEntry>,
  signal?: AbortSignal
): Promise<LedgerEntry> {
  return fetchJSON<LedgerEntry>(`${API_ENDPOINT}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
    signal,
  });
}

/**
 * Soft delete ledger entry
 */
export async function softDeleteLedger(
  id: number,
  signal?: AbortSignal
): Promise<void> {
  await fetchJSON<void>(`${API_ENDPOINT}/${id}`, {
    method: 'DELETE',
    signal,
  });
}

