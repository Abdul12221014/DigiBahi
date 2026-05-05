/**
 * DigiBahi Analytics Service
 * ─────────────────────────
 * Tracks key user events locally (Dexie) with zero performance impact.
 * Events are stored offline-first and flushed to backend when available.
 *
 * Usage:
 *   analytics.track('invoice_share_clicked', { entry_type: 'sale' });
 */

import { db } from './db';

// ─── Event Name Union ─────────────────────────────────────────────────────────

export type AnalyticsEventName =
  | 'invoice_share_clicked'
  | 'invoice_share_success'
  | 'invoice_share_failed'
  | 'invoice_share_retry'
  | 'invoice_share_cancelled'
  | 'phone_number_added'
  | 'whatsapp_fallback_used'
  | 'pdf_download_fallback'
  | 'otp_requested'
  | 'otp_verified'
  | 'otp_failed'
  | 'otp_expired'
  | 'ocr_scan_started'
  | 'ocr_scan_completed'
  | 'ocr_autofill_accepted'
  | 'entry_created'
  | 'entry_updated'
  | 'entry_deleted'
  | 'contact_matched'
  | 'contact_created';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnalyticsEvent {
  id?: number;
  name: AnalyticsEventName;
  properties?: Record<string, unknown>;
  timestamp: string;
  synced: number;       // 0 = pending, 1 = synced (Dexie indexed)
  session_id: string;
}

// ─── Session ID ───────────────────────────────────────────────────────────────

// Persists for the duration of the browser tab
let _sessionId: string;
function getSessionId(): string {
  if (!_sessionId) {
    _sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
  return _sessionId;
}

// ─── Core Service ─────────────────────────────────────────────────────────────

export const analytics = {
  /**
   * Track an event. Fire-and-forget — never throws, never blocks UI.
   */
  track(name: AnalyticsEventName, properties?: Record<string, unknown>): void {
    const event: AnalyticsEvent = {
      name,
      properties,
      timestamp: new Date().toISOString(),
      synced: 0,
      session_id: getSessionId(),
    };

    // Non-blocking write to Dexie
    db.analyticsEvents?.add(event).catch(() => {
      // Table may not exist yet during migration — silently ignore
    });

    // Dev console logging
    if (import.meta.env.DEV) {
      console.log(
        `%c[Analytics] ${name}`,
        'color:#7c3aed;font-weight:bold',
        properties ?? '',
      );
    }
  },

  /**
   * Flush pending events to backend.
   * Call periodically or on visibility change.
   */
  async flush(endpoint: string): Promise<void> {
    try {
      const unsynced = await db.analyticsEvents
        ?.where('synced').equals(0)
        .limit(100)
        .toArray();

      if (!unsynced?.length) return;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unsynced),
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const ids = unsynced.map(e => e.id!).filter(id => id !== undefined);
        await db.analyticsEvents?.where('id').anyOf(ids).modify({ synced: 1 });
      }
    } catch {
      // Silent fail — will retry on next flush
    }
  },

  /**
   * Prune old synced events to keep the table lean.
   * Deletes events synced more than 30 days ago.
   */
  async prune(): Promise<void> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = cutoff.toISOString();

      await db.analyticsEvents
        ?.where('synced').equals(1)
        .and(e => e.timestamp < cutoffStr)
        .delete();
    } catch {
      // Silently ignore
    }
  },

  /**
   * Get total unsynced event count (for debug/status UI).
   */
  async pendingCount(): Promise<number> {
    return (await db.analyticsEvents?.where('synced').equals(0).count()) ?? 0;
  },
};
