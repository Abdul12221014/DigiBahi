import { useEffect } from 'react';
import sessionService from '@/services/session.service';
import { useAuth } from '@/contexts/AuthContext';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export function useSession() {
  const { isAuthenticated, lockScreen } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    let timer: number;

    const tick = async () => {
      const s = await sessionService.refresh();
      if (!s) {
        // Token expired or server unreachable — re-lock the kiosk
        lockScreen();
        return;
      }
      timer = window.setTimeout(tick, REFRESH_INTERVAL_MS);
    };

    timer = window.setTimeout(tick, REFRESH_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, lockScreen]);
}

export default useSession;
