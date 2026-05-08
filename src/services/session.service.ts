const KEY     = 'digbahi_session_v2';      // persisted across browser restarts
const TAB_KEY = 'digbahi_session_tab_v2'; // cleared when tab closes (no-remember-me)

interface StoredSession {
  token: string;
  expiresAt: string;
}

/**
 * Save a session.
 * persist=true  → localStorage (survives restarts, "remember me")
 * persist=false → sessionStorage (cleared on tab close)
 */
function saveSession(s: StoredSession, persist = true): void {
  if (persist) {
    localStorage.setItem(KEY, JSON.stringify(s));
    sessionStorage.removeItem(TAB_KEY);
  } else {
    sessionStorage.setItem(TAB_KEY, JSON.stringify(s));
    localStorage.removeItem(KEY);
  }
}

/**
 * Load the stored session from either storage tier.
 * Returns null if absent or expired; expired sessions are auto-cleared.
 */
function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY) ?? sessionStorage.getItem(TAB_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredSession;
    if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(KEY);
      sessionStorage.removeItem(TAB_KEY);
      return null;
    }
    return session;
  } catch (_err: unknown) {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(TAB_KEY);
    return null;
  }
}

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000';

export const sessionService = {
  saveSession,
  loadSession,

  async login(pin: string, deviceId: string, username?: string) {
    const res = await fetch(`${API_BASE}/api/v1/session/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, device_id: deviceId, ...(username ? { username } : {}) }),
    });
    if (!res.ok) throw new Error('Session login failed');
    const data = await res.json();
    saveSession({ token: data.session_token, expiresAt: data.expires_at });
    return data;
  },

  async refresh(): Promise<StoredSession | null> {
    const s = loadSession();
    if (!s) return null;
    try {
      const res = await fetch(`${API_BASE}/api/v1/session/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: s.token }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const session: StoredSession = { token: data.session_token, expiresAt: data.expires_at };
      saveSession(session);
      return session;
    } catch (_err: unknown) {
      return null;
    }
  },

  async logout(): Promise<void> {
    const s = loadSession();
    if (!s) return;
    try {
      await fetch(`${API_BASE}/api/v1/session/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_token: s.token }),
      });
    } catch (_err: unknown) {
      // best-effort — always clear local state
    }
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(TAB_KEY);
  },
};

export default sessionService;
