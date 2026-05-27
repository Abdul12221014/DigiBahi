# Communication Delivery Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade, channel-agnostic communication delivery tracking infrastructure with immutable event history, idempotency protection, retry safeguards, resend workflows, OTP audit logging, and WhatsApp webhook readiness — deployed on a consolidated Dexie schema that is backend-authoritative by design.

**Architecture:** Four phases — Foundation → Infrastructure → Workflow Integration → Hardening. Dexie acts as offline cache + optimistic UI; `invoiceDeliveries` holds the current-state snapshot; `deliveryEvents` is an append-only immutable audit log (the source of truth for history). Delivery records flow: created locally (queued) → synced to FastAPI backend → webhook receipts patch status from backend → UI reflects live state. The legacy `digbahi_ledger` Dexie database is one-time-migrated into the main `digbahi` DB on first boot.

**Tech Stack:** TypeScript, Dexie v3 (IndexedDB), Vitest + fake-indexeddb, React + Shadcn UI, WhatsApp Business API Cloud API v22+

---

## Phased Execution Map

| Phase | Tasks | Goal |
|---|---|---|
| **1 — Foundation** | 1–4 | Types, E.164, DB schema |
| **2 — Infrastructure** | 5–8 | Services, safeguards, migration |
| **3 — Workflow Integration** | 9–10 | Wire into app + WhatsApp share |
| **4 — Hardening & Testing** | 11–13 | Hook, UI, full test suite |

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| **Create** | `src/features/deliveries/types/delivery.types.ts` | All delivery domain types inc. status source, retry strategy, channel metadata |
| **Create** | `src/features/deliveries/services/delivery.service.ts` | Dexie CRUD: snapshots + append-only events + resend safeguards |
| **Create** | `src/features/deliveries/services/delivery-api.service.ts` | Backend HTTP, resend, webhook payload parsing |
| **Create** | `src/features/deliveries/services/otp-event.service.ts` | OTP audit log (fingerprint hash, never raw OTP) |
| **Create** | `src/features/deliveries/services/__tests__/delivery.service.test.ts` | Delivery service unit tests |
| **Create** | `src/features/deliveries/services/__tests__/otp-event.service.test.ts` | OTP event service unit tests |
| **Create** | `src/features/deliveries/hooks/useDeliveryHistory.ts` | React hook: list, filter, resend with safeguards |
| **Create** | `src/features/deliveries/hooks/__tests__/useDeliveryHistory.test.ts` | Hook unit tests |
| **Create** | `src/features/deliveries/components/DeliveryHistoryPanel.tsx` | Table UI: status badges, channel icons, resend |
| **Create** | `src/features/deliveries/components/ResendButton.tsx` | Resend with cooldown display + confirm dialog |
| **Create** | `src/features/deliveries/index.ts` | Barrel export |
| **Create** | `src/lib/db-migrate-ledger.ts` | One-time migration: digbahi_ledger → digbahi.ledger |
| **Create** | `src/lib/__tests__/db-migrate-ledger.test.ts` | Migration tests |
| **Create** | `src/lib/__tests__/countryCode.test.ts` | E.164 formatter tests |
| **Modify** | `src/lib/db.ts` | v14: invoiceDeliveries + deliveryEvents + otpEvents |
| **Modify** | `src/lib/countryCode.ts` | Add toE164(), parseE164() |
| **Modify** | `src/features/payments/WhatsAppShare.tsx` | Write delivery + OTP events; E.164 storage; idempotency |
| **Modify** | `src/features/payments/services/whatsapp-api.service.ts` | WhatsApp webhook payload types |
| **Modify** | `src/main.tsx` | Boot: migrateLegacyLedgerDB() |

---

# PHASE 1 — FOUNDATION

---

## Task 1: Install fake-indexeddb

**Files:** `package.json`

- [ ] **Step 1: Install**

```bash
cd /Users/abdulkadir/DIGBAHI_ACCOUNTING/digi-bahi-ink
npm install --save-dev fake-indexeddb
```

Expected: `fake-indexeddb` appears in `devDependencies`.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add fake-indexeddb for Dexie unit tests"
```

---

## Task 2: Add E.164 utilities to countryCode.ts

**Files:**
- Modify: `src/lib/countryCode.ts`
- Create: `src/lib/__tests__/countryCode.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/countryCode.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { toE164, parseE164, COUNTRIES } from '../countryCode';

describe('toE164', () => {
  it('formats a 10-digit Indian number', () => {
    expect(toE164('9876543210', '91')).toBe('+919876543210');
  });

  it('strips leading zeros', () => {
    expect(toE164('09876543210', '91')).toBe('+919876543210');
  });

  it('handles UAE 9-digit number', () => {
    expect(toE164('501234567', '971')).toBe('+971501234567');
  });

  it('strips non-digit characters', () => {
    expect(toE164('98765-43210', '91')).toBe('+919876543210');
  });

  it('returns empty string for empty input', () => {
    expect(toE164('', '91')).toBe('');
  });
});

