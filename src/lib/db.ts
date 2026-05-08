import Dexie, { Table } from 'dexie';
import type { UPIIntent, UPIReconcileRequest } from '@/features/payments/types/upi.types';
import type { AnalyticsEvent } from './analytics';

export interface User {
  id?: number;
  username: string;
  email?: string;
  phone?: string;
  displayName?: string;
  /** Primary credential hash (PBKDF2-SHA256). All new accounts set this. */
  passwordHash: string;
  /** Base64-encoded 16-byte PBKDF2 salt. */
  passwordSalt: string;
  /** Set true for accounts migrated from PIN — UI prompts a one-time password reset. */
  mustResetPassword?: boolean;
  /** Legacy PIN hash — retained during migration window, cleared after password upgrade. */
  pinHash?: string;
  /** Legacy PIN salt — retained during migration window, cleared after password upgrade. */
  pinSalt?: string;
  role: 'owner' | 'accountant' | 'employee';
  isActive: boolean;
  createdAt: Date;
  lastLoginAt?: string;
  failedAttempts?: number;
  lockedUntil?: string | null;
}

/** Immutable record of every login attempt — success and failure — for audit trails. */
export interface LoginAttempt {
  id?: number;
  userId?: number;
  /** Sanitized identifier — never stores the credential itself. */
  identifier: string;
  success: boolean;
  timestamp: string;
  source: 'backend' | 'offline';
  deviceId: string;
  failureReason?: 'wrong_password' | 'account_locked' | 'user_not_found' | 'server_error';
}

/** Structured audit trail for DPDP Act compliance. */
export interface AuditLogEntry {
  id?: number;
  userId: number;
  action: string;
  resource?: string;
  details?: string;
  timestamp: string;
  deviceId: string;
}

export interface LedgerEntry {
  id?: number;
  date: string;
  description: string;
  amount: number;
  type: 'sale' | 'purchase' | 'expense' | 'receipt';
  gstRate: number;
  gstAmount: number;
  created_by?: number | null;
  created_at: string;
  party_name?: string;
  reference_no?: string;
  tags?: string;
  is_active?: boolean;
  deleted_at?: string | null;
  updated_at?: string;
  itemId?: number;
  qty?: number;
  userId?: number;
  createdAt?: Date;
  customer_id?: number;
  synced_at?: string | null;
  remote_id?: string | null;
}

export interface GSTRecord {
  id?: number;
  ledgerId: number;
  taxAmount: number;
  status: 'pending' | 'filed';
  createdAt: Date;
}

export interface CompanySettings {
  id?: number;
  businessName: string;
  address?: string;
  gstin?: string;
  phone?: string;
  email?: string;
  updated_at: string;
}

export interface CustomerContact {
  id?: number;
  name: string;
  phone: string;
  address?: string;
  gstin?: string;
  created_at: string;
  updated_at: string;
  synced_at?: string | null;
  remote_id?: string | null;
}

export interface CreditEntry {
  id?: number;
  invoiceNumber: string;
  ledgerEntryId?: number;
  customerName: string;
  customerPhone: string;
  amount: number;
  gstRate: number;
  gstAmount: number;
  status: 'pending' | 'paid';
  otpVerified: boolean;
  otpVerifiedAt?: string;
  paidAt?: string;
  created_at: string;
  updated_at: string;
}

export class DigBahiDB extends Dexie {
  users!: Table<User>;
  ledger!: Table<LedgerEntry>;
  gstRecords!: Table<GSTRecord>;
  upiIntents!: Table<UPIIntent>;
  syncQueue!: Table<UPIReconcileRequest>;
  items!: Table<Record<string, unknown>>;
  stockTxns!: Table<Record<string, unknown>>;
  companySettings!: Table<CompanySettings>;
  customerContacts!: Table<CustomerContact>;
  creditEntries!: Table<CreditEntry>;
  analyticsEvents!: Table<AnalyticsEvent>;
  loginAttempts!: Table<LoginAttempt>;
  auditLog!: Table<AuditLogEntry>;

