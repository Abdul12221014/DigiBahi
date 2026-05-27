import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InvoiceDelivery, StatusEvent, DeliveryEvent } from '../../types/delivery.types';

// ─── Mock db ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    transaction: vi.fn((_mode: unknown, _tables: unknown, callback: () => unknown) => callback()),
    invoiceDeliveries: {
      add:     vi.fn(),
      get:     vi.fn(),
      update:  vi.fn(),
      where:   vi.fn(),
      orderBy: vi.fn(),
    },
    deliveryEvents: {
      add:    vi.fn(),
      where:  vi.fn(),
    },
  },
}));

import {
  createDelivery,
  updateDeliveryStatus,
  appendDeliveryEvent,
  checkResend,
  getDeliveryById,
  listDeliveriesByInvoice,
  listRecentDeliveries,
  ResendError,
} from '../delivery.service';

import { db } from '@/lib/db';

const mockDeliveries = vi.mocked(db.invoiceDeliveries);
const mockDeliveryEvents = vi.mocked(db.deliveryEvents);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BASE: Omit<
  InvoiceDelivery,
  'id' | 'status' | 'statusSource' | 'statusHistory' | 'retryCount' | 'maxRetries'
  | 'retryStrategy' | 'idempotencyKey' | 'createdAt' | 'updatedAt'
> = {
  invoiceNumber: 'INV-001',
  customerName:  'Ramesh Kumar',
  customerPhone: '+919876543210',
  amount:        1000,
  gstAmount:     180,
  totalAmount:   1180,
  description:   'Consulting services',
  date:          '2026-05-27',
  channel:       'whatsapp_api',
};

function makeDelivery(overrides: Partial<InvoiceDelivery> = {}): InvoiceDelivery {
  return {
    id:              1,
    ...BASE,
    status:          'sent',
    statusSource:    'api_response',
    statusHistory:   [],
    retryCount:      0,
    maxRetries:      3,
    retryStrategy:   'exponential',
    idempotencyKey:  'key-abc',
    lastSentAt:      null,
    cooldownUntil:   null,
    createdAt:       '2026-05-27T10:00:00.000Z',
    updatedAt:       '2026-05-27T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDeliveries.add.mockResolvedValue(42);
  mockDeliveryEvents.add.mockResolvedValue(1);
  mockDeliveries.update.mockResolvedValue(1);
});

// ─── createDelivery ───────────────────────────────────────────────────────────

