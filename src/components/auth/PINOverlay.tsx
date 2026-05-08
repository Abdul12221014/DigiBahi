import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NumericKeypad } from './NumericKeypad';
import { useAuth } from '@/contexts/AuthContext';
import { db, CompanySettings } from '@/lib/db';
import { WifiOff, Loader2 } from 'lucide-react';
import useOnline from '@/hooks/useOnline';

const MAX_PIN_LENGTH = 6;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

/** localStorage key for persisting lockout state across refreshes. */
const LOCKOUT_KEY = 'digbahi_pin_lockout';

type PinState = 'idle' | 'submitting' | 'error' | 'success' | 'locked';

interface UserRecord { username: string; role: string; }

// ── Persisted lockout helpers ────────────────────────────────────────────────

interface LockoutData {
  lockoutEnd: number;
  attempts: number;
}

function loadLockout(): LockoutData | null {
  try {
    const raw = localStorage.getItem(LOCKOUT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as LockoutData;
    // If lockout has expired, clear it
    if (data.lockoutEnd && data.lockoutEnd < Date.now()) {
      localStorage.removeItem(LOCKOUT_KEY);
      return null;
    }
    return data;
  } catch {
    localStorage.removeItem(LOCKOUT_KEY);
    return null;
  }
}

function saveLockout(data: LockoutData): void {
  localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data));
}

function clearLockout(): void {
  localStorage.removeItem(LOCKOUT_KEY);
}

// ── Clock ────────────────────────────────────────────────────────────────────

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return { timeStr, dateStr };
}

// ── Main component ───────────────────────────────────────────────────────────

