/**
 * Offline sync queue — batches offline writes and flushes them
 * to the backend when connectivity is restored.
 *
 * The queue is in-memory only. Items survive page navigation within a session
 * but not a hard reload. For durable offline support, use Dexie syncQueue
 * (UPI) or the ledger datasource fallback (which writes directly to Dexie).
 */

import { getSessionToken } from '@/lib/auth';
import { getApiBaseUrl } from '@/lib/api-config';

type QueueItem = {
  id: string;
  type: 'draw' | 'shape' | 'ocr' | 'ledger';
  payload: unknown;
  createdAt: number;
};

type Hooks = {
  onSyncStart?: () => void;
  onSyncComplete?: (count: number) => void;
  onError?: (error: unknown) => void;
};

const queue: QueueItem[] = [];

export function enqueue(item: Omit<QueueItem, 'id' | 'createdAt'>) {
  queue.push({
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
    ...item,
  });
}

export async function flush(hooks: Hooks = {}): Promise<number> {
  if (queue.length === 0) return 0;

  hooks.onSyncStart?.();
  const batch = queue.splice(0, queue.length);

  const token = getSessionToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['X-Session-Token'] = token;

  try {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      // Re-queue on server error so items aren't silently lost
      batch.forEach(i => queue.push(i));
      hooks.onError?.(new Error(`Sync failed: HTTP ${res.status}`));
      return 0;
    }

    hooks.onSyncComplete?.(batch.length);
    return batch.length;
  } catch (e) {
    // Network error — re-queue
    batch.forEach(i => queue.push(i));
    hooks.onError?.(e);
    return 0;
  }
}

export function pendingCount(): number {
  return queue.length;
}

// ─── Auto-flush on network reconnect ─────────────────────────────────────────

let _autoFlushRegistered = false;

export function registerAutoFlush(hooks: Hooks = {}): void {
  if (_autoFlushRegistered || typeof window === 'undefined') return;
  _autoFlushRegistered = true;
  window.addEventListener('online', () => {
    if (queue.length > 0) {
      flush(hooks);
    }
  });
}
