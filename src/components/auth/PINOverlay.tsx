import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NumericKeypad } from './NumericKeypad';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/db';
import { Lock, Wifi, WifiOff } from 'lucide-react';
import useOnline from '@/hooks/useOnline';

const MAX_PIN_LENGTH = 6;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

type PinState = 'idle' | 'submitting' | 'error' | 'locked';

export function PINOverlay() {
  const { login } = useAuth();
  const online = useOnline();

  const [pin, setPin] = useState('');
  const [state, setState] = useState<PinState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockoutEnd, setLockoutEnd] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [username, setUsername] = useState('');
  const [users, setUsers] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const countdownRef = useRef<number>();

  // Load users from Dexie for user switcher
  useEffect(() => {
    db.users.toArray().then(us => {
      const names = us.map(u => u.username);
      setUsers(names);
      if (names.length > 0) setUsername(names[0]);
    });
  }, []);

  // Lockout countdown ticker
  useEffect(() => {
    if (!lockoutEnd) return;
    const tick = () => {
      const remaining = Math.ceil((lockoutEnd - Date.now()) / 1000);
      if (remaining <= 0) {
        setState('idle');
        setLockoutEnd(null);
        setAttempts(0);
        setCountdown(0);
      } else {
        setCountdown(remaining);
        countdownRef.current = window.setTimeout(tick, 1000);
      }
    };
    tick();
    return () => window.clearTimeout(countdownRef.current);
  }, [lockoutEnd]);

  // Physical keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (state === 'locked' || state === 'submitting') return;
      if (/^\d$/.test(e.key)) handleDigit(e.key);
      else if (e.key === 'Backspace') handleDelete();
      else if (e.key === 'Enter') handleSubmit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pin, state, username]);

  const handleDigit = useCallback((digit: string) => {
    setPin(prev => {
      const next = prev + digit;
      if (next.length >= MAX_PIN_LENGTH) {
        // Auto-submit when max length reached
        setTimeout(() => submitPin(next), 80);
        return next;
      }
      return next;
    });
  }, []);

  const handleDelete = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
    setErrorMsg('');
    if (state === 'error') setState('idle');
  }, [state]);

  const submitPin = async (pinValue: string) => {
    if (!pinValue || state === 'submitting' || state === 'locked') return;
    setState('submitting');
    setErrorMsg('');

    const ok = await login(username || 'owner', pinValue);

    if (ok) {
      setPin('');
      setAttempts(0);
      setState('idle');
      return;
    }

    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    setPin('');
    setShake(true);
    setTimeout(() => setShake(false), 500);

    if (newAttempts >= MAX_ATTEMPTS) {
      const end = Date.now() + LOCKOUT_MS;
      setLockoutEnd(end);
      setState('locked');
      setErrorMsg('Too many attempts. Please wait.');
    } else {
      setState('error');
      setErrorMsg(`Wrong PIN. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts !== 1 ? 's' : ''} left.`);
    }
  };

  const handleSubmit = useCallback(() => {
    submitPin(pin);
  }, [pin, state, username, attempts]);

  const pinDots = Array.from({ length: MAX_PIN_LENGTH }).map((_, i) => (
    <div
      key={i}
      className={[
        'w-4 h-4 rounded-full border-2 transition-all duration-150',
        i < pin.length
          ? 'bg-white border-white scale-110'
          : 'bg-transparent border-white/40',
      ].join(' ')}
    />
  ));

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg">
          <Lock className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-white text-2xl font-bold tracking-tight">DigiBahi</h1>
        <div className="flex items-center gap-1.5 text-white/50 text-sm">
          {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span>{online ? 'Online' : 'Offline mode'}</span>
        </div>
      </div>

      {/* User switcher (only shown when multiple users) */}
      {users.length > 1 && (
        <div className="flex gap-2 mb-6">
          {users.map(u => (
            <button
              key={u}
              onClick={() => { setUsername(u); setPin(''); setState('idle'); setErrorMsg(''); }}
              className={[
                'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                username === u
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20',
              ].join(' ')}
            >
              {u}
            </button>
          ))}
        </div>
      )}

      {users.length === 1 && (
        <p className="text-white/60 text-sm mb-6">
          {username}
        </p>
      )}

      {/* PIN dots */}
      <div className={['flex gap-3 mb-6', shake ? 'animate-shake' : ''].join(' ')}>
        {pinDots}
      </div>

      {/* Status message */}
      <div className="h-6 mb-4">
        {state === 'locked' ? (
          <p className="text-red-400 text-sm font-medium">
            Locked — {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')} remaining
          </p>
        ) : errorMsg ? (
          <p className="text-red-400 text-sm">{errorMsg}</p>
        ) : (
          <p className="text-white/40 text-sm">Enter your PIN to unlock</p>
        )}
      </div>

      {/* Keypad */}
      <NumericKeypad
        onDigit={handleDigit}
        onDelete={handleDelete}
        onSubmit={handleSubmit}
        disabled={state === 'submitting' || state === 'locked'}
        showSubmit={pin.length > 0 && pin.length < MAX_PIN_LENGTH}
      />

      {/* Submitting indicator */}
      {state === 'submitting' && (
        <p className="mt-4 text-white/50 text-sm animate-pulse">Verifying…</p>
      )}
    </div>
  );
}
