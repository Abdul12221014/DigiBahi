import { useEffect, useRef } from 'react';
import ws, { type WsMessage } from '@/services/ws.service';
import { toast } from 'sonner';
import type { RawInventoryItem } from '../types/inventory.types';

interface UseInventorySyncCallbacks {
  onItemCreated?: (item: RawInventoryItem) => void;
  onItemUpdated?: (item: RawInventoryItem) => void;
  onItemDeleted?: (id: number) => void;
  onStockChanged?: (data: unknown) => void;
}

/**
 * Hook to listen for inventory-related WebSocket events
 * and trigger callbacks for real-time updates
 */
export function useInventorySync(callbacks: UseInventorySyncCallbacks) {
  const callbacksRef = useRef(callbacks);
  
  // Keep callbacks ref updated
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    const handler = (msg: WsMessage) => {
      // Only process inventory events
      if (!msg.type || !msg.type.startsWith('inventory_')) {
        return;
      }

      const currentCallbacks = callbacksRef.current;

      // Helper: safely read a string prop from unknown data
      const strProp = (data: unknown, key: string): string => {
        if (data !== null && typeof data === 'object' && key in data) {
          const val = (data as Record<string, unknown>)[key];
          return typeof val === 'string' ? val : '';
        }
        return '';
      };

      const numProp = (data: unknown, key: string): number | undefined => {
        if (data !== null && typeof data === 'object' && key in data) {
          const val = (data as Record<string, unknown>)[key];
          return typeof val === 'number' ? val : undefined;
        }
        return undefined;
      };

      try {
        switch (msg.type) {
          case 'inventory_item_created': {
            currentCallbacks.onItemCreated?.(msg.data as RawInventoryItem);
            toast.success(`New item: ${strProp(msg.data, 'name') || 'Untitled'}`);
            break;
          }

          case 'inventory_item_updated': {
            currentCallbacks.onItemUpdated?.(msg.data as RawInventoryItem);
            toast.info(`Item updated: ${strProp(msg.data, 'name') || 'Unknown'}`);
            break;
          }

          case 'inventory_item_deleted': {
            const deletedId = numProp(msg.data, 'id');
            if (deletedId !== undefined) currentCallbacks.onItemDeleted?.(deletedId);
            toast.warning(`Item deleted`);
            break;
          }

          case 'inventory_stock_changed': {
            currentCallbacks.onStockChanged?.(msg.data);
            toast.info(`Stock changed for: ${strProp(msg.data, 'item_name') || 'Unknown'}`);
            break;
          }

          default:
            // Ignore unknown event types
            break;
        }
      } catch (error) {
        console.error('Error handling inventory event:', error);
      }
    };

    // Register WebSocket message handler
    ws.onWSMessage(handler);

    // Cleanup: No specific cleanup needed as ws.service handles reconnection
    // The handler will be called for new messages automatically
  }, []); // Empty dependency array - setup once
}

