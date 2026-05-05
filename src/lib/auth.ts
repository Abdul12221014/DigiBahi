import { db, User } from './db';

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000';

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

export async function authenticateUser(username: string, pin: string): Promise<User | null> {
  const user = await db.users.where('username').equals(username).first();
  if (!user) return null;
  const isValid = await verifyPin(pin, user.pinHash);
  return isValid ? user : null;
}

/**
 * Log in via the backend session API and store the session token.
 * Falls back to local Dexie auth when the backend is unreachable.
 */
export async function loginWithBackend(
  pin: string,
  deviceId: string,
): Promise<{ user: User; sessionToken: string } | null> {
  try {
    const params = new URLSearchParams({ pin, device_id: deviceId });
    const res = await fetch(`${API_BASE}/api/v1/session/login?${params}`, {
      method: 'POST',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { user: { id: data.user_id } as User, sessionToken: data.session_token };
  } catch {
    return null;
  }
}

export function getCurrentUser(): (User & { sessionToken?: string }) | null {
  const userJson = sessionStorage.getItem('currentUser');
  return userJson ? JSON.parse(userJson) : null;
}

export function setCurrentUser(user: User & { sessionToken?: string }): void {
  sessionStorage.setItem('currentUser', JSON.stringify(user));
}

export function getSessionToken(): string | null {
  return getCurrentUser()?.sessionToken ?? null;
}

export function logout(): void {
  sessionStorage.removeItem('currentUser');
}
