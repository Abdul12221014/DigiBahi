import { getApiBaseUrl } from '@/lib/api-config';

const BASE = getApiBaseUrl();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string }>('/api/v1/health'),
  getLedger: () => request<Record<string, unknown>[]>('/api/v1/ledger'),
  addLedger: (entry: Record<string, unknown>) => request<Record<string, unknown>>('/api/v1/ledger', { method: 'POST', body: JSON.stringify(entry) }),
  reports: () => request<Record<string, unknown>[]>('/api/v1/reports'),
  sync: (batch: unknown[]) => request<{ ok: boolean }>('/api/v1/sync', { method: 'POST', body: JSON.stringify(batch) }),
};

export default api;
