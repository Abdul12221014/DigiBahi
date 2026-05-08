import { getApiUrl } from '@/lib/api-config';

const BASE = getApiUrl('');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string }>('/health'),
  getLedger: () => request<Record<string, unknown>[]>('/ledger'),
  addLedger: (entry: Record<string, unknown>) => request<Record<string, unknown>>('/ledger', { method: 'POST', body: JSON.stringify(entry) }),
  reports: () => request<Record<string, unknown>[]>('/reports'),
  sync: (batch: unknown[]) => request<{ ok: boolean }>('/sync', { method: 'POST', body: JSON.stringify(batch) }),
};

export default api;
