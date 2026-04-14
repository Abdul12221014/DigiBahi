import { useEffect, useRef } from 'react';
import ws from '@/services/ws.service';
import { toast } from 'sonner';

interface UseLedgerSyncCallbacks {
  onEntryCreated?: (entry: any) => void;
  onEntryUpdated?: (entry: any) => void;
  onEntryDeleted?: (id: number) => void;
}

/**
 * Hook to listen for ledger-related WebSocket events
 * and trigger callbacks for real-time updates
 */
export function useLedgerSync(callbacks: UseLedgerSyncCallbacks) {
  const callbacksRef = useRef(callbacks);
  
  // Keep callbacks ref updated
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    // Ensure WebSocket connection is established
    ws.initWS();
    
    const handler = (msg: any) => {
      // Only process ledger events
      if (!msg.type || !msg.type.startsWith('ledger_entry_')) {
        return;
      }

      const currentCallbacks = callbacksRef.current;

      try {
        switch (msg.type) {
          case 'ledger_entry_created': {
            const createdEntry = msg.data;
            currentCallbacks.onEntryCreated?.(createdEntry);
            toast.success(`New entry: ${createdEntry.description || 'Untitled'}`);
            break;
          }

          case 'ledger_entry_updated': {
            const updatedEntry = msg.data;
            currentCallbacks.onEntryUpdated?.(updatedEntry);
            toast.info(`Entry updated: ${updatedEntry.description || 'Unknown'}`);
            break;
          }

          case 'ledger_entry_deleted': {
            const deletedId = msg.data?.id;
            currentCallbacks.onEntryDeleted?.(deletedId);
            toast.warning(`Entry deleted`);
            break;
          }

          default:
            // Ignore unknown event types
            break;
        }
      } catch (error) {
        console.error('Error handling ledger event:', error);
      }
    };

    // Register WebSocket message handler
    ws.onWSMessage(handler);

    // Cleanup: No specific cleanup needed as ws.service handles reconnection
    // The handler will be called for new messages automatically
  }, []); // Empty dependency array - setup once
}

