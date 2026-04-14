import { useEffect, useState } from 'react';
import ws from '@/services/ws.service';

export function useSyncStatus() {
  const [status, setStatus] = useState<'idle' | 'synced' | 'updating'>('idle');
  useEffect(() => {
    ws.initWS();
    const handler = (msg: any) => {
      if (msg?.type === 'ledger_update' || msg?.type === 'user_login' || msg?.type === 'backup_completed') {
        setStatus('updating');
        setTimeout(() => setStatus('synced'), 1000);
      }
    };
    ws.onWSMessage(handler);
  }, []);
  return status;
}

export default useSyncStatus;


