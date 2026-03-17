import { encryptObject, decryptObject } from '@/lib/localStore';

const KEY = 'digbahi_session_v1';

async function saveSession(session: { token: string; expiresAt: string }) {
  const store = await encryptObject(session, '1234');
  localStorage.setItem(KEY, JSON.stringify({
    payload: Array.from(new Uint8Array(store.payload)),
    iv: Array.from(new Uint8Array(store.iv)),
    salt: Array.from(new Uint8Array(store.salt)),
  }));
}

async function loadSession(): Promise<{ token: string; expiresAt: string } | null> {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  const toBuf = (arr: number[]) => new Uint8Array(arr).buffer;
  try {
    return await decryptObject(toBuf(parsed.payload), toBuf(parsed.iv), toBuf(parsed.salt), '1234');
  } catch { return null; }
}

export const sessionService = {
  async login(pin: string, deviceId: string) {
    const res = await fetch('/api/v1/session/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, device_id: deviceId }) });
    if (!res.ok) throw new Error('Session login failed');
    const data = await res.json();
    await saveSession({ token: data.session_token, expiresAt: data.expires_at });
    return data;
  },
  async refresh() {
    const s = await loadSession(); if (!s) return null;
    const res = await fetch('/api/v1/session/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: s.token }) });
    if (!res.ok) return null;
    const data = await res.json();
    await saveSession({ token: data.session_token, expiresAt: data.expires_at });
    return data;
  },
  async logout() {
    const s = await loadSession(); if (!s) return;
    await fetch('/api/v1/session/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_token: s.token }) });
    localStorage.removeItem(KEY);
  },
  loadSession,
};

export default sessionService;