export function PINOverlay() {
  const { login } = useAuth();
  const online = useOnline();
  const { timeStr, dateStr } = useClock();

  // State
  const [pin, setPin] = useState('');
  const [pinState, setPinState] = useState<PinState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [shake, setShake] = useState(false);
  const [lockoutEnd, setLockoutEnd] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [activeUserIdx, setActiveUserIdx] = useState(0);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [dbError, setDbError] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Refs to avoid stale closure in submitPin
  const attemptsRef = useRef(0);
  const usernameRef = useRef('owner');
  const pinStateRef = useRef<PinState>('idle');
  pinStateRef.current = pinState;
  usernameRef.current = users[activeUserIdx]?.username ?? 'owner';

  // Entrance animation
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Restore lockout from localStorage on mount
  useEffect(() => {
    const saved = loadLockout();
    if (saved) {
      attemptsRef.current = saved.attempts;
      if (saved.lockoutEnd > Date.now()) {
        setLockoutEnd(saved.lockoutEnd);
        setPinState('locked');
      } else {
        attemptsRef.current = 0;
        clearLockout();
      }
    }
  }, []);

  // Load users + company
  useEffect(() => {
    Promise.all([
      db.users.toArray(),
      db.companySettings.toArray(),
    ]).then(([us, settings]) => {
      setUsers(us.map(u => ({ username: u.username, role: u.role })));
      if (settings.length > 0) setCompany(settings[0]);
    }).catch(() => {
      setDbError(true);
    });
  }, []);

  // Lockout countdown
  useEffect(() => {
    if (!lockoutEnd) return;
    let rafId: number;
    const tick = () => {
      const rem = Math.ceil((lockoutEnd - Date.now()) / 1000);
      if (rem <= 0) {
        setPinState('idle');
        setLockoutEnd(null);
        attemptsRef.current = 0;
        setCountdown(0);
        clearLockout();
      } else {
        setCountdown(rem);
        rafId = window.setTimeout(tick, 1000) as unknown as number;
      }
    };
    tick();
    return () => window.clearTimeout(rafId);
  }, [lockoutEnd]);

  // Physical keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (pinStateRef.current === 'locked' || pinStateRef.current === 'submitting' || pinStateRef.current === 'success') return;
      if (/^\d$/.test(e.key)) appendDigit(e.key);
      else if (e.key === 'Backspace') deleteDigit();
      else if (e.key === 'Enter') triggerSubmit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus trap: prevent tabbing out of overlay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        // Keep focus within the overlay
        const overlay = document.getElementById('pin-overlay');
        if (!overlay) return;
        const focusable = overlay.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) { e.preventDefault(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── PIN manipulation ──────────────────────────────────────────────────────

  const appendDigit = useCallback((digit: string) => {
    setPin(prev => {
      const next = prev + digit;
      if (next.length >= MAX_PIN_LENGTH) {
        // 80ms delay so user sees final dot before submit
        setTimeout(() => submitPin(next), 80);
        return next;
      }
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteDigit = useCallback(() => {
    if (pinStateRef.current === 'error') setPinState('idle');
    setErrorMsg('');
    setPin(prev => prev.slice(0, -1));
  }, []);

  const triggerSubmit = useCallback(() => {
    setPin(prev => { submitPin(prev); return prev; });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submitPin = async (pinValue: string) => {
    if (!pinValue || pinStateRef.current === 'submitting' || pinStateRef.current === 'locked' || pinStateRef.current === 'success') return;
    setPinState('submitting');
    setErrorMsg('');

    const ok = await login(usernameRef.current, pinValue);

    // Clear PIN from memory immediately
    setPin('');

    if (ok) {
      setPinState('success');
      // Brief green success flash, then auth context removes overlay
      setTimeout(() => {
        setPinState('idle');
      }, 600);
      return;
    }

    attemptsRef.current += 1;
    setShake(true);
    setTimeout(() => setShake(false), 500);

    if (attemptsRef.current >= MAX_ATTEMPTS) {
      const end = Date.now() + LOCKOUT_MS;
      setLockoutEnd(end);
      setPinState('locked');
      setErrorMsg('');
      saveLockout({ lockoutEnd: end, attempts: attemptsRef.current });
    } else {
      const left = MAX_ATTEMPTS - attemptsRef.current;
      setPinState('error');
      setErrorMsg(`Incorrect PIN — ${left} attempt${left !== 1 ? 's' : ''} remaining`);
      // Persist attempts so refresh doesn't reset counter
      saveLockout({ lockoutEnd: 0, attempts: attemptsRef.current });
    }
  };

  // ── Derived display values ────────────────────────────────────────────────

  const businessName = company?.businessName ?? 'DigiBahi';
  const businessInitial = businessName.charAt(0).toUpperCase();
  const currentUser = users[activeUserIdx];
  const roleLabel = currentUser?.role
    ? currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)
    : 'Owner';

  const isSuccess = pinState === 'success';
  const isLocked = pinState === 'locked';
  const isSubmitting = pinState === 'submitting';

  // ── DB Error fallback ─────────────────────────────────────────────────────

  if (dbError) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(3, 7, 18, 0.95)' }}
      >
        <div className="text-center p-8">
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ color: '#f8fafc', fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
            Database Unavailable
          </h2>
          <p style={{ color: 'rgba(148,163,184,0.8)', fontSize: '14px', marginBottom: '24px', maxWidth: '320px' }}>
            Could not load user data. This may happen if storage is full or corrupted.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#065f46',
              color: '#ecfdf5',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 24px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      id="pin-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="PIN unlock screen"
      className={mounted ? 'animate-overlay-enter' : ''}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(3, 7, 18, 0.88)',
        backdropFilter: 'blur(32px) saturate(0.4)',
        WebkitBackdropFilter: 'blur(32px) saturate(0.4)',
        opacity: mounted ? 1 : 0,
        transition: 'opacity 0.4s ease',
      }}
    >
      <div
        className="flex flex-col items-center"
        style={{
          width: '100%',
          maxWidth: '360px',
          padding: '0 20px',
          gap: 0,
        }}
      >
        {/* Clock */}
        <div className="text-center mb-5">
          <div
            style={{
              fontSize: '42px',
              fontWeight: 700,
              color: '#f8fafc',
              lineHeight: 1,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {timeStr}
          </div>
          <div
            style={{
              fontSize: '13px',
              color: 'rgba(148,163,184,0.7)',
              marginTop: '4px',
              letterSpacing: '0.02em',
            }}
          >
            {dateStr}
          </div>
        </div>

        {/* Business identity card */}
        <div
          className="flex items-center gap-3 mb-6 w-full"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '14px',
            padding: '12px 16px',
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #065f46, #047857)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(5,150,105,0.3)',
            }}
          >
            <span style={{ fontSize: '20px', fontWeight: 700, color: '#ecfdf5' }}>
              {businessInitial}
            </span>
          </div>

          <div className="flex flex-col" style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: '#f1f5f9',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {businessName}
            </span>
            <span style={{ fontSize: '12px', color: 'rgba(148,163,184,0.8)', marginTop: '1px' }}>
              {currentUser?.username ?? 'Owner'} · {roleLabel}
            </span>
          </div>

          {/* User switcher — only when multiple users */}
          {users.length > 1 && (
            <button
              onClick={() => {
                setActiveUserIdx(i => (i + 1) % users.length);
                setPin('');
                setPinState('idle');
                setErrorMsg('');
              }}
              aria-label="Switch user"
              style={{
                fontSize: '11px',
                color: 'rgba(52,211,153,0.8)',
                background: 'rgba(16,185,129,0.1)',
                border: '1px solid rgba(16,185,129,0.2)',
                borderRadius: '6px',
                padding: '4px 8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Switch
            </button>
          )}
        </div>

        {/* PIN dots */}
        <div
          className={shake ? 'animate-shake' : ''}
          role="status"
          aria-label={`PIN entered: ${pin.length} of ${MAX_PIN_LENGTH} digits`}
          style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}
        >
          {Array.from({ length: MAX_PIN_LENGTH }).map((_, i) => {
            const filled = i < pin.length;
            const isSuccessDot = isSuccess && filled;
            return (
              <div
                key={i}
                className={
                  isSuccessDot
                    ? 'animate-dot-success'
                    : filled
                      ? 'animate-dot-fill'
                      : ''
                }
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  border: `2px solid ${
                    isSuccessDot
                      ? '#10b981'
                      : filled
                        ? '#f1f5f9'
                        : 'rgba(148,163,184,0.3)'
                  }`,
                  background: isSuccessDot
                    ? '#10b981'
                    : filled
                      ? '#f1f5f9'
                      : 'transparent',
                  transform: filled ? 'scale(1.15)' : 'scale(1)',
                  boxShadow: isSuccessDot ? '0 0 8px rgba(16,185,129,0.6)' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              />
            );
          })}
        </div>

        {/* Status line */}
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          style={{ height: '24px', marginBottom: '18px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {isLocked ? (
            <span style={{ fontSize: '13px', color: '#f87171', fontWeight: 500 }}>
              🔒 Locked — {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
            </span>
          ) : errorMsg ? (
            <span style={{ fontSize: '13px', color: '#fca5a5' }}>{errorMsg}</span>
          ) : isSubmitting ? (
            <span style={{ fontSize: '13px', color: 'rgba(148,163,184,0.7)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Loader2 className="animate-spin-slow" style={{ width: '14px', height: '14px' }} />
              Verifying…
            </span>
          ) : isSuccess ? (
            <span style={{ fontSize: '13px', color: '#10b981', fontWeight: 500 }}>
              ✓ Unlocked
            </span>
          ) : (
            <span style={{ fontSize: '13px', color: 'rgba(100,116,139,0.8)' }}>
              Enter PIN to unlock
            </span>
          )}
        </div>

        {/* Keypad */}
        <NumericKeypad
          onDigit={appendDigit}
          onDelete={deleteDigit}
          onSubmit={triggerSubmit}
          disabled={isSubmitting || isLocked || isSuccess}
          showSubmit={pin.length >= 4 && pin.length < MAX_PIN_LENGTH}
        />

        {/* Bottom status bar */}
        <div
          style={{
            marginTop: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: 'rgba(100,116,139,0.7)',
          }}
        >
          {online ? (
            <>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 6px rgba(16,185,129,0.5)',
                  flexShrink: 0,
                }}
              />
              <span>System online</span>
            </>
          ) : (
            <>
              <WifiOff style={{ width: '14px', height: '14px', color: '#f59e0b' }} />
              <span style={{ color: '#fbbf24', fontWeight: 500 }}>Offline mode — local login</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