describe('parseE164', () => {
  it('parses an Indian E.164 number', () => {
    expect(parseE164('+919876543210', COUNTRIES)).toEqual({
      dialCode: '91',
      localPhone: '9876543210',
    });
  });

  it('parses a UAE E.164 number', () => {
    expect(parseE164('+971501234567', COUNTRIES)).toEqual({
      dialCode: '971',
      localPhone: '501234567',
    });
  });

  it('returns null without leading +', () => {
    expect(parseE164('919876543210', COUNTRIES)).toBeNull();
  });

  it('returns null for unrecognised dial code', () => {
    expect(parseE164('+9991234567', COUNTRIES)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseE164('', COUNTRIES)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/lib/__tests__/countryCode.test.ts
```

Expected: `toE164 is not a function`.

- [ ] **Step 3: Add utilities to countryCode.ts**

Append after the `formatPhoneDisplay` function in `src/lib/countryCode.ts`:

```typescript
/**
 * Convert a local phone number to E.164 format.
 * toE164('9876543210', '91') → '+919876543210'
 * Returns empty string if localPhone is empty.
 */
export function toE164(localPhone: string, dialCode: string): string {
  if (!localPhone) return '';
  const clean = localPhone.replace(/\D/g, '').replace(/^0+/, '');
  return `+${dialCode}${clean}`;
}

/**
 * Parse an E.164 string into dialCode + localPhone using the known country list.
 * Matches longest dial code first to avoid '1' shadowing '91'.
 * Returns null if the string is not a recognised E.164 number.
 */
export function parseE164(
  e164: string,
  countries: Country[],
): { dialCode: string; localPhone: string } | null {
  if (!e164.startsWith('+')) return null;
  const digits = e164.slice(1);
  const sorted = [...countries].sort((a, b) => b.dialCode.length - a.dialCode.length);
  for (const country of sorted) {
    if (digits.startsWith(country.dialCode)) {
      return { dialCode: country.dialCode, localPhone: digits.slice(country.dialCode.length) };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/lib/__tests__/countryCode.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/countryCode.ts src/lib/__tests__/countryCode.test.ts
git commit -m "feat(lib): add toE164 and parseE164 to countryCode"
```

---

## Task 3: Define delivery domain types

**Files:**
- Create: `src/features/deliveries/types/delivery.types.ts`

- [ ] **Step 1: Create the types file**

Create `src/features/deliveries/types/delivery.types.ts`:

```typescript
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

/**
 * Who or what set this status — critical for distinguishing optimistic
 * client updates from authoritative server/webhook confirmations.
 */
export type StatusSource =
  | 'api_response'    // synchronous response from channel API call
  | 'webhook'         // inbound delivery/read receipt from Meta webhook
  | 'client_estimate' // frontend optimistic update (not yet confirmed)
  | 'retry_worker';   // automatic retry scheduler

// ─── Retry ───────────────────────────────────────────────────────────────────

export type RetryStrategy =
  | 'linear'       // fixed interval between retries
  | 'exponential'  // doubling backoff
  | 'manual';      // only retried by explicit user action

// ─── Events (append-only audit log) ──────────────────────────────────────────

/**
 * Denormalised snapshot inside InvoiceDelivery.statusHistory.
 * The authoritative append-only record lives in the deliveryEvents table.
 */
export interface StatusEvent {
  status: DeliveryStatus;
  source: StatusSource;
  timestamp: string;   // ISO 8601
  detail?: string;     // human-readable reason, messageId, or error code
}

/**
 * Immutable append-only record — one row per status transition.
 * Never updated; only inserted. Backend is authoritative.
 * Dexie copy is a local cache for offline history rendering.
 */
export interface DeliveryEvent {
  id?: number;
  deliveryId: number;             // FK → invoiceDeliveries.id
  status: DeliveryStatus;
  source: StatusSource;
  detail?: string;
  metadata?: Record<string, unknown>;  // channel-specific data (messageId, errorCode, etc.)
  timestamp: string;              // ISO 8601
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
  amount: number;               // base (pre-GST)
  gstAmount: number;
  totalAmount: number;
  description: string;
  date: string;                 // YYYY-MM-DD

  // Delivery context
  channel: DeliveryChannel;
  channelMetadata?: ChannelMetadata;

  // Current status snapshot (deliveryEvents table is authoritative for history)
  status: DeliveryStatus;
  statusSource: StatusSource;
  statusHistory: StatusEvent[];  // denormalised cache of deliveryEvents for fast Dexie reads

  // API tracking
  messageId?: string;            // channel message_id (WhatsApp message_id etc.)
  failureReason?: string;
  failureCode?: string;          // raw API error code e.g. "132001"

  // Idempotency — rotated on every new send attempt to prevent duplicate messages
  idempotencyKey: string;        // UUID v4

  // Retry metadata
  retryCount: number;
  maxRetries: number;
  retryStrategy: RetryStrategy;
  lastRetryAt?: string | null;   // ISO — last retry attempt timestamp
  nextRetryAt?: string | null;   // ISO — scheduled next retry

  // Resend safeguards
  lastSentAt?: string | null;    // ISO — last actual send attempt (for duplicate suppression)
  cooldownUntil?: string | null; // ISO — resend blocked until this time

  // Relations
  ledgerEntryId?: number;
  creditEntryId?: number;

  // File
  pdfFilename?: string;

  // Timestamps
  sentAt?: string;               // ISO — first send attempt
  deliveredAt?: string;          // ISO — delivery receipt
  readAt?: string;               // ISO — read receipt
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
  // SHA-256(otp + ':' + phone + ':' + timestamp) — NEVER the raw OTP
  otpFingerprint?: string;
  success: boolean;
  failureReason?: string;
  attemptNumber: number;
  timestamp: string;
  deviceId?: string;
}

// ─── WhatsApp Webhook Payloads ────────────────────────────────────────────────
// Backend receives POST /api/v1/webhooks/whatsapp from Meta.
// Frontend types provided for parsing + testing.

export type WhatsAppWebhookStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface WhatsAppWebhookStatusPayload {
  id: string;              // WhatsApp message_id
  status: WhatsAppWebhookStatus;
  timestamp: string;       // Unix epoch string
  recipient_id: string;    // E.164
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
  /** ISO timestamp when cooldown lifts — only set when reason === 'cooldown' */
  cooldownUntil?: string;
  /** Seconds remaining on cooldown — only set when reason === 'cooldown' */
  cooldownSecondsRemaining?: number;
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit --project tsconfig.app.json 2>&1 | head -20
```

Expected: no errors from the new file.

- [ ] **Step 3: Commit**

```bash
git add src/features/deliveries/types/delivery.types.ts
git commit -m "feat(deliveries): channel-agnostic delivery types with status source, retry strategy, idempotency, resend safeguards"
```

---

## Task 4: DB v14 — three new tables

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add imports**

At the top of `src/lib/db.ts`, append to the existing import block:

```typescript
import type { InvoiceDelivery, DeliveryEvent, OTPEvent } from '@/features/deliveries/types/delivery.types';
```

- [ ] **Step 2: Declare tables on DigBahiDB**

Inside the `DigBahiDB` class body, after the `offlineQueue!:` line add:

```typescript
  invoiceDeliveries!: Table<InvoiceDelivery>;
  deliveryEvents!:    Table<DeliveryEvent>;
  otpEvents!:         Table<OTPEvent>;
```

- [ ] **Step 3: Add version 14**

After the closing `});` of the v13 block, add:

```typescript
    // v14: Communication delivery infrastructure.
    //   invoiceDeliveries — channel-agnostic snapshot of current delivery state.
    //   deliveryEvents    — append-only immutable status transition log (backend-authoritative).
    //   otpEvents         — OTP lifecycle audit (fingerprint hash; raw OTP never stored).
    this.version(14).stores({
      users:                '++id, username, email, phone, role, isActive',
      ledger:               '++id, date, type, party_name, customer_id, synced_at, created_by',
      gstRecords:           '++id, ledgerId, status, createdAt',
      upiIntents:           'id, upiId, status, createdAt',
      syncQueue:            'id, txnRef, timestamp',
      items:                '++id, nameKey, sku, gstRate, unit, createdAt',
      stockTxns:            '++id, itemId, date, refLedgerId, type',
      companySettings:      '++id',
      customerContacts:     '++id, phone, name, synced_at, remote_id',
      creditEntries:        '++id, invoiceNumber, customerPhone, status',
      analyticsEvents:      '++id, name, synced, timestamp, session_id',
      loginAttempts:        '++id, userId, timestamp, success',
      auditLog:             '++id, userId, timestamp, action',
      gstInvoices:          '++id, &invoiceNumber, ledgerId, returnPeriod, invoiceType, validationStatus, filingStatus, buyerGstin, isDeleted, created_by',
      gstValidations:       '++id, gstInvoiceId, ruleCode, severity, fixedAt',
      offlineQueue:         '&id, type, createdAt',
      invoiceDeliveries:    '++id, invoiceNumber, customerPhone, channel, status, createdAt, synced_at',
      deliveryEvents:       '++id, deliveryId, status, timestamp',
      otpEvents:            '++id, customerPhone, eventType, timestamp, deliveryId',
    });
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit --project tsconfig.app.json 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat(db): v14 — invoiceDeliveries, deliveryEvents (append-only), otpEvents"
```

---

# PHASE 2 — INFRASTRUCTURE

---

## Task 5: Delivery service — snapshots, events, safeguards

**Files:**
- Create: `src/features/deliveries/services/delivery.service.ts`
- Create: `src/features/deliveries/services/__tests__/delivery.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/deliveries/services/__tests__/delivery.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InvoiceDelivery, StatusEvent, DeliveryEvent } from '../../types/delivery.types';

// ─── Mock db ─────────────────────────────────────────────────────────────────

const mockDeliveries = {
  add:     vi.fn(),
  get:     vi.fn(),
  update:  vi.fn(),
  where:   vi.fn(),
  orderBy: vi.fn(),
};

const mockDeliveryEvents = {
  add:    vi.fn(),
  where:  vi.fn(),
};

vi.mock('@/lib/db', () => ({
  db: {
    invoiceDeliveries: mockDeliveries,
    deliveryEvents:    mockDeliveryEvents,
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
} from '../delivery.service';
import { ResendError } from '../delivery.service';

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

    // deliveryEvents append
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
    expect(patch.idempotencyKey).not.toBe('key-abc');  // rotated
  });

  it('sets lastSentAt + cooldownUntil on transition to sending', async () => {
    mockDeliveries.get.mockResolvedValue(makeDelivery({ status: 'queued' }));

    await updateDeliveryStatus(1, 'sending', { source: 'client_estimate' });

    const patch = mockDeliveries.update.mock.calls[0][1] as Partial<InvoiceDelivery>;
    expect(patch.lastSentAt).toBeDefined();
    expect(patch.cooldownUntil).toBeDefined();
    // cooldown should be ~5 min in the future
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
    const recent = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute ago
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
    const past = new Date(Date.now() - 1000).toISOString(); // 1 second ago
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
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/features/deliveries/services/__tests__/delivery.service.test.ts
```

Expected: module not found.

- [ ] **Step 3: Create delivery.service.ts**

Create `src/features/deliveries/services/delivery.service.ts`:

```typescript
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

const RESEND_COOLDOWN_MS       = 5 * 60 * 1000;  // 5 minutes
const DUPLICATE_SUPPRESS_MS    = 2 * 60 * 1000;  // 2 minutes
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

  if (delivery.lastSentAt) {
    const elapsed = now - new Date(delivery.lastSentAt).getTime();
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

  const id = await db.invoiceDeliveries.add(record);

  // Append immutable event
  await appendDeliveryEvent(id as number, {
    status:   'queued',
    source:   'client_estimate',
    detail:   'Delivery record created',
  });

  return id as number;
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
    statusSource:   options.source,
    statusHistory:  [...existing.statusHistory, event],
    updatedAt:      now,
  };

  if (options.messageId)    patch.messageId    = options.messageId;
  if (options.failureReason) patch.failureReason = options.failureReason;
  if (options.failureCode)  patch.failureCode  = options.failureCode;

  // Transition-specific fields
  if (status === 'sending') {
    if (!existing.sentAt) patch.sentAt = now;
    // Rotate idempotency key for each new send attempt
    patch.idempotencyKey = crypto.randomUUID();
    // Set resend safeguard fields
    patch.lastSentAt    = now;
    patch.cooldownUntil = new Date(Date.now() + RESEND_COOLDOWN_MS).toISOString();
  }
  if (status === 'delivered') patch.deliveredAt = now;
  if (status === 'read')      patch.readAt      = now;
  if (status === 'retrying') {
    patch.retryCount  = existing.retryCount + 1;
    patch.lastRetryAt = now;
  }

  await db.invoiceDeliveries.update(id, patch);

  // Append immutable event (never updates existing rows)
  await appendDeliveryEvent(id, {
    status,
    source:   options.source,
    detail:   options.detail,
    metadata: options.metadata,
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
    throw new ResendError(check.reason!, messages[check.reason!]);
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
    source: 'client_estimate',
    detail: 'Cancelled by user',
  });
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/features/deliveries/services/__tests__/delivery.service.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/deliveries/services/delivery.service.ts \
        src/features/deliveries/services/__tests__/delivery.service.test.ts
git commit -m "feat(deliveries): delivery service with append-only events, idempotency, resend safeguards"
```

---

## Task 6: OTP event service

**Files:**
- Create: `src/features/deliveries/services/otp-event.service.ts`
- Create: `src/features/deliveries/services/__tests__/otp-event.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/deliveries/services/__tests__/otp-event.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OTPEvent } from '../../types/delivery.types';

const mockOtpEvents = { add: vi.fn() };
vi.mock('@/lib/db', () => ({ db: { otpEvents: mockOtpEvents } }));

import { logOTPEvent, hashOTPFingerprint } from '../otp-event.service';

beforeEach(() => {
  vi.clearAllMocks();
  mockOtpEvents.add.mockResolvedValue(1);
});

describe('hashOTPFingerprint', () => {
  it('returns a 64-char lowercase hex SHA-256 string', async () => {
    const hash = await hashOTPFingerprint('123456', '+919876543210', '2026-05-27T10:00:00.000Z');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('produces different hashes for different OTP values', async () => {
    const ts = '2026-05-27T10:00:00.000Z';
    const phone = '+919876543210';
    const h1 = await hashOTPFingerprint('111111', phone, ts);
    const h2 = await hashOTPFingerprint('222222', phone, ts);
    expect(h1).not.toBe(h2);
  });

  it('never includes the raw OTP in its output', async () => {
    const otp = '987654';
    const hash = await hashOTPFingerprint(otp, '+919876543210', '2026-05-27T10:00:00.000Z');
    expect(hash).not.toContain(otp);
  });
});

describe('logOTPEvent', () => {
  it('stores a fingerprint when rawOTP is provided — raw OTP never in record', async () => {
    await logOTPEvent({
      eventType: 'sent',
      channel: 'whatsapp_api',
      customerPhone: '+919876543210',
      success: true,
      attemptNumber: 1,
      rawOTP: '123456',
    });

    const stored = mockOtpEvents.add.mock.calls[0][0] as OTPEvent;
    expect(stored.otpFingerprint).toHaveLength(64);
    expect(JSON.stringify(stored)).not.toContain('123456');
  });

  it('stores no fingerprint when rawOTP is omitted', async () => {
    await logOTPEvent({
      eventType: 'verified',
      channel: 'whatsapp_api',
      customerPhone: '+919876543210',
      success: true,
      attemptNumber: 1,
    });

    const stored = mockOtpEvents.add.mock.calls[0][0] as OTPEvent;
    expect(stored.otpFingerprint).toBeUndefined();
    expect(stored.eventType).toBe('verified');
  });

  it('stores failure reason on failed events', async () => {
    await logOTPEvent({
      eventType: 'failed',
      channel: 'whatsapp_api',
      customerPhone: '+919876543210',
      success: false,
      attemptNumber: 2,
      failureReason: 'invalid_otp',
    });

    const stored = mockOtpEvents.add.mock.calls[0][0] as OTPEvent;
    expect(stored.success).toBe(false);
    expect(stored.failureReason).toBe('invalid_otp');
    expect(stored.attemptNumber).toBe(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/features/deliveries/services/__tests__/otp-event.service.test.ts
```

- [ ] **Step 3: Create otp-event.service.ts**

Create `src/features/deliveries/services/otp-event.service.ts`:

```typescript
import { db } from '@/lib/db';
import type { OTPEvent, OTPEventType, OTPChannel } from '../types/delivery.types';

export async function hashOTPFingerprint(
  otp: string,
  phone: string,
  timestamp: string,
): Promise<string> {
  const data = `${otp}:${phone}:${timestamp}`;
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

interface LogOTPEventInput {
  eventType:     OTPEventType;
  channel:       OTPChannel;
  customerPhone: string;     // E.164
  invoiceNumber?: string;
  deliveryId?:   number;
  rawOTP?:       string;     // hashed before storage — NEVER persisted
  success:       boolean;
  failureReason?: string;
  attemptNumber: number;
  deviceId?:     string;
}

export async function logOTPEvent(input: LogOTPEventInput): Promise<number> {
  const timestamp = new Date().toISOString();

  const otpFingerprint = input.rawOTP
    ? await hashOTPFingerprint(input.rawOTP, input.customerPhone, timestamp)
    : undefined;

  const event: OTPEvent = {
    eventType:      input.eventType,
    channel:        input.channel,
    customerPhone:  input.customerPhone,
    invoiceNumber:  input.invoiceNumber,
    deliveryId:     input.deliveryId,
    otpFingerprint,
    success:        input.success,
    failureReason:  input.failureReason,
    attemptNumber:  input.attemptNumber,
    timestamp,
    deviceId:       input.deviceId,
  };

  return db.otpEvents.add(event);
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/features/deliveries/services/__tests__/otp-event.service.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/features/deliveries/services/otp-event.service.ts \
        src/features/deliveries/services/__tests__/otp-event.service.test.ts
git commit -m "feat(deliveries): OTP audit service — SHA-256 fingerprint, never raw OTP"
```

---

## Task 7: Legacy ledger DB migration

**Files:**
- Create: `src/lib/db-migrate-ledger.ts`
- Create: `src/lib/__tests__/db-migrate-ledger.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/db-migrate-ledger.test.ts`:

```typescript
// Must be the first import — polyfills IndexedDB before any Dexie instantiation.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { DigBahiDB } from '../db';
import { migrateLegacyLedgerDB } from '../db-migrate-ledger';

type LegacyEntry = {
  id?: number;
  date: string;
  description: string;
  amount: number;
  type: string;
  synced: 0 | 1;
  createdAt: number;
};

async function openLegacy() {
  const db = new Dexie('digbahi_ledger') as Dexie & { entries: Dexie.Table<LegacyEntry> };
  db.version(2).stores({ entries: '++id, date, type, synced, createdAt' });
  return db;
}

async function cleanAll() {
  await Dexie.delete('digbahi');
  await Dexie.delete('digbahi_ledger');
  localStorage.removeItem('digbahi_ledger_migrated');
}

beforeEach(cleanAll);
afterEach(cleanAll);

describe('migrateLegacyLedgerDB', () => {
  it('returns 0 when legacy DB does not exist', async () => {
    const main = new DigBahiDB();
    expect(await migrateLegacyLedgerDB(main)).toBe(0);
    await main.close();
  });

  it('migrates entries and maps fields correctly', async () => {
    const legacy = await openLegacy();
    await legacy.entries.add({
      date: '2026-01-15', description: 'Test sale',
      amount: 500, type: 'sale', synced: 1, createdAt: 1737000000000,
    });
    await legacy.close();

    const main = new DigBahiDB();
    const count = await migrateLegacyLedgerDB(main);

    expect(count).toBe(1);
    const entries = await main.ledger.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      description: 'Test sale',
      amount: 500,
      type: 'sale',
      is_active: true,
      gstRate: 0,
    });
    expect(entries[0].synced_at).not.toBeNull();
    await main.close();
  });

  it('does not duplicate entries already present in main DB', async () => {
    const legacy = await openLegacy();
    await legacy.entries.add({
      date: '2026-01-15', description: 'Test sale',
      amount: 500, type: 'sale', synced: 1, createdAt: 1737000000000,
    });
    await legacy.close();

    const main = new DigBahiDB();
    await main.ledger.add({
      date: '2026-01-15', description: 'Test sale', amount: 500, type: 'sale',
      gstRate: 0, gstAmount: 0, created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), is_active: true, synced_at: null,
    });

    expect(await migrateLegacyLedgerDB(main)).toBe(0);
    expect(await main.ledger.count()).toBe(1);
    await main.close();
  });

  it('sets the migration flag after running', async () => {
    const main = new DigBahiDB();
    await migrateLegacyLedgerDB(main);
    expect(localStorage.getItem('digbahi_ledger_migrated')).toBe('true');
    await main.close();
  });

  it('is idempotent — skips immediately when flag is set', async () => {
    localStorage.setItem('digbahi_ledger_migrated', 'true');
    const legacy = await openLegacy();
    await legacy.entries.add({
      date: '2026-01-15', description: 'Skip me',
      amount: 100, type: 'expense', synced: 0, createdAt: Date.now(),
    });
    await legacy.close();

    const main = new DigBahiDB();
    expect(await migrateLegacyLedgerDB(main)).toBe(0);
    expect(await main.ledger.count()).toBe(0);
    await main.close();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/lib/__tests__/db-migrate-ledger.test.ts
```

- [ ] **Step 3: Create db-migrate-ledger.ts**

Create `src/lib/db-migrate-ledger.ts`:

```typescript
import Dexie from 'dexie';
import { db as defaultDB, DigBahiDB, type LedgerEntry } from './db';

const MIGRATION_FLAG = 'digbahi_ledger_migrated';

interface LegacyEntry {
  id?: number;
  date: string;
  description: string;
  amount: number;
  type: 'sale' | 'purchase' | 'expense' | 'receipt';
  synced?: 0 | 1;
  createdAt: number; // epoch ms
}

/**
 * One-time migration: copy entries from the legacy `digbahi_ledger` IndexedDB
 * into the main `digbahi.ledger` table.
 *
 * Idempotent — gated by localStorage flag. Safe to call on every boot.
 *
 * @param targetDB Injected for testing; defaults to the production singleton.
 * @returns Number of new entries written (0 if already done or nothing to migrate).
 */
export async function migrateLegacyLedgerDB(targetDB: DigBahiDB = defaultDB): Promise<number> {
  if (localStorage.getItem(MIGRATION_FLAG)) return 0;

  const legacyDB = new Dexie('digbahi_ledger') as Dexie & {
    entries: Dexie.Table<LegacyEntry>;
  };
  legacyDB.version(2).stores({ entries: '++id, date, type, synced, createdAt' });

  let migrated = 0;

  try {
    const legacyEntries = await legacyDB.table('entries').toArray() as LegacyEntry[];
    if (legacyEntries.length === 0) return 0;

    const existing = await targetDB.ledger.toArray();
    const seen = new Set(existing.map(e => `${e.date}|${e.amount}|${e.description}`));

    const toAdd: Omit<LedgerEntry, 'id'>[] = legacyEntries
      .filter(e => !seen.has(`${e.date}|${e.amount}|${e.description}`))
      .map(e => ({
        date:        e.date,
        description: e.description,
        amount:      e.amount,
        type:        e.type,
        gstRate:     0,
        gstAmount:   0,
        created_at:  new Date(e.createdAt).toISOString(),
        updated_at:  new Date(e.createdAt).toISOString(),
        is_active:   true,
        synced_at:   e.synced === 1 ? new Date(e.createdAt).toISOString() : null,
        remote_id:   null,
      }));

    if (toAdd.length > 0) {
      await targetDB.ledger.bulkAdd(toAdd as LedgerEntry[]);
      migrated = toAdd.length;
    }
  } catch {
    // Legacy DB absent on fresh installs — expected and safe.
  } finally {
    legacyDB.close();
    localStorage.setItem(MIGRATION_FLAG, 'true');
  }

  return migrated;
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/lib/__tests__/db-migrate-ledger.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/db-migrate-ledger.ts src/lib/__tests__/db-migrate-ledger.test.ts
git commit -m "feat(db): one-time idempotent migration from legacy digbahi_ledger"
```

---

## Task 8: Backend delivery API service + webhook types

**Files:**
- Create: `src/features/deliveries/services/delivery-api.service.ts`

- [ ] **Step 1: Create the service**

Create `src/features/deliveries/services/delivery-api.service.ts`:

```typescript
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

const API_BASE      = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const DELIVERIES    = `${API_BASE}/api/v1/deliveries`;

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

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

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SyncDeliveryResponse {
  remote_id: string;
  synced_at: string;
}

/** Push a locally-created delivery to the backend; returns its remote_id. */
export async function syncDeliveryToBackend(
  delivery: InvoiceDelivery,
): Promise<SyncDeliveryResponse> {
  return request<SyncDeliveryResponse>(DELIVERIES, 'POST', delivery);
}

export interface ResendResponse {
  success:        boolean;
  message:        string;
  new_message_id?: string;
}

/**
 * Ask the backend to resend a delivery.
 * The backend is responsible for all channel-level rate limiting beyond
 * what the frontend already checked via checkResend().
 */
export async function requestResend(id: number): Promise<ResendResponse> {
  return request<ResendResponse>(`${DELIVERIES}/${id}/resend`, 'POST');
}

/** Cancel a queued delivery on the backend. */
export async function requestCancel(id: number): Promise<void> {
  await request(`${DELIVERIES}/${id}/cancel`, 'POST');
}

/** Batch-sync OTP audit events to the backend. */
export async function syncOTPEvents(events: OTPEvent[]): Promise<void> {
  await request(`${API_BASE}/api/v1/audit/otp-events`, 'POST', { events });
}

// ─── Webhook payload utilities ────────────────────────────────────────────────

/**
 * Extract flat status-update records from a Meta webhook payload.
 * Used by the FastAPI backend handler; provided here for frontend testing
 * and any future PWA relay scenario.
 */
export function extractWebhookStatusUpdates(
  payload: WhatsAppWebhookPayload,
): WhatsAppWebhookStatusPayload[] {
  return payload.entry.flatMap(entry =>
    entry.changes.flatMap(change => change.value.statuses ?? []),
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit --project tsconfig.app.json 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/features/deliveries/services/delivery-api.service.ts
git commit -m "feat(deliveries): backend API service — sync, resend, cancel, webhook parser"
```

---

# PHASE 3 — WORKFLOW INTEGRATION

---

## Task 9: Wire migration into app startup

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Read the current file**

```bash
cat -n /Users/abdulkadir/DIGBAHI_ACCOUNTING/digi-bahi-ink/src/main.tsx
```

- [ ] **Step 2: Add migration import**

After the last existing import in `src/main.tsx`, add:

```typescript
import { migrateLegacyLedgerDB } from './lib/db-migrate-ledger';
```

- [ ] **Step 3: Add boot call**

Before `ReactDOM.createRoot(...)` add:

```typescript
// One-time idempotent migration: digbahi_ledger → digbahi.
// Gated by localStorage flag; subsequent calls return 0 immediately.
migrateLegacyLedgerDB().catch(console.error);
```

- [ ] **Step 4: TypeScript check + commit**

```bash
npx tsc --noEmit --project tsconfig.app.json 2>&1 | head -10
git add src/main.tsx
git commit -m "feat: run legacy ledger migration on app boot"
```

---

## Task 10: Instrument WhatsAppShare — deliveries + OTP events + E.164

**Files:**
- Modify: `src/features/payments/WhatsAppShare.tsx`

Read the file before editing:

```bash
cat -n /Users/abdulkadir/DIGBAHI_ACCOUNTING/digi-bahi-ink/src/features/payments/WhatsAppShare.tsx | head -30
```

- [ ] **Step 1: Add imports**

After the last existing import, add:

```typescript
import { createDelivery, updateDeliveryStatus } from '@/features/deliveries/services/delivery.service';
import { logOTPEvent }  from '@/features/deliveries/services/otp-event.service';
import { toE164 }       from '@/lib/countryCode';
import { db }           from '@/lib/db';
```

- [ ] **Step 2: Add deliveryId state**

After `const [localOtpAttempts, setLocalOtpAttempts] = useState(0);` add:

```typescript
  const [activeDeliveryId, setActiveDeliveryId] = useState<number | null>(null);
```

- [ ] **Step 3: Instrument handleRequestOTP**

At the very start of `handleRequestOTP`, after the `setShowOTP(true)...` block and the `analytics.track` call, add:

```typescript
    const e164Phone = toE164(customerPhone, country.dialCode);

    await logOTPEvent({
      eventType: 'requested', channel: 'whatsapp_api',
      customerPhone: e164Phone, success: true, attemptNumber: 1,
    }).catch(console.error);
```

Inside the `if (result.success)` branch, after `toast.success(...)`:

```typescript
        await logOTPEvent({
          eventType: 'sent', channel: 'whatsapp_api',
          customerPhone: e164Phone, rawOTP: result.otp_code,
          success: true, attemptNumber: 1,
        }).catch(console.error);
```

In the wa.me fallback branch after `setOtpSent(true)` (window opened successfully):

```typescript
          await logOTPEvent({
            eventType: 'sent', channel: 'whatsapp_wame',
            customerPhone: e164Phone, rawOTP: newOTP,
            success: true, attemptNumber: 1,
          }).catch(console.error);
```

In the UI display fallback after `setShowOTPInUI(true)`:

```typescript
        await logOTPEvent({
          eventType: 'sent', channel: 'ui_display',
          customerPhone: e164Phone, rawOTP: newOTP,
          success: true, attemptNumber: 1,
        }).catch(console.error);
```

- [ ] **Step 4: Instrument handleVerifyOTP**

After each `analytics.track('otp_verified', ...)` call:

```typescript
          await logOTPEvent({
            eventType: 'verified', channel: 'whatsapp_api',
            customerPhone: toE164(customerPhone, country.dialCode),
            success: true, attemptNumber: localOtpAttempts + 1,
            deliveryId: activeDeliveryId ?? undefined,
          }).catch(console.error);
```

After each `toast.error('Invalid OTP...')` / `setLocalOtpAttempts(a => a + 1)` call:

```typescript
          await logOTPEvent({
            eventType: 'failed', channel: 'whatsapp_wame',
            customerPhone: toE164(customerPhone, country.dialCode),
            success: false, failureReason: 'invalid_otp',
            attemptNumber: localOtpAttempts + 1,
            deliveryId: activeDeliveryId ?? undefined,
          }).catch(console.error);
```

- [ ] **Step 5: Instrument handleShare — create delivery record**

At the start of the `try` block in `handleShare` (after the `setShareStatus('generating')` line), before `const currentAmountNum = ...`, add:

```typescript
      // Create delivery record (queued) before attempting share
      const e164Phone = toE164(customerPhone, country.dialCode);
      let localDeliveryId: number | null = null;
      try {
        localDeliveryId = await createDelivery({
          invoiceNumber: previewNextInvoiceNumber(),
          customerName:  customerName.trim(),
          customerPhone: e164Phone,
          amount:        parseFloat(amount) || 0,
          gstAmount:     0,
          totalAmount:   0,
          description:   description.trim(),
          date,
          channel:       'whatsapp_api',
        });
        setActiveDeliveryId(localDeliveryId);
      } catch (deliveryErr) {
        console.error('Failed to create delivery record:', deliveryErr);
      }
```

After the PDF is successfully generated (`pdfBlob` is assigned), add:

```typescript
      // Transition to sending — rotates idempotency key
      if (localDeliveryId !== null) {
        await updateDeliveryStatus(localDeliveryId, 'sending', {
          source: 'client_estimate',
          detail: `PDF generated: Invoice_${invoiceNumToUse}.pdf`,
        }).catch(console.error);
        await db.invoiceDeliveries.update(localDeliveryId, {
          gstAmount:    currentGstCalculation.gstAmount,
          totalAmount:  currentGstCalculation.totalAmount,
          invoiceNumber: invoiceNumToUse,
          pdfFilename:  `Invoice_${invoiceNumToUse}.pdf`,
        }).catch(console.error);
      }
```

After `toast.success('Invoice shared successfully!')`:

```typescript
      if (localDeliveryId !== null) {
        await updateDeliveryStatus(localDeliveryId, 'sent', {
          source: 'client_estimate',
          detail: 'Shared via WhatsApp',
        }).catch(console.error);
      }
```

In the outer `catch` block, before `toast.error('Failed to share invoice')`:

```typescript
      if (localDeliveryId !== null) {
        await updateDeliveryStatus(localDeliveryId, 'failed', {
          source:        'client_estimate',
          failureReason: error instanceof Error ? error.message : 'Unknown error',
        }).catch(console.error);
      }
```

- [ ] **Step 6: Link creditEntryId to delivery**

In the `if (paymentMethod === 'credit')` block, capture the credit entry ID returned by `createCreditEntry` and link it:

```typescript
          const creditId = await createCreditEntry({ ... }); // already exists — capture return value
          if (localDeliveryId !== null) {
            await db.invoiceDeliveries.update(localDeliveryId, { creditEntryId: creditId })
              .catch(console.error);
          }
```

- [ ] **Step 7: Reset deliveryId on form reset**

After `setOtpCopied(false);` in the form reset block:

```typescript
      setActiveDeliveryId(null);
```

- [ ] **Step 8: TypeScript check**

```bash
npx tsc --noEmit --project tsconfig.app.json 2>&1 | head -30
```

Fix any type errors before proceeding.

- [ ] **Step 9: Commit**

```bash
git add src/features/payments/WhatsAppShare.tsx
git commit -m "feat(payments): instrument WhatsAppShare with delivery records + OTP audit events"
```

---

# PHASE 4 — HARDENING & TESTING

---

## Task 11: useDeliveryHistory hook with resend safeguard enforcement

**Files:**
- Create: `src/features/deliveries/hooks/useDeliveryHistory.ts`
- Create: `src/features/deliveries/hooks/__tests__/useDeliveryHistory.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/deliveries/hooks/__tests__/useDeliveryHistory.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { InvoiceDelivery } from '../../types/delivery.types';

const mockListRecent   = vi.fn();
const mockListByInvoice = vi.fn();
const mockCheckResend  = vi.fn();
const mockAssertResend = vi.fn();
const mockUpdateStatus = vi.fn();
const mockApiResend    = vi.fn();

vi.mock('../../services/delivery.service', () => ({
  listRecentDeliveries:   mockListRecent,
  listDeliveriesByInvoice: mockListByInvoice,
  checkResend:            mockCheckResend,
  assertCanResend:        mockAssertResend,
  updateDeliveryStatus:   mockUpdateStatus,
  ResendError:            class ResendError extends Error {
    constructor(public code: string, message: string) { super(message); }
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
  mockCheckResend.mockReturnValue({ allowed: true });
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
    mockAssertResend.mockRejectedValue(
      Object.assign(new Error('Cooldown active'), { name: 'ResendError', code: 'cooldown' }),
    );

    const { result } = renderHook(() => useDeliveryHistory());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.resend(1).catch(() => {});
    });

    expect(result.current.resendError).toBeDefined();
    expect(result.current.resendError?.code).toBe('cooldown');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/features/deliveries/hooks/__tests__/useDeliveryHistory.test.ts
```

- [ ] **Step 3: Create the hook**

Create `src/features/deliveries/hooks/useDeliveryHistory.ts`:

```typescript
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
  deliveries:   InvoiceDelivery[];
  isLoading:    boolean;
  error:        string | null;
  isResending:  boolean;
  resendError:  ResendErrorState | null;
  refresh:      () => void;
  resend:       (id: number) => Promise<void>;
  clearResendError: () => void;
}

export function useDeliveryHistory(
  options: UseDeliveryHistoryOptions = {},
): UseDeliveryHistoryResult {
  const [deliveries,   setDeliveries]  = useState<InvoiceDelivery[]>([]);
  const [isLoading,    setIsLoading]   = useState(true);
  const [error,        setError]       = useState<string | null>(null);
  const [isResending,  setIsResending] = useState(false);
  const [resendError,  setResendError] = useState<ResendErrorState | null>(null);
  const [tick,         setTick]        = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);
  const clearResendError = useCallback(() => setResendError(null), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const fetch = options.invoiceNumber
      ? listDeliveriesByInvoice(options.invoiceNumber)
      : listRecentDeliveries(options.limit ?? 50);

    fetch
      .then(data  => { if (!cancelled) setDeliveries(data); })
      .catch(err  => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [options.invoiceNumber, options.limit, tick]);

  const resend = useCallback(async (id: number) => {
    setIsResending(true);
    setResendError(null);

    try {
      // assertCanResend throws ResendError if safeguard blocks
      await assertCanResend(id);

      // Optimistic: move to queued in local DB
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
      if (err instanceof ResendError) {
        setResendError({ id, code: err.code, message: err.message });
      }
      // Re-throw so callsites can react if needed
      throw err;
    } finally {
      setIsResending(false);
      refresh();
    }
  }, [refresh]);

  return { deliveries, isLoading, error, isResending, resendError, refresh, resend, clearResendError };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/features/deliveries/hooks/__tests__/useDeliveryHistory.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/features/deliveries/hooks/useDeliveryHistory.ts \
        src/features/deliveries/hooks/__tests__/useDeliveryHistory.test.ts
git commit -m "feat(deliveries): useDeliveryHistory hook with ResendError surface and safeguard enforcement"
```

---

## Task 12: UI components — DeliveryHistoryPanel + ResendButton

**Files:**
- Create: `src/features/deliveries/components/ResendButton.tsx`
- Create: `src/features/deliveries/components/DeliveryHistoryPanel.tsx`
- Create: `src/features/deliveries/index.ts`

- [ ] **Step 1: Create ResendButton.tsx**

Create `src/features/deliveries/components/ResendButton.tsx`:

```typescript
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { RefreshCw, Clock } from 'lucide-react';
import { checkResend } from '../services/delivery.service';
import type { InvoiceDelivery } from '../types/delivery.types';

interface ResendButtonProps {
  delivery:    InvoiceDelivery;
  onResend:    (id: number) => Promise<void>;
  isResending?: boolean;
}

export function ResendButton({ delivery, onResend, isResending }: ResendButtonProps) {
  const check = checkResend(delivery);

  if (!check.allowed && check.reason === 'invalid_status') return null;

  if (!check.allowed && check.reason === 'cooldown') {
    const mins = Math.ceil((check.cooldownSecondsRemaining ?? 0) / 60);
    return (
      <Button variant="ghost" size="sm" disabled className="h-8 px-2 text-xs text-muted-foreground">
        <Clock className="w-3 h-3 mr-1" />
        {mins}m cooldown
      </Button>
    );
  }

  if (!check.allowed) {
    return (
      <Button variant="ghost" size="sm" disabled className="h-8 px-2 text-xs">
        <RefreshCw className="w-3 h-3 mr-1" />
        Resend
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isResending}
          className="h-8 px-2 text-xs"
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${isResending ? 'animate-spin' : ''}`} />
          Resend
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Resend delivery?</AlertDialogTitle>
          <AlertDialogDescription>
            This will send the invoice for <strong>{delivery.invoiceNumber}</strong> to{' '}
            <strong>{delivery.customerName}</strong> again via{' '}
            {delivery.channel === 'whatsapp_api' ? 'WhatsApp' : delivery.channel}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onResend(delivery.id!)}>
            Resend
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Create DeliveryHistoryPanel.tsx**

Create `src/features/deliveries/components/DeliveryHistoryPanel.tsx`:

```typescript
import { Badge }    from '@/components/ui/badge';
import { Card }     from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MessageCircle, Mail, Smartphone, Globe, FileText, AlertCircle } from 'lucide-react';
import { useDeliveryHistory }   from '../hooks/useDeliveryHistory';
import { ResendButton }         from './ResendButton';
import type { DeliveryChannel, DeliveryStatus, InvoiceDelivery } from '../types/delivery.types';

// ─── Display maps ─────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<DeliveryStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  queued:    'secondary',
  sending:   'secondary',
  sent:      'default',
  delivered: 'default',
  read:      'default',
  failed:    'destructive',
  retrying:  'secondary',
  expired:   'outline',
  cancelled: 'outline',
};

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  queued:    'Queued',
  sending:   'Sending…',
  sent:      'Sent',
  delivered: 'Delivered',
  read:      'Read',
  failed:    'Failed',
  retrying:  'Retrying',
  expired:   'Expired',
  cancelled: 'Cancelled',
};

const CHANNEL_ICON: Record<DeliveryChannel, React.ReactNode> = {
  whatsapp_api:   <MessageCircle className="w-4 h-4 text-green-600" />,
  whatsapp_wame:  <MessageCircle className="w-4 h-4 text-green-400" />,
  whatsapp_share: <MessageCircle className="w-4 h-4 text-green-300" />,
  email:          <Mail className="w-4 h-4 text-blue-500" />,
  sms:            <Smartphone className="w-4 h-4 text-purple-500" />,
  portal:         <Globe className="w-4 h-4 text-orange-500" />,
  einvoice:       <FileText className="w-4 h-4 text-red-500" />,
};

const CHANNEL_LABEL: Record<DeliveryChannel, string> = {
  whatsapp_api:   'WhatsApp API',
  whatsapp_wame:  'WhatsApp Link',
  whatsapp_share: 'WhatsApp Share',
  email:          'Email',
  sms:            'SMS',
  portal:         'Portal',
  einvoice:       'e-Invoice',
};

function fmt(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function DeliveryRow({
  delivery, onResend, isResending,
}: {
  delivery:   InvoiceDelivery;
  onResend:   (id: number) => Promise<void>;
  isResending: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <div className="flex-shrink-0">{CHANNEL_ICON[delivery.channel]}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{delivery.invoiceNumber}</span>
          <span className="text-xs text-muted-foreground truncate">{delivery.customerName}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
          <span>{CHANNEL_LABEL[delivery.channel]}</span>
          <span>{fmt(delivery.sentAt ?? delivery.createdAt)}</span>
          {delivery.retryCount > 0 && (
            <span className="text-amber-600">{delivery.retryCount} retr{delivery.retryCount === 1 ? 'y' : 'ies'}</span>
          )}
          {delivery.failureReason && (
            <span className="text-destructive truncate max-w-[160px]" title={delivery.failureReason}>
              {delivery.failureReason}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge variant={STATUS_VARIANT[delivery.status]} className="text-xs">
          {STATUS_LABEL[delivery.status]}
        </Badge>
        <ResendButton delivery={delivery} onResend={onResend} isResending={isResending} />
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

interface DeliveryHistoryPanelProps {
  invoiceNumber?: string;
  limit?:         number;
  className?:     string;
}

export function DeliveryHistoryPanel({ invoiceNumber, limit, className }: DeliveryHistoryPanelProps) {
  const {
    deliveries, isLoading, error, isResending,
    resendError, resend, clearResendError,
  } = useDeliveryHistory({ invoiceNumber, limit });

  return (
    <Card className={`p-4 ${className ?? ''}`}>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Delivery History
      </h3>

      {resendError && (
        <Alert variant="destructive" className="mb-3">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{resendError.message}</span>
            <button onClick={clearResendError} className="ml-2 text-xs underline">Dismiss</button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      )}

      {!isLoading && error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {!isLoading && !error && deliveries.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">No deliveries recorded yet.</p>
      )}

      {!isLoading && !error && deliveries.length > 0 && deliveries.map(d => (
        <DeliveryRow key={d.id} delivery={d} onResend={resend} isResending={isResending} />
      ))}
    </Card>
  );
}
```

- [ ] **Step 3: Create barrel index**

Create `src/features/deliveries/index.ts`:

```typescript
export { DeliveryHistoryPanel } from './components/DeliveryHistoryPanel';
export { ResendButton }         from './components/ResendButton';
export { useDeliveryHistory }   from './hooks/useDeliveryHistory';
export { checkResend, ResendError } from './services/delivery.service';
export type {
  InvoiceDelivery, DeliveryEvent, OTPEvent,
  DeliveryChannel, DeliveryStatus, StatusSource, StatusEvent,
  RetryStrategy, ResendCheckResult, ResendErrorCode,
  OTPEventType, OTPChannel,
  WhatsAppWebhookPayload, WhatsAppWebhookStatusPayload,
  ChannelMetadata,
} from './types/delivery.types';
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit --project tsconfig.app.json 2>&1 | head -30
```

Fix any type errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/deliveries/components/DeliveryHistoryPanel.tsx \
        src/features/deliveries/components/ResendButton.tsx \
        src/features/deliveries/index.ts
git commit -m "feat(deliveries): DeliveryHistoryPanel + ResendButton with cooldown display and safeguard enforcement"
```

---

## Task 13: Full test suite + build verification

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: all existing tests pass, all new tests pass. If any fail, fix before proceeding.

- [ ] **Step 2: TypeScript full check**

```bash
npx tsc --noEmit --project tsconfig.app.json
```

Expected: zero errors.

- [ ] **Step 3: Production build**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: production-grade communication delivery infrastructure

Phase 1 — Foundation
- Channel-agnostic types: DeliveryChannel, DeliveryStatus (9 states), StatusSource,
  RetryStrategy, ChannelMetadata (WhatsApp/Email/SMS discriminated union)
- DB v14: invoiceDeliveries (snapshot), deliveryEvents (append-only), otpEvents
- E.164 phone formatting: toE164(), parseE164()

Phase 2 — Infrastructure
- delivery.service: createDelivery, updateDeliveryStatus (syncs both snapshot +
  deliveryEvents), appendDeliveryEvent, checkResend safeguards, assertCanResend,
  ResendError class
- Resend safeguards: 5-min cooldown, 2-min duplicate suppression, maxRetries gate
- Idempotency: crypto.randomUUID() key rotated on every sending transition
- otp-event.service: SHA-256 fingerprint, raw OTP never stored
- delivery-api.service: sync, resend, cancel, webhook payload parser
- db-migrate-ledger: one-time idempotent migration from legacy digbahi_ledger

Phase 3 — Workflow Integration
- main.tsx: boot-time migration
- WhatsAppShare: delivery records (queued→sending→sent/failed), OTP events
  with fingerprint, E.164 storage, creditEntryId linkage

Phase 4 — Hardening
- useDeliveryHistory: load, filter by invoice, resend with ResendError surface
- DeliveryHistoryPanel: status badges, channel icons, retry count, failure reason
- ResendButton: cooldown timer display, confirm dialog, safeguard-aware"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| Append-only delivery history | Task 3 (DeliveryEvent type) + Task 4 (deliveryEvents table) + Task 5 (appendDeliveryEvent) |
| Idempotency on resend/retry | Task 3 (idempotencyKey field) + Task 5 (rotated on sending) |
| Expanded retry metadata | Task 3 (lastRetryAt, nextRetryAt, retryStrategy) + Task 5 |
| Status source distinction | Task 3 (StatusSource) + Task 5 (all updateDeliveryStatus calls carry source) |
| Multi-channel abstraction | Task 3 (ChannelMetadata discriminated union, 7 DeliveryChannels) |
| Resend safeguards (cooldown/duplicate/rate) | Task 3 (ResendCheckResult) + Task 5 (checkResend, RESEND_COOLDOWN_MS, DUPLICATE_SUPPRESS_MS) |
| Backend-authoritative history | Task 8 (syncDeliveryToBackend, requestResend) + synced_at / remote_id fields |
| OTP audit, no raw OTP | Task 6 + Task 10 |
| E.164 storage | Task 2 + Task 10 |
| Resend workflow | Task 11 (hook) + Task 12 (ResendButton) |
| Webhook type preparation | Task 3 + Task 8 (extractWebhookStatusUpdates) |
| Ledger DB consolidation | Task 7 (migration) + Task 9 (boot wiring) |
| Phased delivery: Foundation → Infrastructure → Workflow → Hardening | All tasks ordered accordingly |

### Type Consistency

- `StatusSource` used as the same 4-value union across types, delivery.service, otp-event.service, hook, and UI
- `updateDeliveryStatus(id, status, { source, ... })` — `source` is required, preventing unattributed transitions
- `checkResend` and `assertCanResend` both use `InvoiceDelivery` directly — no duplicated guard logic
- `ResendError.code: ResendErrorCode` — consistent across service, hook, and `ResendErrorState`
- `idempotencyKey` rotated in `delivery.service.ts:updateDeliveryStatus` on `sending` transition — single location, not duplicated in callers
