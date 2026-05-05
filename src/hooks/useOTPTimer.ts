/**
 * useOTPTimer
 * ────────────
 * Countdown timer for OTP expiry with auto-reset.
 * Uses absolute expiry (Date.now) so backgrounding the
 * app doesn't silently extend the countdown.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface OTPTimerState {
  remaining: number;       // seconds left
  isActive:  boolean;
  isExpired: boolean;
  label:     string;       // "1:00", "0:45"
  start:     () => void;
  reset:     () => void;
}

export function useOTPTimer(durationSec = 60): OTPTimerState {
  const [remaining, setRemaining] = useState(0);
  const [isActive, setIsActive]   = useState(false);
  const expiresAtRef              = useRef<number>(0);
  const rafRef                    = useRef<number | null>(null);

  const tick = useCallback(() => {
    const left = Math.max(0, Math.ceil((expiresAtRef.current - Date.now()) / 1000));
    setRemaining(left);
    if (left > 0) {
      rafRef.current = window.setTimeout(tick, 500);
    } else {
      setIsActive(false);
    }
  }, []);

  const start = useCallback(() => {
    if (rafRef.current) clearTimeout(rafRef.current);
    expiresAtRef.current = Date.now() + durationSec * 1000;
    setRemaining(durationSec);
    setIsActive(true);
    rafRef.current = window.setTimeout(tick, 500);
  }, [durationSec, tick]);

  const reset = useCallback(() => {
    if (rafRef.current) clearTimeout(rafRef.current);
    expiresAtRef.current = 0;
    setRemaining(0);
    setIsActive(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) clearTimeout(rafRef.current);
    };
  }, []);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const label   = `${minutes}:${String(seconds).padStart(2, '0')}`;
  const isExpired = !isActive && remaining === 0;

  return { remaining, isActive, isExpired, label, start, reset };
}
