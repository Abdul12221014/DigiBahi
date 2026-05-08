import { useEffect, useRef } from 'react';
import { LedgerEntry } from '@/lib/db';
import ws, { offWSMessage, WsMessage } from '@/services/ws.service';
import { toast } from 'sonner';

interface UseLedgerSyncCallbacks {
  onEntryCreated?: (entry: LedgerEntry) => void;
  onEntryUpdated?: (entry: LedgerEntry) => void;
  onEntryDeleted?: (id: number) => void;
}

export function useLedgerSync(callbacks: UseLedgerSyncCallbacks) {
  const callbacksRef = useRef(callbacks);

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    ws.initWS();

    const handler = (msg: WsMessage) => {
      if (!msg.type || !msg.type.startsWith('ledger_entry_')) return;

      const currentCallbacks = callbacksRef.current;

      try {
        switch (msg.type) {
          case 'ledger_entry_created': {
            const createdEntry = msg.data as LedgerEntry;
            currentCallbacks.onEntryCreated?.(createdEntry);
            toast.success(`New entry: ${createdEntry.description || 'Untitled'}`);
            break;
          }
          case 'ledger_entry_updated': {
            const updatedEntry = msg.data as LedgerEntry;
            currentCallbacks.onEntryUpdated?.(updatedEntry);
            toast.info(`Entry updated: ${updatedEntry.description || 'Unknown'}`);
            break;
          }
          case 'ledger_entry_deleted': {
            const data = msg.data as { id?: number } | undefined;
            if (data?.id !== undefined) {
              currentCallbacks.onEntryDeleted?.(data.id);
            }
            toast.warning(`Entry deleted`);
            break;
          }
          default:
            break;
        }
      } catch (error) {
        console.error('Error handling ledger event:', error);
      }
    };

    ws.onWSMessage(handler);

    return () => { offWSMessage(handler); };
  }, []);
}
