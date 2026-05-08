import { useEffect } from 'react';
import sessionService from '@/services/session.service';
import { useAuth } from '@/contexts/AuthContext';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;  // refresh backend token every 10 min
const IDLE_TIMEOUT_MS     = 30 * 60 * 1000;  // lock after 30 min of inactivity

const ACTIVITY_EVENTS = [
  'mousedown', 'keydown', 'touchstart', 'pointerdown', 'scroll',
] as const;

export function useSession() {
  const { isAuthenticated, lockScreen } = useAuth();

  // Backend session refresh
  useEffect(() => {
    if (!isAuthenticated) return;

    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const s = await sessionService.refresh();
      if (!s) {
        lockScreen();
        return;
      }
      timer = setTimeout(tick, REFRESH_INTERVAL_MS);
    };

    timer = setTimeout(tick, REFRESH_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [isAuthenticated, lockScreen]);

  // Idle timeout — any user activity resets the 30-min clock
  useEffect(() => {
    if (!isAuthenticated) return;

    let idleTimer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(lockScreen, IDLE_TIMEOUT_MS);
    };

    ACTIVITY_EVENTS.forEach(ev =>
      window.addEventListener(ev, resetTimer, { passive: true }),
    );
    resetTimer(); // start clock immediately on login

    return () => {
      clearTimeout(idleTimer);
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, resetTimer));
    };
  }, [isAuthenticated, lockScreen]);
}

export default useSession;
