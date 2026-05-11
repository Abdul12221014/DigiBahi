import { db, User } from './db';
import type { LoginAttempt } from './db';
import sessionService from '@/services/session.service';
import type { AuthUser } from '@/contexts/AuthContext';
import { setPenPin, clearPenPin } from './penSession';

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000';

// ─── In-memory session ────────────────────────────────────────────────────────

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

// ─── Device identity ──────────────────────────────────────────────────────────

export function getOrCreateDeviceId(): string {
  const KEY = 'digbahi_device_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

// ─── Password hashing (PBKDF2-SHA256, 600k iterations) ───────────────────────

async function deriveKey(secret: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return Array.from(new Uint8Array(derived))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPassword(password: string): Promise<{ passwordHash: string; passwordSalt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>;
  const passwordHash = await deriveKey(password, salt);
  const passwordSalt = btoa(String.fromCharCode(...salt));
  return { passwordHash, passwordSalt };
}

/** Verify a password against a stored PBKDF2 hash.
 *  Falls back to legacy SHA-256 (no salt) for accounts not yet migrated. */
export async function verifyPassword(
  password: string,
  hash: string,
  salt?: string,
): Promise<boolean> {
  if (!hash) return false;

  if (salt) {
    const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0));
    return (await deriveKey(password, saltBytes)) === hash;
  }

  // Legacy SHA-256 path — single digest, no salt
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  const legacy = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return legacy === hash;
}

// ─── Password strength validation ─────────────────────────────────────────────

const COMMON_PASSWORDS = new Set([
  'password', 'password1', '12345678', '123456789', '1234567890',
  'qwerty123', 'abc12345', 'iloveyou', 'admin123', 'letmein',
  'welcome1', 'monkey123', 'dragon123', 'master123', 'hello123',
]);

export interface PasswordValidation {
  valid: boolean;
  reason?: string;
  strength: 'weak' | 'fair' | 'strong' | 'very-strong';
}

export function validatePasswordStrength(password: string): PasswordValidation {
  if (password.length < 8) {
    return { valid: false, reason: 'Password must be at least 8 characters', strength: 'weak' };
  }
  if (password.length > 128) {
    return { valid: false, reason: 'Password is too long', strength: 'weak' };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { valid: false, reason: 'This password is too common. Choose a stronger one.', strength: 'weak' };
  }
  if (/^(.)\1+$/.test(password)) {
    return { valid: false, reason: 'Password cannot be all the same character', strength: 'weak' };
  }

  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const strength: PasswordValidation['strength'] =
    score >= 5 ? 'very-strong' : score >= 3 ? 'strong' : score >= 2 ? 'fair' : 'weak';

  return { valid: true, strength };
}

// ─── User lookup by identifier (email / phone / username) ─────────────────────

async function findUserByIdentifier(identifier: string): Promise<User | null> {
  const norm = identifier.trim();
  const lc = norm.toLowerCase();

  // Email
  if (lc.includes('@')) {
    const user = await db.users.filter(u => (u.email ?? '').toLowerCase() === lc).first();
    return user ?? null;
  }

  // Phone — 10+ digits, possibly prefixed with + or country code
  const digits = norm.replace(/\D/g, '');
  if (digits.length >= 10 && /^[\d+\-\s()]/.test(norm)) {
    const user = await db.users
      .filter(u => u.phone != null && u.phone.replace(/\D/g, '') === digits)
      .first();
    if (user) return user;
  }

  // Username (case-insensitive)
  const user = await db.users
    .filter(u => u.username.toLowerCase() === lc)
    .first();
  return user ?? null;
}

// ─── Brute-force lockout ──────────────────────────────────────────────────────

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

async function isUserLocked(user: User): Promise<boolean> {
  if (!user.lockedUntil) return false;
  if (new Date(user.lockedUntil).getTime() > Date.now()) return true;
  // Lockout expired — clear it
  if (user.id != null) {
    await db.users.update(user.id, { lockedUntil: null, failedAttempts: 0 });
  }
  return false;
}

async function recordFailedAttempt(
  user: User,
): Promise<{ locked: boolean; lockedUntil?: string; remaining: number }> {
  const attempts = (user.failedAttempts ?? 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();
    if (user.id != null) await db.users.update(user.id, { failedAttempts: attempts, lockedUntil });
    return { locked: true, lockedUntil, remaining: 0 };
  }
  if (user.id != null) await db.users.update(user.id, { failedAttempts: attempts });
  return { locked: false, remaining: MAX_ATTEMPTS - attempts };
}

async function clearFailedAttempts(user: User): Promise<void> {
  if (user.id == null) return;
  await db.users.update(user.id, {
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: new Date().toISOString(),
  });
}

// ─── Login attempt recording (audit trail) ───────────────────────────────────

async function recordAttempt(attempt: Omit<LoginAttempt, 'id'>): Promise<void> {
  try {
    await db.loginAttempts.add(attempt);
  } catch {
    // Non-fatal — audit logging must never block auth
  }
}

// ─── Login result types ───────────────────────────────────────────────────────

export type LoginResult =
  | { ok: true; user: AuthUser }
  | { ok: false; locked: true; lockedUntil: string }
  | { ok: false; locked: false; remainingAttempts?: number };

// Failure variants are shared with LoginResult so narrowing is directly assignable.
type LocalAuthResult = { ok: true; user: User } | Exclude<LoginResult, { ok: true }>;

// ─── Local authentication ─────────────────────────────────────────────────────