  constructor() {
    super('digbahi');

    this.version(2).stores({
      users: '++id, username, role',
      ledger: '++id, date, type, userId, createdAt',
      gstRecords: '++id, ledgerId, status, createdAt',
      upiIntents: 'id, upiId, status, createdAt',
      syncQueue: 'id, txnRef, timestamp',
    });

    this.version(3).stores({
      users: '++id, username, role',
      ledger: '++id, date, type, userId, createdAt',
      gstRecords: '++id, ledgerId, status, createdAt',
      upiIntents: 'id, upiId, status, createdAt',
      syncQueue: 'id, txnRef, timestamp',
      items: '++id,nameKey,sku',
      stockTxns: '++id,itemId,date,refLedgerId',
    });

    this.version(5).stores({
      users: '++id, username, role',
      ledger: '++id, date, type, userId, createdAt',
      gstRecords: '++id, ledgerId, status, createdAt',
      upiIntents: 'id, upiId, status, createdAt',
      syncQueue: 'id, txnRef, timestamp',
      items: '++id,nameKey,sku,gstRate,unit,createdAt',
      stockTxns: '++id,itemId,date,refLedgerId,type',
    });

    this.version(6).stores({
      users: '++id, username, role',
      ledger: '++id, date, type, userId, createdAt',
      gstRecords: '++id, ledgerId, status, createdAt',
      upiIntents: 'id, upiId, status, createdAt',
      syncQueue: 'id, txnRef, timestamp',
      items: '++id,nameKey,sku,gstRate,unit,createdAt',
      stockTxns: '++id,itemId,date,refLedgerId,type',
      companySettings: '++id',
      customerContacts: '++id, phone, name',
    });

    this.version(7).stores({
      users: '++id, username, role',
      ledger: '++id, date, type, userId, createdAt',
      gstRecords: '++id, ledgerId, status, createdAt',
      upiIntents: 'id, upiId, status, createdAt',
      syncQueue: 'id, txnRef, timestamp',
      items: '++id,nameKey,sku,gstRate,unit,createdAt',
      stockTxns: '++id,itemId,date,refLedgerId,type',
      companySettings: '++id',
      customerContacts: '++id, phone, name',
      creditEntries: '++id, invoiceNumber, customerPhone, status',
    });

    this.version(8).stores({
      users:            '++id, username, role',
      ledger:           '++id, date, type, party_name, customer_id, synced_at',
      gstRecords:       '++id, ledgerId, status, createdAt',
      upiIntents:       'id, upiId, status, createdAt',
      syncQueue:        'id, txnRef, timestamp',
      items:            '++id,nameKey,sku,gstRate,unit,createdAt',
      stockTxns:        '++id,itemId,date,refLedgerId,type',
      companySettings:  '++id',
      customerContacts: '++id, phone, name, synced_at, remote_id',
      creditEntries:    '++id, invoiceNumber, customerPhone, status',
      analyticsEvents:  '++id, name, synced, timestamp, session_id',
    });

    this.version(9).stores({
      users:            '++id, username, role',
      ledger:           '++id, date, type, party_name, customer_id, synced_at, created_by',
      gstRecords:       '++id, ledgerId, status, createdAt',
      upiIntents:       'id, upiId, status, createdAt',
      syncQueue:        'id, txnRef, timestamp',
      items:            '++id,nameKey,sku,gstRate,unit,createdAt',
      stockTxns:        '++id,itemId,date,refLedgerId,type',
      companySettings:  '++id',
      customerContacts: '++id, phone, name, synced_at, remote_id',
      creditEntries:    '++id, invoiceNumber, customerPhone, status',
      analyticsEvents:  '++id, name, synced, timestamp, session_id',
    }).upgrade(async (tx) => {
      await tx.table('ledger').toCollection().modify((entry: Record<string, unknown>) => {
        if (entry.created_by == null && entry.userId != null) {
          entry.created_by = entry.userId;
        }
        if (!entry.created_at && entry.createdAt) {
          entry.created_at =
            entry.createdAt instanceof Date
              ? entry.createdAt.toISOString()
              : String(entry.createdAt);
        }
        if (entry.is_active == null) {
          entry.is_active = true;
        }
      });
    });

    this.version(10).stores({
      users:            '++id, username, role',
      ledger:           '++id, date, type, party_name, customer_id, synced_at, created_by',
      gstRecords:       '++id, ledgerId, status, createdAt',
      upiIntents:       'id, upiId, status, createdAt',
      syncQueue:        'id, txnRef, timestamp',
      items:            '++id,nameKey,sku,gstRate,unit,createdAt',
      stockTxns:        '++id,itemId,date,refLedgerId,type',
      companySettings:  '++id',
      customerContacts: '++id, phone, name, synced_at, remote_id',
      creditEntries:    '++id, invoiceNumber, customerPhone, status',
      analyticsEvents:  '++id, name, synced, timestamp, session_id',
    });

    // v11: Password-based auth (replaces PIN kiosk system).
    // Extends users with email, phone, displayName, isActive, and audit fields.
    // Adds loginAttempts + auditLog tables for DPDP compliance.
    // Migration copies pinHash→passwordHash so existing users remain functional.
    this.version(11).stores({
      users:            '++id, username, email, phone, role, isActive',
      ledger:           '++id, date, type, party_name, customer_id, synced_at, created_by',
      gstRecords:       '++id, ledgerId, status, createdAt',
      upiIntents:       'id, upiId, status, createdAt',
      syncQueue:        'id, txnRef, timestamp',
      items:            '++id,nameKey,sku,gstRate,unit,createdAt',
      stockTxns:        '++id,itemId,date,refLedgerId,type',
      companySettings:  '++id',
      customerContacts: '++id, phone, name, synced_at, remote_id',
      creditEntries:    '++id, invoiceNumber, customerPhone, status',
      analyticsEvents:  '++id, name, synced, timestamp, session_id',
      loginAttempts:    '++id, userId, timestamp, success',
      auditLog:         '++id, userId, timestamp, action',
    }).upgrade(async (tx) => {
      await tx.table('users').toCollection().modify((user: Record<string, unknown>) => {
        if (user.isActive == null) user.isActive = true;
        if (user.failedAttempts == null) user.failedAttempts = 0;

        // Copy PIN credentials to password fields so existing accounts keep working.
        // mustResetPassword=true signals the UI to prompt a proper password after login.
        if (!user.passwordHash && user.pinHash) {
          user.passwordHash = user.pinHash;
          user.mustResetPassword = true;
        }
        if (!user.passwordSalt && user.pinSalt) {
          user.passwordSalt = user.pinSalt;
        }
        // Legacy SHA-256 accounts have no salt — they must reset.
        if (!user.passwordHash) user.passwordHash = '';
        if (!user.passwordSalt) user.passwordSalt = '';
        if (!user.passwordHash || !user.passwordSalt) user.mustResetPassword = true;
      });
    });
  }
}

