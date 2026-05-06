const KEY = 'digbahi_session_v2';

interface StoredSession {
  token: string;
  expiresAt: string;
}

function saveSession(s: StoredSession): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
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
    } catch {
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
    } catch {
      // best-effort — always clear local state
    }
    localStorage.removeItem(KEY);
  },
};

export default sessionService;
