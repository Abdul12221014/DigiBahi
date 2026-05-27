import { db } from '@/lib/db';
import type {
  InvoiceDelivery,
  DeliveryEvent,
  DeliveryStatus,
  StatusSource,
  StatusEvent,
  ResendCheckResult,
  ResendErrorCode,
} from '../types/delivery.types';

// ─── Constants ────────────────────────────────────────────────────────────────

const RESEND_COOLDOWN_MS    = 5 * 60 * 1000;  // 5 minutes
const DUPLICATE_SUPPRESS_MS = 2 * 60 * 1000;  // 2 minutes
const RESENDABLE_STATUSES: DeliveryStatus[] = ['sent', 'failed', 'expired', 'cancelled'];

// ─── Errors ───────────────────────────────────────────────────────────────────

export class ResendError extends Error {
  constructor(
    public readonly code: ResendErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ResendError';
  }
}

// ─── Safeguard check ──────────────────────────────────────────────────────────

export function checkResend(delivery: InvoiceDelivery): ResendCheckResult {
  const now = Date.now();

  if (!RESENDABLE_STATUSES.includes(delivery.status)) {
    return { allowed: false, reason: 'invalid_status' };
  }

  if (delivery.retryCount >= delivery.maxRetries) {
    return { allowed: false, reason: 'max_retries_exceeded' };
  }

  if (delivery.cooldownUntil) {
    const cooldownMs = new Date(delivery.cooldownUntil).getTime();
    if (cooldownMs > now) {
      return {
        allowed: false,
        reason: 'cooldown',
        cooldownUntil: delivery.cooldownUntil,
        cooldownSecondsRemaining: Math.ceil((cooldownMs - now) / 1000),
      };
    }
  }

  // Use lastSentAt if available; fall back to createdAt so a record that failed
  // before lastSentAt was set still gets duplicate suppression.
  const sentTime = delivery.lastSentAt ?? delivery.createdAt;
  if (sentTime) {
    const elapsed = now - new Date(sentTime).getTime();
    if (elapsed < DUPLICATE_SUPPRESS_MS) {
      return { allowed: false, reason: 'duplicate' };
    }
  }

  return { allowed: true };
}

// ─── Append-only event ────────────────────────────────────────────────────────

