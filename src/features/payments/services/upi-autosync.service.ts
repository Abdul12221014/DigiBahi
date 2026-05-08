import { ENABLE_UPI_AUTOSYNC } from '../constants/upi-flags';
import { updateUPIIntentStatus } from '@/lib/db';

type UpiUpdate = { txnRef: string; status: string };

const AUTOSYNC_PATH = '/api/v1/upi/sync';  // short, clean endpoint
const AUTOSYNC_INTERVAL_MS = 60_000;       // 1 minute
let autosyncTimer: number | null = null;

function devLog(...args: unknown[]) {
  if (import.meta.env.DEV) console.log('[UPI_AUTOSYNC]', ...args);
}

async function fetchWithTimeout(url: string, opts: RequestInit & { timeout?: number } = {}) {
  const { timeout = 10_000, ...init } = opts;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { 
      ...init, 
      signal: ctrl.signal, 
      headers: { 
        'Content-Type': 'application/json', 
        ...(init.headers || {}) 
      } 
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

export async function startUPIAutoSyncOnce(): Promise<void> {
  if (!ENABLE_UPI_AUTOSYNC) return;
  if (!navigator.onLine) return;

  try {
    const res = await fetchWithTimeout(AUTOSYNC_PATH, { timeout: 10_000, method: 'GET' });
    if (!res.ok) {
      devLog('HTTP error', res.status, res.statusText);
      return;
    }
    const data = await res.json();

    if (!Array.isArray(data)) {
      devLog('Invalid payload (not array), ignoring:', data);
      return;
    }

    let processed = 0;
    for (const upd of data as UpiUpdate[]) {
      if (!upd || typeof upd.txnRef !== 'string' || !upd.txnRef || typeof upd.status !== 'string' || !upd.status) {
        devLog('Skipping invalid update record:', upd);
        continue;
      }
      await updateUPIIntentStatus(upd.txnRef, upd.status);
      processed++;
    }
    devLog('Reconciled', processed, 'transactions');
  } catch (err) {
    devLog('Fetch failed (ignored):', err instanceof Error ? err.message : String(err));
  }
}

export function scheduleUPIAutoSync(intervalMs = AUTOSYNC_INTERVAL_MS): void {
  if (!ENABLE_UPI_AUTOSYNC) return;

  const runIfOnline = () => {
    if (navigator.onLine) void startUPIAutoSyncOnce();
  };

  // initial
  runIfOnline();

  // interval
  if (autosyncTimer) window.clearInterval(autosyncTimer);
  autosyncTimer = window.setInterval(runIfOnline, intervalMs);

  // resume on network back
  window.addEventListener('online', runIfOnline);

  // run when tab becomes visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') runIfOnline();
  });
}

export function stopUPIAutoSync(): void {
  if (autosyncTimer) {
    window.clearInterval(autosyncTimer);
    autosyncTimer = null;
  }
}
