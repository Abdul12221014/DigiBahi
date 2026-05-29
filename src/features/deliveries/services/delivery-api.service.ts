/**
 * Delivery API Service — HTTP client for the FastAPI backend.
 *
 * Backend endpoints (implement in backend/):
 *   POST   /api/v1/deliveries              — create/sync record
 *   PATCH  /api/v1/deliveries/{id}         — status update (from webhook handler)
 *   POST   /api/v1/deliveries/{id}/resend  — trigger resend
 *   POST   /api/v1/deliveries/{id}/cancel  — cancel pending
 *   POST   /api/v1/webhooks/whatsapp       — Meta delivery/read receipts
 *   POST   /api/v1/audit/otp-events        — OTP event batch sync
 */

import type {
  InvoiceDelivery,
  OTPEvent,
  WhatsAppWebhookPayload,
  WhatsAppWebhookStatusPayload,
} from '../types/delivery.types';

if (!import.meta.env.VITE_API_URL && import.meta.env.PROD) {
  console.error('[delivery-api] VITE_API_URL is not set — backend sync will fail in production');
}

const API_BASE   = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const DELIVERIES = `${API_BASE}/api/v1/deliveries`;

async function request<T>(
  url: string,
  method: 'POST' | 'PATCH',
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export interface SyncDeliveryPayload {
  invoiceNumber:   string;
  customerName:    string;
  customerPhone:   string;
  amount:          number;
  gstAmount:       number;
  totalAmount:     number;
  description:     string;
  date:            string;
  channel:         InvoiceDelivery['channel'];
  channelMetadata?: InvoiceDelivery['channelMetadata'];
  status:          InvoiceDelivery['status'];
  messageId?:      string;
  idempotencyKey:  string;
  pdfFilename?:    string;
}

export interface SyncDeliveryResponse {
  remote_id: string;
  synced_at: string;
}

export async function syncDeliveryToBackend(
  delivery: InvoiceDelivery,
): Promise<SyncDeliveryResponse> {
  const payload: SyncDeliveryPayload = {
    invoiceNumber:   delivery.invoiceNumber,
    customerName:    delivery.customerName,
    customerPhone:   delivery.customerPhone,
    amount:          delivery.amount,
    gstAmount:       delivery.gstAmount,
    totalAmount:     delivery.totalAmount,
    description:     delivery.description,
    date:            delivery.date,
    channel:         delivery.channel,
    channelMetadata: delivery.channelMetadata,
    status:          delivery.status,
    messageId:       delivery.messageId,
    idempotencyKey:  delivery.idempotencyKey,
    pdfFilename:     delivery.pdfFilename,
  };
  return request<SyncDeliveryResponse>(DELIVERIES, 'POST', payload);
}

export interface ResendResponse {
  success:         boolean;
  message:         string;
  new_message_id?: string;
}

export async function requestResend(id: number): Promise<ResendResponse> {
  if (!import.meta.env.VITE_API_URL) {
    return { success: false, message: 'No backend configured — re-share using the invoice form.' };
  }
  return request<ResendResponse>(`${DELIVERIES}/${id}/resend`, 'POST');
}

export async function requestCancel(id: number): Promise<void> {
  await request(`${DELIVERIES}/${id}/cancel`, 'POST');
}

export async function syncOTPEvents(events: OTPEvent[]): Promise<void> {
  await request(`${API_BASE}/api/v1/audit/otp-events`, 'POST', { events });
}

export function extractWebhookStatusUpdates(
  payload: WhatsAppWebhookPayload,
): WhatsAppWebhookStatusPayload[] {
  return payload.entry.flatMap(entry =>
    entry.changes.flatMap(change => change.value.statuses ?? []),
  );
}