describe('createDelivery', () => {
  it('creates a record with status=queued and a generated idempotencyKey', async () => {
    const id = await createDelivery(BASE);

    expect(id).toBe(42);
    const record = mockDeliveries.add.mock.calls[0][0] as InvoiceDelivery;
    expect(record.status).toBe('queued');
    expect(record.statusSource).toBe('client_estimate');
    expect(record.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(record.retryCount).toBe(0);
    expect(record.maxRetries).toBe(3);
    expect(record.retryStrategy).toBe('exponential');
    expect(record.statusHistory).toHaveLength(1);
    expect(record.statusHistory[0].status).toBe('queued');
    expect(record.statusHistory[0].source).toBe('client_estimate');
  });

  it('also writes a DeliveryEvent to the deliveryEvents table', async () => {
    await createDelivery(BASE);

    const event = mockDeliveryEvents.add.mock.calls[0][0] as DeliveryEvent;
    expect(event.deliveryId).toBe(42);
    expect(event.status).toBe('queued');
    expect(event.source).toBe('client_estimate');
  });
});

// ─── updateDeliveryStatus ─────────────────────────────────────────────────────

describe('updateDeliveryStatus', () => {
  it('appends StatusEvent to snapshot and writes DeliveryEvent', async () => {
    mockDeliveries.get.mockResolvedValue(makeDelivery({ status: 'queued', statusHistory: [] }));

    await updateDeliveryStatus(1, 'sent', {
      source: 'api_response',
      detail: 'msg_123',
      messageId: 'msg_123',
    });

    const patch = mockDeliveries.update.mock.calls[0][1] as Partial<InvoiceDelivery>;
    expect(patch.status).toBe('sent');
    expect(patch.statusSource).toBe('api_response');
    const lastEvent = (patch.statusHistory as StatusEvent[]).at(-1)!;
    expect(lastEvent.status).toBe('sent');
    expect(lastEvent.source).toBe('api_response');
    expect(lastEvent.detail).toBe('msg_123');
    expect(patch.messageId).toBe('msg_123');

    const devEvent = mockDeliveryEvents.add.mock.calls[0][0] as DeliveryEvent;
    expect(devEvent.deliveryId).toBe(1);
    expect(devEvent.status).toBe('sent');
    expect(devEvent.source).toBe('api_response');
  });

  it('sets sentAt + rotates idempotencyKey on first transition to sending', async () => {
    mockDeliveries.get.mockResolvedValue(makeDelivery({ status: 'queued', sentAt: undefined }));

    await updateDeliveryStatus(1, 'sending', { source: 'client_estimate' });

    const patch = mockDeliveries.update.mock.calls[0][1] as Partial<InvoiceDelivery>;
    expect(patch.sentAt).toBeDefined();
    expect(patch.idempotencyKey).toBeDefined();
    expect(patch.idempotencyKey).not.toBe('key-abc');
  });

  it('sets lastSentAt + cooldownUntil on transition to sending', async () => {
    mockDeliveries.get.mockResolvedValue(makeDelivery({ status: 'queued' }));

    await updateDeliveryStatus(1, 'sending', { source: 'client_estimate' });

    const patch = mockDeliveries.update.mock.calls[0][1] as Partial<InvoiceDelivery>;
    expect(patch.lastSentAt).toBeDefined();
    expect(patch.cooldownUntil).toBeDefined();
    const cooldownMs = new Date(patch.cooldownUntil!).getTime() - Date.now();
    expect(cooldownMs).toBeGreaterThan(4 * 60 * 1000);
    expect(cooldownMs).toBeLessThan(6 * 60 * 1000);
  });

  it('sets deliveredAt on delivered', async () => {
    mockDeliveries.get.mockResolvedValue(makeDelivery({ status: 'sent' }));
    await updateDeliveryStatus(1, 'delivered', { source: 'webhook' });
    const patch = mockDeliveries.update.mock.calls[0][1] as Partial<InvoiceDelivery>;
    expect(patch.deliveredAt).toBeDefined();
  });

  it('sets readAt on read', async () => {
    mockDeliveries.get.mockResolvedValue(makeDelivery({ status: 'delivered' }));
    await updateDeliveryStatus(1, 'read', { source: 'webhook' });
    const patch = mockDeliveries.update.mock.calls[0][1] as Partial<InvoiceDelivery>;
    expect(patch.readAt).toBeDefined();
  });

  it('increments retryCount + sets lastRetryAt on retrying', async () => {
    mockDeliveries.get.mockResolvedValue(makeDelivery({ status: 'failed', retryCount: 1 }));
    await updateDeliveryStatus(1, 'retrying', { source: 'retry_worker' });
    const patch = mockDeliveries.update.mock.calls[0][1] as Partial<InvoiceDelivery>;
    expect(patch.retryCount).toBe(2);
    expect(patch.lastRetryAt).toBeDefined();
  });

  it('throws when record does not exist', async () => {
    mockDeliveries.get.mockResolvedValue(undefined);
    await expect(updateDeliveryStatus(999, 'sent', { source: 'api_response' }))
      .rejects.toThrow('Delivery 999 not found');
  });
});

// ─── checkResend ──────────────────────────────────────────────────────────────

describe('checkResend', () => {
  it('allows resend when status is failed and no cooldown', () => {
    const result = checkResend(makeDelivery({ status: 'failed', cooldownUntil: null, lastSentAt: null }));
    expect(result.allowed).toBe(true);
  });

  it('blocks when cooldown has not expired', () => {
    const future = new Date(Date.now() + 4 * 60 * 1000).toISOString();
    const result = checkResend(makeDelivery({ status: 'failed', cooldownUntil: future }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('cooldown');
    expect(result.cooldownSecondsRemaining).toBeGreaterThan(0);
  });

  it('blocks duplicate suppression within 2 minutes of last send', () => {
    const recent = new Date(Date.now() - 60 * 1000).toISOString();
    const result = checkResend(makeDelivery({ status: 'sent', lastSentAt: recent, cooldownUntil: null }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('duplicate');
  });

  it('blocks when max retries exceeded', () => {
    const result = checkResend(makeDelivery({ status: 'failed', retryCount: 3, maxRetries: 3, cooldownUntil: null }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('max_retries_exceeded');
  });

  it('blocks non-resendable status', () => {
    const result = checkResend(makeDelivery({ status: 'sending', cooldownUntil: null }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('invalid_status');
  });

  it('allows resend after cooldown has expired', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const result = checkResend(makeDelivery({ status: 'failed', cooldownUntil: past, lastSentAt: null }));
    expect(result.allowed).toBe(true);
  });
});

// ─── appendDeliveryEvent ──────────────────────────────────────────────────────

describe('appendDeliveryEvent', () => {
  it('inserts a DeliveryEvent record', async () => {
    await appendDeliveryEvent(5, {
      status: 'delivered',
      source: 'webhook',
      detail: 'Confirmed by Meta webhook',
    });

    const event = mockDeliveryEvents.add.mock.calls[0][0] as DeliveryEvent;
    expect(event.deliveryId).toBe(5);
    expect(event.status).toBe('delivered');
    expect(event.source).toBe('webhook');
    expect(event.detail).toBe('Confirmed by Meta webhook');
    expect(event.timestamp).toBeDefined();
  });
});