export const db = new DigBahiDB();

export async function initializeDB() {
  // Schema created by Dexie versioning. No auto-user creation.
}

export async function isFirstRun(): Promise<boolean> {
  return (await db.users.count()) === 0;
}

/** Create the owner account during first-run setup with a full password (not PIN). */
export async function createOwnerAccount(username: string, password: string, email?: string): Promise<void> {
  const { passwordHash, passwordSalt } = await _derivePasswordHash(password);
  await db.users.add({
    username: username.trim().toLowerCase(),
    email: email?.trim().toLowerCase(),
    passwordHash,
    passwordSalt,
    mustResetPassword: false,
    role: 'owner',
    isActive: true,
    createdAt: new Date(),
    failedAttempts: 0,
  });
}

/** Create any user account (owner, accountant, employee) with a password. */
export async function createUserAccount(options: {
  username: string;
  password: string;
  role: 'owner' | 'accountant' | 'employee';
  displayName?: string;
  email?: string;
  phone?: string;
}): Promise<number> {
  const { passwordHash, passwordSalt } = await _derivePasswordHash(options.password);
  return db.users.add({
    username: options.username.trim().toLowerCase(),
    displayName: options.displayName?.trim(),
    email: options.email?.trim().toLowerCase(),
    phone: options.phone?.trim(),
    passwordHash,
    passwordSalt,
    mustResetPassword: false,
    role: options.role,
    isActive: true,
    createdAt: new Date(),
    failedAttempts: 0,
  });
}

async function _derivePasswordHash(password: string): Promise<{ passwordHash: string; passwordSalt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const passwordHash = Array.from(new Uint8Array(derived))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const passwordSalt = btoa(String.fromCharCode(...salt));
  return { passwordHash, passwordSalt };
}

