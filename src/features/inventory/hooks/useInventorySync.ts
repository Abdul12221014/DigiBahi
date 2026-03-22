import { useEffect, useRef } from 'react';
import ws from '@/services/ws.service';
import { toast } from 'sonner';

interface UseInventorySyncCallbacks {
  onItemCreated?: (item: any) => void;
  onItemUpdated?: (item: any) => void;
  onItemDeleted?: (id: number) => void;
  onStockChanged?: (data: any) => void;
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
    const handler = (msg: any) => {
      // Only process inventory events
      if (!msg.type || !msg.type.startsWith('inventory_')) {
        return;
      }

      const currentCallbacks = callbacksRef.current;

      try {
        switch (msg.type) {
          case 'inventory_item_created': {
            const createdItem = msg.data;
            currentCallbacks.onItemCreated?.(createdItem);
            toast.success(`New item: ${createdItem.name || 'Untitled'}`);
            break;
          }

          case 'inventory_item_updated': {
            const updatedItem = msg.data;
            currentCallbacks.onItemUpdated?.(updatedItem);
            toast.info(`Item updated: ${updatedItem.name || 'Unknown'}`);
            break;
          }

          case 'inventory_item_deleted': {
            const deletedId = msg.data?.id;
            currentCallbacks.onItemDeleted?.(deletedId);
            toast.warning(`Item deleted`);
            break;
          }

          case 'inventory_stock_changed': {
            const stockData = msg.data;
            currentCallbacks.onStockChanged?.(stockData);
            toast.info(`Stock changed for: ${stockData.item_name || 'Unknown'}`);
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