async function authenticateLocally(
  identifier: string,
  password: string,
): Promise<LocalAuthResult> {
  const user = await findUserByIdentifier(identifier);
  const deviceId = getOrCreateDeviceId();

  if (!user) {
    await recordAttempt({
      identifier,
      success: false,
      timestamp: new Date().toISOString(),
      source: 'offline',
      deviceId,
      failureReason: 'user_not_found',
    });
    return { ok: false, locked: false };
  }

  if (!user.isActive) {
    await recordAttempt({
      userId: user.id,
      identifier,
      success: false,
      timestamp: new Date().toISOString(),
      source: 'offline',
      deviceId,
      failureReason: 'account_locked',
    });
    return { ok: false, locked: false };
  }

  if (await isUserLocked(user)) {
    await recordAttempt({
      userId: user.id,
      identifier,
      success: false,
      timestamp: new Date().toISOString(),
      source: 'offline',
      deviceId,
      failureReason: 'account_locked',
    });
    return { ok: false, locked: true, lockedUntil: user.lockedUntil! };
  }

  const isValid = await verifyPassword(password, user.passwordHash, user.passwordSalt || undefined);

  if (!isValid) {
    const failInfo = await recordFailedAttempt(user);
    await recordAttempt({
      userId: user.id,
      identifier,
      success: false,
      timestamp: new Date().toISOString(),
      source: 'offline',
      deviceId,
      failureReason: 'wrong_password',
    });
    if (failInfo.locked) {
      return { ok: false, locked: true, lockedUntil: failInfo.lockedUntil! };
    }
    return { ok: false, locked: false, remainingAttempts: failInfo.remaining };
  }

  await clearFailedAttempts(user);
  await recordAttempt({
    userId: user.id,
    identifier,
    success: true,
    timestamp: new Date().toISOString(),
    source: 'offline',
    deviceId,
  });

  if (!user.passwordSalt && user.id != null) {
    const { passwordHash, passwordSalt } = await hashPassword(password);
    await db.users.update(user.id, { passwordHash, passwordSalt, mustResetPassword: false });
    user.passwordSalt = passwordSalt;
    user.passwordHash = passwordHash;
  }

  return { ok: true, user };
}

// ─── Unified login: backend first, local offline fallback ─────────────────────

export async function login(
  identifier: string,
  password: string,
  options?: { rememberMe?: boolean },
): Promise<LoginResult> {
  const deviceId = getOrCreateDeviceId();
  const persist = options?.rememberMe !== false;

  // 1. Try backend
  try {
    const res = await fetch(`${API_BASE}/api/v1/session/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier,
        password,
        pin: password,        // backward compat for older backend versions
        username: identifier, // backward compat
        device_id: deviceId,
      }),
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data = await res.json();
      const authUser: AuthUser = {
        id: data.user_id,
        username: data.username ?? identifier,
        displayName: data.display_name,
        role: data.role ?? 'employee',
        sessionToken: data.session_token,
        mustResetPassword: data.must_reset_password ?? false,
        source: 'backend',
      };
      sessionService.saveSession({ token: data.session_token, expiresAt: data.expires_at }, persist);
      setCurrentUser({ ...authUser, passwordHash: '', passwordSalt: '', isActive: true, createdAt: new Date() });
      setPenPin(password);
      return { ok: true, user: authUser };
    }

    // 423: backend-enforced account lock — hard stop, don't bypass with local auth.
    if (res.status === 423) {
      let lockedUntil: string;
      try {
        const body = await res.json();
        lockedUntil = body.locked_until ?? new Date(Date.now() + LOCKOUT_MS).toISOString();
      } catch {
        lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();
      }
      return { ok: false, locked: true, lockedUntil };
    }

    // 429: backend-enforced rate limiting — hard stop, don't bypass with local auth.
    if (res.status === 429) return { ok: false, locked: false };

    // Everything else (401, 403, 422, 5xx, etc.): fall through to local IndexedDB auth.
    // Rationale: the backend has its own separate User table (device_id + pin_hash) that
    // is NOT the same as the IndexedDB user store. A backend 401/422 almost always means
    // "this device has no backend account", NOT "wrong password". Local auth is the source
    // of truth for this offline-first app.
  } catch {
    // Network unreachable — fall through to local
  }

  // 2. Offline fallback
  const result = await authenticateLocally(identifier, password);
  if (!result.ok) return result as Exclude<LoginResult, { ok: true }>;

  const localToken = `local-${crypto.randomUUID()}`;
  const authUser: AuthUser = {
    id: result.user.id,
    username: result.user.username,
    displayName: result.user.displayName,
    role: result.user.role,
    sessionToken: localToken,
    mustResetPassword: result.user.mustResetPassword ?? false,
    source: 'offline',
  };
  setCurrentUser({ ...result.user, sessionToken: localToken });
  setPenPin(password);
  return { ok: true, user: authUser };
}

// ─── Password reset (local — owner-initiated for employees) ──────────────────

export async function resetUserPassword(userId: number, newPassword: string): Promise<void> {
  const { passwordHash, passwordSalt } = await hashPassword(newPassword);
  await db.users.update(userId, {
    passwordHash,
    passwordSalt,
    mustResetPassword: false,
    pinHash: undefined,
    pinSalt: undefined,
    failedAttempts: 0,
    lockedUntil: null,
  });
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout(): Promise<void> {
  await sessionService.logout().catch(() => {});
  setCurrentUser(null);
  clearPenPin();
}

// ─── Legacy compat (kept for sync.service.ts) ─────────────────────────────────

/** @deprecated Use `login()` instead. */
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

/** @deprecated Use `hashPassword()` instead. */
export const hashPinWithSalt = hashPassword;

/** @deprecated Use `verifyPassword()` instead. */
export const verifyPin = verifyPassword;

/** @deprecated Use `validatePasswordStrength()` instead. */
export { validatePasswordStrength as validatePinStrength };
export type { PasswordValidation as PinValidation };
export type { User };
