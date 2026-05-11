import { useState, useEffect } from 'react';
import { getSyncQueue, removeFromSyncQueue } from '@/lib/db';
import type { UPIReconcileRequest } from '../types/upi.types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Sync reconciliation requests to backend
 * Handles offline queue when backend is not available
 */
export class UPISyncService {
  private static instance: UPISyncService;
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;

  constructor() {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processSyncQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  static getInstance(): UPISyncService {
    if (!UPISyncService.instance) {
      UPISyncService.instance = new UPISyncService();
    }
    return UPISyncService.instance;
  }

  /**
   * Attempt to sync a reconciliation request to backend
   */
  async syncReconcileRequest(request: UPIReconcileRequest): Promise<{ success: boolean; queued: boolean }> {
    if (!this.isOnline) {
      // Already queued in IndexedDB, just return queued status
      return { success: false, queued: true };
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/upi/reconcile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (response.ok) {
        // Successfully synced, remove from queue
        await removeFromSyncQueue(request.id);
        return { success: true, queued: false };
      } else {
        // Backend error, keep in queue
        return { success: false, queued: true };
      }
    } catch (error) {
      console.warn('Failed to sync reconcile request:', error);
      // Network error, keep in queue
      return { success: false, queued: true };
    }
  }

  /**
   * Process all queued reconciliation requests
   */
  async processSyncQueue(): Promise<{ synced: number; failed: number }> {
    if (this.syncInProgress || !this.isOnline) {
      return { synced: 0, failed: 0 };
    }

    this.syncInProgress = true;
    let synced = 0;
    let failed = 0;

    try {
      const queue = await getSyncQueue();
      
      for (const request of queue) {
        try {
          const result = await this.syncReconcileRequest(request);
          if (result.success) {
            synced++;
          } else {
            failed++;
          }
        } catch (error) {
          console.error('Failed to sync request:', request.id, error);
          failed++;
        }
      }
    } catch (error) {
      console.error('Failed to process sync queue:', error);
    } finally {
      this.syncInProgress = false;
    }

    return { synced, failed };
  }

  /**
   * Get sync status for display
   */
  async getSyncStatus(): Promise<{
    queued: number;
    lastSync: Date | null;
    isOnline: boolean;
  }> {
    const queue = await getSyncQueue();
    const lastSync = queue.length > 0 ? new Date(Math.max(...queue.map(r => r.timestamp))) : null;

    return {
      queued: queue.length,
      lastSync,
      isOnline: this.isOnline
    };
  }

  /**
   * Force sync attempt (manual trigger)
   */
  async forceSync(): Promise<{ synced: number; failed: number }> {
    return await this.processSyncQueue();
  }

  /**
   * Check if backend is reachable
   */
  async checkBackendHealth(): Promise<boolean> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/health`, {
        method: 'GET',
        signal: ctrl.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

// Export singleton instance
export const upiSyncService = UPISyncService.getInstance();

/**
 * Hook for UPI sync status
 */
export function useUPISyncStatus() {
  const [status, setStatus] = useState({
    queued: 0,
    lastSync: null as Date | null,
    isOnline: navigator.onLine
  });

  useEffect(() => {
    const updateStatus = async () => {
      const syncStatus = await upiSyncService.getSyncStatus();
      setStatus(syncStatus);
    };

    updateStatus();

    // Update status every 30 seconds
    const interval = setInterval(updateStatus, 30000);

    // Listen for online/offline events
    const handleOnline = () => {
      setStatus(prev => ({ ...prev, isOnline: true }));
      upiSyncService.processSyncQueue();
    };

    const handleOffline = () => {
      setStatus(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return status;
}

/**
 * Utility function to show sync status in UI
 */
export function getSyncStatusText(status: { queued: number; isOnline: boolean }): string {
  if (!status.isOnline) {
    return 'Offline - Changes will sync when online';
  }
  
  if (status.queued > 0) {
    return `${status.queued} payment${status.queued > 1 ? 's' : ''} queued for sync`;
  }
  
  return 'All changes synced';
}

/**
 * Utility function to get sync status color
 */
export function getSyncStatusColor(status: { queued: number; isOnline: boolean }): string {
  if (!status.isOnline) {
    return 'text-yellow-600';
  }
  
  if (status.queued > 0) {
    return 'text-orange-600';
  }
  
  return 'text-green-600';
}
