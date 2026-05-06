import { db, User } from './db';
import sessionService from '@/services/session.service';
import type { AuthUser } from '@/contexts/AuthContext';

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000';

// ─── In-memory session (kiosk: always requires PIN on page load) ───────────

let _currentUser: (User & { sessionToken?: string }) | null = null;

export function getCurrentUser(): (User & { sessionToken?: string }) | null {
  return _currentUser;
}

export function setCurrentUser(user: (User & { sessionToken?: string }) | null): void {
  _currentUser = user;
}

export function getSessionToken(): string | null {
  return _currentUser?.sessionToken ?? null;
}

// ─── PIN hashing ──────────────────────────────────────────────────────────

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return (await hashPin(pin)) === hash;
}

// ─── Local Dexie authentication ───────────────────────────────────────────

export async function authenticateUser(username: string, pin: string): Promise<User | null> {
  const user = await db.users.where('username').equals(username).first();
  if (!user) return null;
  const isValid = await verifyPin(pin, user.pinHash);
  return isValid ? user : null;
}

// ─── Unified login: backend first, local fallback ─────────────────────────

export async function login(username: string, pin: string): Promise<AuthUser | null> {
  const deviceId = getOrCreateDeviceId();

  // 1. Try backend
  try {
    const res = await fetch(`${API_BASE}/api/v1/session/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, device_id: deviceId, username }),
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      const authUser: AuthUser = {
        id: data.user_id,
        username: data.username ?? username,
        role: data.role ?? 'employee',
        sessionToken: data.session_token,
        source: 'backend',
      };
      sessionService.saveSession({ token: data.session_token, expiresAt: data.expires_at });
      setCurrentUser({ ...authUser, pinHash: '', createdAt: new Date() });
      return authUser;
    }
    if (res.status === 401 || res.status === 423) return null; // wrong PIN or locked
  } catch {
    // Network unreachable — fall through to local
  }

  // 2. Offline fallback: validate PIN against Dexie
  const user = await authenticateUser(username, pin);
  if (!user) return null;

  const localToken = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const authUser: AuthUser = {
    id: user.id,
    username: user.username,
    role: user.role,
    sessionToken: localToken,
    source: 'offline',
  };
  setCurrentUser({ ...user, sessionToken: localToken });
  return authUser;
}

// ─── Legacy backend-only login (kept for sync.service.ts compat) ──────────

export async function loginWithBackend(
  pin: string,
  deviceId: string,
  username?: string,
): Promise<{ user: User; sessionToken: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/session/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, device_id: deviceId, ...(username ? { username } : {}) }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { user: { id: data.user_id } as User, sessionToken: data.session_token };
  } catch {
    return null;
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────

export async function logout(): Promise<void> {
  await sessionService.logout().catch(() => {});
  setCurrentUser(null);
}

// ─── Device ID ────────────────────────────────────────────────────────────

function getOrCreateDeviceId(): string {
  const DEVICE_KEY = 'digbahi_device_id';
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