export async function appendDeliveryEvent(
  deliveryId: number,
  event: Omit<DeliveryEvent, 'id' | 'deliveryId' | 'timestamp'>,
): Promise<number> {
  return db.deliveryEvents.add({
    ...event,
    deliveryId,
    timestamp: new Date().toISOString(),
  });
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createDelivery(
  data: Omit<
    InvoiceDelivery,
    | 'id' | 'status' | 'statusSource' | 'statusHistory'
    | 'retryCount' | 'maxRetries' | 'retryStrategy' | 'idempotencyKey'
    | 'createdAt' | 'updatedAt'
  >,
): Promise<number> {
  const now = new Date().toISOString();
  const initial: StatusEvent = { status: 'queued', source: 'client_estimate', timestamp: now };

  const record: InvoiceDelivery = {
    ...data,
    status:         'queued',
    statusSource:   'client_estimate',
    statusHistory:  [initial],
    idempotencyKey: crypto.randomUUID(),
    retryCount:     0,
    maxRetries:     3,
    retryStrategy:  'exponential',
    lastSentAt:     null,
    cooldownUntil:  null,
    createdAt:      now,
    updatedAt:      now,
  };

  const id = await db.transaction('rw', [db.invoiceDeliveries, db.deliveryEvents], async () => {
    const rawId = await db.invoiceDeliveries.add(record);
    if (rawId == null) throw new Error('createDelivery: DB did not return an ID');
    const newId = rawId as number;
    await db.deliveryEvents.add({
      status:     'queued',
      source:     'client_estimate' as const,
      detail:     'Delivery record created',
      deliveryId: newId,
      timestamp:  now,
    });
    return newId;
  });

  return id;
}

// ─── Update status ────────────────────────────────────────────────────────────

export interface UpdateStatusOptions {
  source: StatusSource;
  detail?: string;
  messageId?: string;
  failureReason?: string;
  failureCode?: string;
  metadata?: Record<string, unknown>;
}

export async function updateDeliveryStatus(
  id: number,
  status: DeliveryStatus,
  options: UpdateStatusOptions,
): Promise<void> {
  const existing = await db.invoiceDeliveries.get(id);
  if (!existing) throw new Error(`Delivery ${id} not found`);

  const now = new Date().toISOString();
  const event: StatusEvent = { status, source: options.source, timestamp: now, detail: options.detail };

  const patch: Partial<InvoiceDelivery> = {
    status,
    statusSource:  options.source,
    statusHistory: [...existing.statusHistory, event],
    updatedAt:     now,
  };

  if (options.messageId)     patch.messageId     = options.messageId;
  if (options.failureReason) patch.failureReason = options.failureReason;
  if (options.failureCode)   patch.failureCode   = options.failureCode;

  if (status === 'sending') {
    if (!existing.sentAt) patch.sentAt = now;
    patch.idempotencyKey = crypto.randomUUID();
    patch.lastSentAt     = now;
    patch.cooldownUntil  = new Date(Date.now() + RESEND_COOLDOWN_MS).toISOString();
  }
  if (status === 'delivered') patch.deliveredAt = now;
  if (status === 'read')      patch.readAt      = now;
  if (status === 'retrying') {
    patch.retryCount  = existing.retryCount + 1;
    patch.lastRetryAt = now;
  }

  await db.transaction('rw', [db.invoiceDeliveries, db.deliveryEvents], async () => {
    await db.invoiceDeliveries.update(id, patch);
    await db.deliveryEvents.add({
      status,
      source:     options.source,
      detail:     options.detail,
      metadata:   options.metadata,
      deliveryId: id,
      timestamp:  now,
    });
  });
}

// ─── Resend ───────────────────────────────────────────────────────────────────

export async function assertCanResend(id: number): Promise<InvoiceDelivery> {
  const delivery = await db.invoiceDeliveries.get(id);
  if (!delivery) throw new ResendError('invalid_status', `Delivery ${id} not found`);

  const check = checkResend(delivery);
  if (!check.allowed) {
    const messages: Record<ResendErrorCode, string> = {
      cooldown:             `Cooldown active — ${check.cooldownSecondsRemaining}s remaining`,
      duplicate:            'Sent too recently — duplicate suppression active',
      max_retries_exceeded: `Max retries (${delivery.maxRetries}) exceeded`,
      invalid_status:       `Cannot resend from status '${delivery.status}'`,
    };
    const code = check.reason ?? 'invalid_status';
    throw new ResendError(code, messages[code]);
  }

  return delivery;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getDeliveryById(id: number): Promise<InvoiceDelivery | undefined> {
  return db.invoiceDeliveries.get(id);
}

export async function listDeliveriesByInvoice(invoiceNumber: string): Promise<InvoiceDelivery[]> {
  return db.invoiceDeliveries
    .where('invoiceNumber')
    .equals(invoiceNumber)
    .sortBy('createdAt');
}

export async function listRecentDeliveries(limit = 50): Promise<InvoiceDelivery[]> {
  return db.invoiceDeliveries.orderBy('createdAt').reverse().limit(limit).toArray();
}

export async function getDeliveryEventsByDelivery(deliveryId: number): Promise<DeliveryEvent[]> {
  return db.deliveryEvents
    .where('deliveryId')
    .equals(deliveryId)
    .sortBy('timestamp');
}

export async function cancelDelivery(id: number): Promise<void> {
  await updateDeliveryStatus(id, 'cancelled', {
    source: 'user_action',
    detail: 'Cancelled by user',
  });
}
