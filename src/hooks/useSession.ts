import { useEffect, useState } from 'react';
import sessionService from '@/services/session.service';

export function useSession() {
  const [active, setActive] = useState<boolean>(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    (async () => {
      const s = await sessionService.loadSession();
      if (s) { setActive(true); setExpiresAt(s.expiresAt); }
    })();
    const tick = async () => {
      const s = await sessionService.refresh();
      if (s) { setActive(true); setExpiresAt(s.expiresAt); }
      // refresh every 10 minutes
      timer = window.setTimeout(tick, 10 * 60 * 1000);
    };
    timer = window.setTimeout(tick, 10 * 60 * 1000);
    return () => { if (timer) window.clearTimeout(timer); };
  }, []);

  const logout = async () => { await sessionService.logout(); setActive(false); setExpiresAt(null); };

  return { active, expiresAt, logout };
}

export default useSession;


