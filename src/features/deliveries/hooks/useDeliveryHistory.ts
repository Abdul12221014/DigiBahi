import { useState, useEffect, useCallback } from 'react';
import {
  listRecentDeliveries,
  listDeliveriesByInvoice,
  assertCanResend,
  updateDeliveryStatus,
  ResendError,
} from '../services/delivery.service';
import { requestResend } from '../services/delivery-api.service';
import type { InvoiceDelivery, ResendErrorCode } from '../types/delivery.types';

interface UseDeliveryHistoryOptions {
  invoiceNumber?: string;
  limit?: number;
}

interface ResendErrorState {
  id: number;
  code: ResendErrorCode;
  message: string;
}

interface UseDeliveryHistoryResult {
  deliveries:       InvoiceDelivery[];
  isLoading:        boolean;
  error:            string | null;
  isResending:      boolean;
  resendError:      ResendErrorState | null;
  refresh:          () => void;
  resend:           (id: number) => Promise<void>;
  clearResendError: () => void;
}

export function useDeliveryHistory(
  options: UseDeliveryHistoryOptions = {},
): UseDeliveryHistoryResult {
  const [deliveries,  setDeliveries]  = useState<InvoiceDelivery[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendError, setResendError] = useState<ResendErrorState | null>(null);
  const [tick,        setTick]        = useState(0);

  const refresh          = useCallback(() => setTick(t => t + 1), []);
  const clearResendError = useCallback(() => setResendError(null), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const fetchFn = options.invoiceNumber
      ? listDeliveriesByInvoice(options.invoiceNumber)
      : listRecentDeliveries(options.limit ?? 50);

    fetchFn
      .then(data  => { if (!cancelled) setDeliveries(data); })
      .catch(err  => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [options.invoiceNumber, options.limit, tick]);

  const resend = useCallback(async (id: number) => {
    setIsResending(true);
    setResendError(null);

    try {
      await assertCanResend(id);

      await updateDeliveryStatus(id, 'queued', {
        source: 'client_estimate',
        detail: 'Manual resend requested',
      });
      refresh();

      const result = await requestResend(id);

      if (result.success) {
        await updateDeliveryStatus(id, 'sent', {
          source:    'api_response',
          detail:    'Resent successfully',
          messageId: result.new_message_id,
        });
      } else {
        await updateDeliveryStatus(id, 'failed', {
          source:        'api_response',
          failureReason: result.message,
        });
      }
    } catch (err) {
      if (err instanceof ResendError || (err instanceof Error && err.name === 'ResendError')) {
        const re = err as ResendError;
        setResendError({ id, code: re.code, message: re.message });
      }
      throw err;
    } finally {
      setIsResending(false);
      refresh();
    }
  }, [refresh]);

  return { deliveries, isLoading, error, isResending, resendError, refresh, resend, clearResendError };
}
