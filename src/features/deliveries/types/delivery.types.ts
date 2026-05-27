// ─── Channel ─────────────────────────────────────────────────────────────────

export type DeliveryChannel =
  | 'whatsapp_api'    // WhatsApp Business Cloud API
  | 'whatsapp_wame'   // wa.me browser link (manual)
  | 'whatsapp_share'  // Web Share API
  | 'email'
  | 'sms'
  | 'portal'
  | 'einvoice';

// ─── Status ──────────────────────────────────────────────────────────────────

export type DeliveryStatus =
  | 'queued'      // created locally, not yet attempted
  | 'sending'     // attempt in progress
  | 'sent'        // channel accepted; no delivery confirmation yet
  | 'delivered'   // channel delivery receipt received
  | 'read'        // read receipt received (WhatsApp only)
  | 'failed'      // terminal; maxRetries exhausted or unrecoverable error
  | 'retrying'    // transient failure; scheduled for retry
  | 'expired'     // TTL elapsed before send (e.g. queued too long)
  | 'cancelled';  // explicitly cancelled

export type StatusSource =
  | 'api_response'    // synchronous response from channel API call
  | 'webhook'         // inbound delivery/read receipt from Meta webhook
  | 'client_estimate' // frontend optimistic update (not yet confirmed)
  | 'retry_worker'    // automatic retry scheduler
  | 'user_action';    // explicit user-initiated action (cancel, manual resend)

// ─── Retry ───────────────────────────────────────────────────────────────────

export type RetryStrategy =
  | 'linear'       // fixed interval between retries
  | 'exponential'  // doubling backoff
  | 'manual';      // only retried by explicit user action

// ─── Events (append-only audit log) ──────────────────────────────────────────

export interface StatusEvent {
  status: DeliveryStatus;
  source: StatusSource;
  timestamp: string;   // ISO 8601
  detail?: string;
}

export interface DeliveryEvent {
  id?: number;
  deliveryId: number;
  status: DeliveryStatus;
  source: StatusSource;
  detail?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

// ─── Channel metadata (future multi-channel abstraction) ─────────────────────

export interface WhatsAppChannelMetadata {
  channel: 'whatsapp_api' | 'whatsapp_wame' | 'whatsapp_share';
  templateName?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
}

export interface EmailChannelMetadata {
  channel: 'email';
  fromAddress?: string;
  subject?: string;
  messageId?: string;
}

export interface SmsChannelMetadata {
  channel: 'sms';
  provider?: string;
  messageId?: string;
}

export type ChannelMetadata =
  | WhatsAppChannelMetadata
  | EmailChannelMetadata
  | SmsChannelMetadata;

// ─── Delivery (snapshot) ─────────────────────────────────────────────────────

export interface InvoiceDelivery {
  id?: number;

  // Invoice context
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;        // E.164 — e.g. +919876543210
  amount: number;
  gstAmount: number;
  totalAmount: number;
  description: string;
  date: string;                 // YYYY-MM-DD

  // Delivery context
  channel: DeliveryChannel;
  channelMetadata?: ChannelMetadata;

  // Current status snapshot
  status: DeliveryStatus;
  statusSource: StatusSource;
  statusHistory: StatusEvent[];

  // API tracking
  messageId?: string;
  failureReason?: string;
  failureCode?: string;

  // Idempotency — rotated on every new send attempt
  idempotencyKey: string;

  // Retry metadata
  retryCount: number;
  maxRetries: number;
  retryStrategy: RetryStrategy;
  lastRetryAt?: string | null;
  nextRetryAt?: string | null;

  // Resend safeguards
  lastSentAt?: string | null;
  cooldownUntil?: string | null;

  // Relations
  ledgerEntryId?: number;
  creditEntryId?: number;

  // File
  pdfFilename?: string;

  // Timestamps
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
  updatedAt: string;

  // Backend sync
  synced_at?: string | null;
  remote_id?: string | null;
}

// ─── OTP Audit ───────────────────────────────────────────────────────────────

export type OTPEventType =
  | 'requested'
  | 'sent'
  | 'verified'
  | 'failed'
  | 'expired'
  | 'resent';

export type OTPChannel =
  | 'whatsapp_api'
  | 'whatsapp_wame'
  | 'sms'
  | 'ui_display';

export interface OTPEvent {
  id?: number;
  eventType: OTPEventType;
  channel: OTPChannel;
  customerPhone: string;         // E.164
  invoiceNumber?: string;
  deliveryId?: number;
  otpFingerprint?: string;       // SHA-256(otp + ':' + phone + ':' + timestamp)
  success: boolean;
  failureReason?: string;
  attemptNumber: number;
  timestamp: string;
  deviceId?: string;
}

// ─── WhatsApp Webhook Payloads ────────────────────────────────────────────────

export type WhatsAppWebhookStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface WhatsAppWebhookStatusPayload {
  id: string;
  status: WhatsAppWebhookStatus;
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
}

export interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: 'whatsapp';
      statuses?: WhatsAppWebhookStatusPayload[];
    };
    field: 'messages';
  }>;
}

export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: WhatsAppWebhookEntry[];
}

// ─── Resend safeguards ────────────────────────────────────────────────────────

export type ResendErrorCode =
  | 'cooldown'
  | 'duplicate'
  | 'max_retries_exceeded'
  | 'invalid_status';

export interface ResendCheckResult {
  allowed: boolean;
  reason?: ResendErrorCode;
  cooldownUntil?: string;
  cooldownSecondsRemaining?: number;
}
