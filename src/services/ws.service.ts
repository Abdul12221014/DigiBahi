import { getWebSocketUrl, getApiBaseUrl } from '@/lib/api-config';

let socket: WebSocket | null = null;
const listeners: Array<(msg: any) => void> = [];

// Exponential backoff config (stops spamming console on Render Free tier cold-starts)
let retryCount = 0;
const MAX_RETRY_DELAY_MS = 60_000; // cap at 60 seconds
const BASE_RETRY_DELAY_MS = 3_000; // start at 3 seconds

function getRetryDelay(): number {
  // Exponential backoff: 3s, 6s, 12s, 24s, 48s, 60s, 60s, ...
  const delay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retryCount), MAX_RETRY_DELAY_MS);
  retryCount++;
  return delay;
}

/**
 * Ping the backend HTTP health endpoint to wake it up (Render Free tier "cold start").
 * The WebSocket handshake will fail until the backend is awake.
 */
async function wakeupBackend(): Promise<void> {
  try {
    const url = `${getApiBaseUrl()}/api/v1/health`;
    await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
  } catch {
    // Ignore — wakeup is best-effort
  }
}

export function connectWS() {
  try {
    socket = new WebSocket(getWebSocketUrl());

    socket.onopen = () => {
      // Connected successfully — reset retry backoff
      retryCount = 0;
    };

    socket.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        listeners.forEach(l => l(data));
      } catch {
        // Invalid JSON — skip
      }
    };

    socket.onclose = () => {
      socket = null;
      const delay = getRetryDelay();
      setTimeout(connectWS, delay);
    };

    socket.onerror = () => {
      // onerror fires before onclose — let onclose handle the retry
      // No console.error here to avoid redundant noise
    };
  } catch {
    const delay = getRetryDelay();
    setTimeout(connectWS, delay);
  }
}

/**
 * Start the WebSocket connection.
 * Warms up the Render Free tier backend first, then connects.
 */
export function initWS() {
  wakeupBackend().then(() => connectWS());
}

export function onWSMessage(fn: (msg: any) => void) {
  listeners.push(fn);
}

export function offWSMessage(fn: (msg: any) => void) {
  const idx = listeners.indexOf(fn);
  if (idx !== -1) listeners.splice(idx, 1);
}

export default { connectWS, initWS, onWSMessage, offWSMessage };
