import { useEffect, useState } from 'react';
import { WifiOff, CloudOff } from 'lucide-react';
import { pendingCount } from '@/services/sync.service';
import { db } from '@/lib/db';
import useOnline from '@/hooks/useOnline';

export function OfflineSyncBanner() {
  const online = useOnline();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const n = await pendingCount();
      if (!cancelled) setCount(n);
    };

    refresh();

    // Re-count whenever offlineQueue changes (Dexie live query)
    const sub = db.offlineQueue.hook('creating', () => { refresh(); });
    const subDel = db.offlineQueue.hook('deleting', () => { refresh(); });

    return () => {
      cancelled = true;
      db.offlineQueue.hook('creating').unsubscribe(sub as never);
      db.offlineQueue.hook('deleting').unsubscribe(subDel as never);
    };
  }, []);

  if (count === 0) return null;

  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 text-amber-800 px-4 py-2 flex items-center gap-2 text-sm">
      {online ? (
        <CloudOff className="w-4 h-4 shrink-0 text-amber-600" />
      ) : (
        <WifiOff className="w-4 h-4 shrink-0 text-amber-600" />
      )}
      <span>
        <strong>{count}</strong> {count === 1 ? 'entry' : 'entries'} saved locally — not yet synced to server.
        {online ? ' Syncing…' : ' Connect to sync.'}
      </span>
    </div>
  );
}
