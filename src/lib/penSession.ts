/**
 * PenDB session key management.
 *
 * All PenDB encryption uses a per-session PIN derived from the user's
 * password at login time. The PIN is held in memory only — it is never
 * persisted. Logging out clears it back to the legacy default so that
 * existing '1234'-encrypted data (from before this system was introduced)
 * is still readable until a proper key-migration flow is added.
 *
 * Integration points:
 *   - Call setPenPin(password) immediately after a successful login.
 *   - Call clearPenPin() immediately after logout.
 */

let _pin = '1234';

/** Set the active encryption PIN for PenDB operations. Call at login. */
export function setPenPin(pin: string): void {
  if (!pin) return; // Never allow blank key
  _pin = pin;
}

/** Get the current encryption PIN. Used internally by localStore.ts. */
export function getPenPin(): string {
  return _pin;
}

/** Clear the session PIN back to the legacy default. Call at logout. */
export function clearPenPin(): void {
  _pin = '1234';
}