// ─── UPI Intent CRUD ─────────────────────────────────────────────────────────

export async function saveUPIIntent(intent: UPIIntent): Promise<void> {
  await db.upiIntents.put(intent);
}

export async function updateUPIIntentStatus(id: string, status: UPIIntent['status']): Promise<void> {
  await db.upiIntents.update(id, { status, updatedAt: Date.now() });
}

export async function listUPIIntents(): Promise<UPIIntent[]> {
  return db.upiIntents.orderBy('createdAt').reverse().toArray();
}

export async function getUPIIntent(id: string): Promise<UPIIntent | undefined> {
  return db.upiIntents.get(id);
}

// ─── Sync Queue ───────────────────────────────────────────────────────────────

export async function enqueueReconcile(request: UPIReconcileRequest): Promise<void> {
  await db.syncQueue.put(request);
}

export async function getSyncQueue(): Promise<UPIReconcileRequest[]> {
  return db.syncQueue.orderBy('timestamp').toArray();
}

export async function removeFromSyncQueue(id: string): Promise<void> {
  await db.syncQueue.delete(id);
}

// ─── Company Settings ─────────────────────────────────────────────────────────

export async function getCompanySettings(): Promise<CompanySettings | null> {
  return (await db.companySettings.toCollection().first()) ?? null;
}

export async function saveCompanySettings(
  settings: Omit<CompanySettings, 'id' | 'updated_at'>,
): Promise<number> {
  const existing = await db.companySettings.toCollection().first();
  const now = new Date().toISOString();
  if (existing) {
    await db.companySettings.update(existing.id!, { ...settings, updated_at: now });
    return existing.id!;
  }
  return db.companySettings.add({ ...settings, updated_at: now });
}

// ─── Customer Contacts ────────────────────────────────────────────────────────

export async function getAllCustomerContacts(): Promise<CustomerContact[]> {
  return db.customerContacts.orderBy('name').toArray();
}

export async function getRecentCustomerContacts(limit = 10): Promise<CustomerContact[]> {
  return db.customerContacts.orderBy('updated_at').reverse().limit(limit).toArray();
}

export async function searchCustomerContacts(query: string, limit = 10): Promise<CustomerContact[]> {
  if (!query) return getRecentCustomerContacts(limit);
  const lq = query.toLowerCase();
  return db.customerContacts
    .filter(c => c.name.toLowerCase().includes(lq) || c.phone.includes(query))
    .limit(limit)
    .toArray();
}

export async function getCustomerContactByPhone(phone: string): Promise<CustomerContact | undefined> {
  return db.customerContacts.where('phone').equals(phone).first();
}

export async function saveCustomerContact(
  contact: Omit<CustomerContact, 'id' | 'created_at' | 'updated_at'>,
): Promise<number> {
  const now = new Date().toISOString();
  const existing = await getCustomerContactByPhone(contact.phone);
  if (existing) {
    await db.customerContacts.update(existing.id!, { ...contact, updated_at: now });
    return existing.id!;
  }
  return db.customerContacts.add({ ...contact, created_at: now, updated_at: now });
}

// ─── Credit Entries ───────────────────────────────────────────────────────────

export async function getAllCreditEntries(): Promise<CreditEntry[]> {
  return db.creditEntries.orderBy('created_at').reverse().toArray();
}

export async function getCreditEntryByInvoice(invoiceNumber: string): Promise<CreditEntry | undefined> {
  return db.creditEntries.where('invoiceNumber').equals(invoiceNumber).first();
}

export async function getPendingCreditEntries(): Promise<CreditEntry[]> {
  return db.creditEntries.where('status').equals('pending').toArray();
}

export async function createCreditEntry(
  entry: Omit<CreditEntry, 'id' | 'created_at' | 'updated_at'>,
): Promise<number> {
  const now = new Date().toISOString();
  return db.creditEntries.add({ ...entry, created_at: now, updated_at: now });
}

export async function updateCreditEntry(id: number, updates: Partial<CreditEntry>): Promise<void> {
  await db.creditEntries.update(id, { ...updates, updated_at: new Date().toISOString() });
}

export async function markCreditAsPaid(id: number): Promise<void> {
  const now = new Date().toISOString();
  await db.creditEntries.update(id, { status: 'paid', paidAt: now, updated_at: now });
}


