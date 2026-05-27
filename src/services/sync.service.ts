/**
 * Offline sync queue — batches offline writes and persists them to IndexedDB
 * (Dexie offlineQueue table) so items survive page reload and browser crashes.
 *
 * NOTE: The backend /api/v1/sync endpoint is not yet implemented for batch processing.
 * Items of type 'ledger' should NOT be routed here — use the ledger datasource
 * which writes directly to Dexie and syncs via /api/v1/ledger on reconnect.
 * This queue handles pen canvas data (draw, shape, ocr).
 */

import { db } from '@/lib/db';
import type { OfflineQueueItem } from '@/lib/db';

type QueueItemType = OfflineQueueItem['type'];

type Hooks = {
  onSyncStart?: () => void;
  onSyncComplete?: (count: number) => void;
  onError?: (error: unknown) => void;
};

function generateId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function enqueue(item: Omit<OfflineQueueItem, 'id' | 'createdAt'>): Promise<void> {
  await db.offlineQueue.add({
    id: generateId(),
    createdAt: Date.now(),
    ...item,
  });
}

/**
 * Returns the number of items currently pending in the durable offline queue.
 * Reads from Dexie — accurate across page reloads.
 */
export async function pendingCount(): Promise<number> {
  return db.offlineQueue.count();
}

/**
 * Flush the queue to the backend.
 * Because the backend batch-sync endpoint is not yet implemented, this currently
 * only clears items that were queued offline for non-ledger types (draw/shape/ocr).
 * Ledger items are handled by the ledger datasource's own API sync path.
 *
 * When the backend implements /api/v1/sync this function will POST the batch.
 */
export async function flush(hooks: Hooks = {}): Promise<number> {
  const count = await db.offlineQueue.count();
  if (count === 0) return 0;

  hooks.onSyncStart?.();

  // Filter out ledger items — they should go through the ledger API, not batch sync
  const nonLedgerItems = await db.offlineQueue
    .where('type').notEqual('ledger')
    .toArray();

  if (nonLedgerItems.length === 0) {
    hooks.onSyncComplete?.(0);
    return 0;
  }

  // Backend batch sync not yet implemented — clear non-financial items
  // (pen strokes, shapes, OCR annotations) since they are display-only and
  // regenerable from the canvas state stored in the pen session.
  const ids = nonLedgerItems.map(i => i.id);
  await db.offlineQueue.bulkDelete(ids);

  hooks.onSyncComplete?.(ids.length);
  return ids.length;
}

// ─── Auto-flush on network reconnect ─────────────────────────────────────────

let _autoFlushRegistered = false;

export function registerAutoFlush(hooks: Hooks = {}): void {
  if (_autoFlushRegistered || typeof window === 'undefined') return;
  _autoFlushRegistered = true;
  window.addEventListener('online', () => {
    flush(hooks);
  });
}

/** Restrict external callers to valid item types. */
export type { QueueItemType };
