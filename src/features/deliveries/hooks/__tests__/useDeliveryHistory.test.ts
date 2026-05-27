import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { InvoiceDelivery } from '../../types/delivery.types';

const mockListRecent    = vi.hoisted(() => vi.fn());
const mockListByInvoice = vi.hoisted(() => vi.fn());
const mockAssertResend  = vi.hoisted(() => vi.fn());
const mockUpdateStatus  = vi.hoisted(() => vi.fn());
const mockApiResend     = vi.hoisted(() => vi.fn());

vi.mock('../../services/delivery.service', () => ({
  listRecentDeliveries:    mockListRecent,
  listDeliveriesByInvoice: mockListByInvoice,
  assertCanResend:         mockAssertResend,
  updateDeliveryStatus:    mockUpdateStatus,
  ResendError: class ResendError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = 'ResendError'; }
  },
}));

vi.mock('../../services/delivery-api.service', () => ({
  requestResend: mockApiResend,
}));

import { useDeliveryHistory } from '../useDeliveryHistory';

const SAMPLE: InvoiceDelivery = {
  id: 1,
  invoiceNumber: 'INV-001', customerName: 'Ramesh Kumar',
  customerPhone: '+919876543210', amount: 1000, gstAmount: 180, totalAmount: 1180,
  description: 'Services', date: '2026-05-27', channel: 'whatsapp_api',
  status: 'sent', statusSource: 'api_response', statusHistory: [],
  idempotencyKey: 'key-abc', retryCount: 0, maxRetries: 3, retryStrategy: 'exponential',
  lastSentAt: null, cooldownUntil: null,
  createdAt: '2026-05-27T10:00:00.000Z', updatedAt: '2026-05-27T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListRecent.mockResolvedValue([SAMPLE]);
  mockListByInvoice.mockResolvedValue([SAMPLE]);
  mockAssertResend.mockResolvedValue(SAMPLE);
  mockUpdateStatus.mockResolvedValue(undefined);
  mockApiResend.mockResolvedValue({ success: true, message: 'ok', new_message_id: 'msg_999' });
});

describe('useDeliveryHistory', () => {
  it('loads recent deliveries on mount', async () => {
    const { result } = renderHook(() => useDeliveryHistory());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.deliveries).toHaveLength(1);
  });

  it('uses listDeliveriesByInvoice when invoiceNumber provided', async () => {
    const { result } = renderHook(() => useDeliveryHistory({ invoiceNumber: 'INV-001' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockListByInvoice).toHaveBeenCalledWith('INV-001');
  });

  it('exposes error message when fetch fails', async () => {
    mockListRecent.mockRejectedValue(new Error('DB offline'));
    const { result } = renderHook(() => useDeliveryHistory());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('DB offline');
  });

  it('successful resend refreshes the list', async () => {
    const { result } = renderHook(() => useDeliveryHistory());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.resend(1); });

    expect(mockApiResend).toHaveBeenCalledWith(1);
    expect(mockListRecent).toHaveBeenCalledTimes(2);
  });

  it('surfaces ResendError when safeguard blocks resend', async () => {
    const err = Object.assign(new Error('Cooldown active'), { name: 'ResendError', code: 'cooldown' });
    mockAssertResend.mockRejectedValue(err);

    const { result } = renderHook(() => useDeliveryHistory());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.resend(1).catch(() => {});
    });

    expect(result.current.resendError).toBeDefined();
    expect(result.current.resendError?.code).toBe('cooldown');
  });
});
