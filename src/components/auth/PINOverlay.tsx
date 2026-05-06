import React, { useState, useEffect, useRef } from 'react';
import { NumericKeypad } from './NumericKeypad';
import { useAuth } from '@/contexts/AuthContext';
import { db, CompanySettings } from '@/lib/db';
import { WifiOff } from 'lucide-react';
import useOnline from '@/hooks/useOnline';

const MAX_PIN_LENGTH = 6;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

type PinState = 'idle' | 'submitting' | 'error' | 'success' | 'locked';

interface UserRecord { username: string; role: string; }

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

  // Refs to avoid stale closure in submitPin
  const attemptsRef = useRef(0);
  const usernameRef = useRef('owner');
  const pinStateRef = useRef<PinState>('idle');
  pinStateRef.current = pinState;
  usernameRef.current = users[activeUserIdx]?.username ?? 'owner';

  // Load users + company
  useEffect(() => {
    db.users.toArray().then(us => {
      setUsers(us.map(u => ({ username: u.username, role: u.role })));
    });
    db.companySettings.toArray().then(s => {
      if (s.length > 0) setCompany(s[0]);
    });
  }, []);

  // Lockout countdown
  useEffect(() => {
    if (!lockoutEnd) return;
    const tick = () => {
      const rem = Math.ceil((lockoutEnd - Date.now()) / 1000);
      if (rem <= 0) {
        setPinState('idle');
        setLockoutEnd(null);
        attemptsRef.current = 0;
        setCountdown(0);
      } else {
        setCountdown(rem);
        setTimeout(tick, 1000);
      }
    };
    tick();
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

  // ── PIN manipulation ──────────────────────────────────────────────────────

  const appendDigit = (digit: string) => {
    setPin(prev => {
      const next = prev + digit;
      if (next.length >= MAX_PIN_LENGTH) {
        // 80ms delay so user sees final dot before submit
        setTimeout(() => submitPin(next), 80);
        return next;
      }
      return next;
    });
  };

  const deleteDigit = () => {
    if (pinStateRef.current === 'error') setPinState('idle');
    setErrorMsg('');
    setPin(prev => prev.slice(0, -1));
  };

  const triggerSubmit = () => {
    setPin(prev => { submitPin(prev); return prev; });
  };

  const submitPin = async (pinValue: string) => {
    if (!pinValue || pinStateRef.current === 'submitting' || pinStateRef.current === 'locked' || pinStateRef.current === 'success') return;
    setPinState('submitting');
    setErrorMsg('');

    const ok = await login(usernameRef.current, pinValue);

    if (ok) {
      setPinState('success');
      // Brief green success flash, then auth context removes overlay
      setTimeout(() => {
        setPin('');
        setPinState('idle');
      }, 600);
      return;
    }

    attemptsRef.current += 1;
    setPin('');
    setShake(true);
    setTimeout(() => setShake(false), 500);

    if (attemptsRef.current >= MAX_ATTEMPTS) {
      setLockoutEnd(Date.now() + LOCKOUT_MS);
      setPinState('locked');
      setErrorMsg('');
    } else {
      const left = MAX_ATTEMPTS - attemptsRef.current;
      setPinState('error');
      setErrorMsg(`Incorrect PIN — ${left} attempt${left !== 1 ? 's' : ''} remaining`);
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: 'rgba(3, 7, 18, 0.88)',
        backdropFilter: 'blur(32px) saturate(0.4)',
        WebkitBackdropFilter: 'blur(32px) saturate(0.4)',
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
          style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}
        >
          {Array.from({ length: MAX_PIN_LENGTH }).map((_, i) => {
            const filled = i < pin.length;
            const isSuccessDot = isSuccess && filled;
            return (
              <div
                key={i}
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
                  transition: 'all 0.15s ease',
                }}
              />
            );
          })}
        </div>

        {/* Status line */}
        <div style={{ height: '20px', marginBottom: '20px', textAlign: 'center' }}>
          {isLocked ? (
            <span style={{ fontSize: '13px', color: '#f87171', fontWeight: 500 }}>
              Locked — {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
            </span>
          ) : errorMsg ? (
            <span style={{ fontSize: '13px', color: '#fca5a5' }}>{errorMsg}</span>
          ) : isSubmitting ? (
            <span style={{ fontSize: '13px', color: 'rgba(148,163,184,0.7)' }} className="animate-pulse">
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
              <WifiOff style={{ width: '12px', height: '12px', color: '#f87171' }} />
              <span style={{ color: '#fca5a5' }}>Offline mode — local login</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
