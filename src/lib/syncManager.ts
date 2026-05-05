/**
 * Sync Manager (Phase 7: Hybrid Architecture Prep)
 * ─────────────────────────────────────────────────
 * Handles background syncing of offline-first Dexie records to Render backend.
 * Triggers on 'online' event or manual flush.
 */

import { db, CustomerContact } from './db';
import { analytics } from './analytics';

export interface SyncableRecord {
  id?: number;
  created_at: string;
  updated_at: string;
  synced_at?: string | null;
  remote_id?: string | null;
}

export class SyncManager {
  private endpoint: string;
  private isSyncing = false;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  /**
   * Main sync trigger. Runs sequentially to avoid overlaps.
   */
  async syncAll(): Promise<void> {
    if (!navigator.onLine || this.isSyncing) return;

    this.isSyncing = true;
    try {
      await Promise.all([
        this.syncPendingContacts(),
        this.syncAnalyticsEvents(),
      ]);
      // In the future: this.syncPendingLedgerEntries(), etc.
    } catch (err) {
      console.warn('[SyncManager] Sync failed:', err);
    } finally {
      this.isSyncing = false;
    }
  }

  // ─── Contacts Sync ──────────────────────────────────────────────────────────

  private async syncPendingContacts(): Promise<void> {
    // Contacts where synced_at is null
    const pending = await db.customerContacts
      .filter(c => !c.synced_at)
      .toArray();

    if (!pending.length) return;

    for (const c of pending) {
      try {
        const res = await fetch(`${this.endpoint}/contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(c),
        });

        if (res.ok) {
          const { id: remote_id } = await res.json();
          await db.customerContacts.update(c.id!, {
            synced_at: new Date().toISOString(),
            remote_id,
          });
        }
      } catch {
        // Skip current contact if network fails, continue loop
      }
    }
  }

  // ─── Analytics Sync ─────────────────────────────────────────────────────────

  private async syncAnalyticsEvents(): Promise<void> {
    await analytics.flush(`${this.endpoint}/analytics`);
  }
}

// ─── Singleton & Listeners ────────────────────────────────────────────────────

export const syncManager = new SyncManager(
  import.meta.env.VITE_API_URL || 'http://localhost:8000'
);

// Auto-sync when device comes online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncManager.syncAll();
  });
}
