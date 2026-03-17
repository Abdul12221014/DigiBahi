import { db } from '@/lib/db';
import { getApiUrl } from '@/lib/api-config';

export interface AuditRow { id: number; user_id: number; action: string; resource: string; timestamp: string; device_id: string }

const AUDIT_CACHE_KEY = 'digbahi_audit_cache_v1';

export const auditService = {
  async fetchRecent(): Promise<AuditRow[]> {
    try {
      const res = await fetch(getApiUrl('/audit'));
      if (!res.ok) throw new Error('HTTP error');
      const rows: AuditRow[] = await res.json();
      try { localStorage.setItem(AUDIT_CACHE_KEY, JSON.stringify(rows)); } catch {}
      return rows;
    } catch {
      try {
        const cached = localStorage.getItem(AUDIT_CACHE_KEY);
        if (cached) return JSON.parse(cached);
      } catch {}
      return [];
    }
  },
};

export default auditService;


