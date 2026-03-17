import Dexie, { Table } from 'dexie';
import type { UPIIntent, UPIReconcileRequest } from '@/features/payments/types/upi.types';

export interface User {
  id?: number;
  username: string;
  pinHash: string;
  role: 'owner' | 'accountant' | 'employee';
  createdAt: Date;
}

export interface LedgerEntry {
  id?: number;
  date: string;
  description: string;
  amount: number;
  type: 'sale' | 'purchase' | 'expense' | 'receipt';
  gstRate: number;
  gstAmount: number;
  // CHANGED: userId → created_by (nullable, matches backend)
  created_by?: number | null;
  // CHANGED: createdAt: Date → created_at: string (ISO format, matches backend)
  created_at: string;
  // NEW FIELDS (Week-1 Ledger Enhancement)
  party_name?: string;
  reference_no?: string;
  tags?: string;
  is_active?: boolean;
  deleted_at?: string | null;
  updated_at?: string;
  // Optional inventory fields (keep for backward compat)
  itemId?: number;
  qty?: number;
  // Legacy fields (keep for backward compat during migration)
  userId?: number;  // Deprecated - use created_by
  createdAt?: Date; // Deprecated - use created_at
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
  items!: Table<any>;
  stockTxns!: Table<any>;
  companySettings!: Table<CompanySettings>;
  customerContacts!: Table<CustomerContact>;
  creditEntries!: Table<CreditEntry>;

  constructor() {
    super('digbahi');
    
    // Version 2: Initial schema
    this.version(2).stores({
      users: '++id, username, role',
      ledger: '++id, date, type, userId, createdAt',
      gstRecords: '++id, ledgerId, status, createdAt',
      upiIntents: 'id, upiId, status, createdAt',
      syncQueue: 'id, txnRef, timestamp'
    });
    
    // Version 3: Add inventory tables
    this.version(3).stores({
      users: '++id, username, role',
      ledger: '++id, date, type, userId, createdAt',
      gstRecords: '++id, ledgerId, status, createdAt',
      upiIntents: 'id, upiId, status, createdAt',
      syncQueue: 'id, txnRef, timestamp',
      items: '++id,nameKey,sku',
      stockTxns: '++id,itemId,date,refLedgerId'
    }).upgrade(() => {
      // Migration: create inventory tables if they don't exist
      // No data transformation needed
    });
    
    // Version 5: Fix invalid compound indexes
    this.version(5).stores({
      users: '++id, username, role',
      ledger: '++id, date, type, userId, createdAt',
      gstRecords: '++id, ledgerId, status, createdAt',
      upiIntents: 'id, upiId, status, createdAt',
      syncQueue: 'id, txnRef, timestamp',
      // OPTIMIZED INVENTORY INDEXES - Fixed compound indexes
      items: '++id,nameKey,sku,gstRate,unit,createdAt',
      stockTxns: '++id,itemId,date,refLedgerId,type'
    }).upgrade(async (tx) => {
      // Safe migration - no data loss, just adds indexes
      console.log('🚀 Upgrading to optimized database indexes...');
      console.log('✅ Added individual indexes for faster queries');
      console.log('✅ Added search-optimized indexes');
      console.log('✅ Added stock transaction indexes');
    });
    
    // Version 6: Add company settings and customer contacts
    this.version(6).stores({
      users: '++id, username, role',
      ledger: '++id, date, type, userId, createdAt',
      gstRecords: '++id, ledgerId, status, createdAt',
      upiIntents: 'id, upiId, status, createdAt',
      syncQueue: 'id, txnRef, timestamp',
      items: '++id,nameKey,sku,gstRate,unit,createdAt',
      stockTxns: '++id,itemId,date,refLedgerId,type',
      companySettings: '++id',
      customerContacts: '++id, phone, name'
    }).upgrade(async (tx) => {
      console.log('🚀 Adding company settings and customer contacts...');
    });
    
    // Version 7: Add credit entries
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
      creditEntries: '++id, invoiceNumber, customerPhone, status'
    }).upgrade(async (tx) => {
      console.log('🚀 Adding credit entries table...');
    });
  }
}

export const db = new DigBahiDB();

// Initialize with demo user if empty
export async function initializeDB() {
  const userCount = await db.users.count();
  if (userCount === 0) {
    // Demo PIN: "1234" - SHA-256 hash
    const encoder = new TextEncoder();
    const data = encoder.encode('1234');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const pinHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    await db.users.add({
      username: 'demo',
      pinHash,
      role: 'owner',
      createdAt: new Date()
    });
  }
}

// UPI Intent CRUD operations
export async function saveUPIIntent(intent: UPIIntent): Promise<void> {
  await db.upiIntents.put(intent);
}

export async function updateUPIIntentStatus(id: string, status: UPIIntent['status']): Promise<void> {
  await db.upiIntents.update(id, { 
    status, 
    updatedAt: Date.now() 
  });
}

export async function listUPIIntents(): Promise<UPIIntent[]> {
  return await db.upiIntents.orderBy('createdAt').reverse().toArray();
}

export async function getUPIIntent(id: string): Promise<UPIIntent | undefined> {
  return await db.upiIntents.get(id);
}

// Sync Queue operations
export async function enqueueReconcile(request: UPIReconcileRequest): Promise<void> {
  await db.syncQueue.put(request);
}

export async function getSyncQueue(): Promise<UPIReconcileRequest[]> {
  return await db.syncQueue.orderBy('timestamp').toArray();
}

export async function removeFromSyncQueue(id: string): Promise<void> {
  await db.syncQueue.delete(id);
}

// Company Settings operations
export async function getCompanySettings(): Promise<CompanySettings | null> {
  const settings = await db.companySettings.toCollection().first();
  return settings || null;
}

export async function saveCompanySettings(settings: Omit<CompanySettings, 'id' | 'updated_at'>): Promise<number> {
  const existing = await db.companySettings.toCollection().first();
  const now = new Date().toISOString();
  
  if (existing) {
    await db.companySettings.update(existing.id!, {
      ...settings,
      updated_at: now
    });
    return existing.id!;
  } else {
    return await db.companySettings.add({
      ...settings,
      updated_at: now
    });
  }
}

// Customer Contacts operations
export async function getAllCustomerContacts(): Promise<CustomerContact[]> {
  return await db.customerContacts.orderBy('name').toArray();
}

export async function getCustomerContactByPhone(phone: string): Promise<CustomerContact | undefined> {
  return await db.customerContacts.where('phone').equals(phone).first();
}

export async function saveCustomerContact(contact: Omit<CustomerContact, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
  const now = new Date().toISOString();
  const existing = await getCustomerContactByPhone(contact.phone);
  
  if (existing) {
    await db.customerContacts.update(existing.id!, {
      ...contact,
      updated_at: now
    });
    return existing.id!;
  } else {
    return await db.customerContacts.add({
      ...contact,
      created_at: now,
      updated_at: now
    });
  }
}

// Credit Entries operations
export async function getAllCreditEntries(): Promise<CreditEntry[]> {
  return await db.creditEntries.orderBy('created_at').reverse().toArray();
}

export async function getCreditEntryByInvoice(invoiceNumber: string): Promise<CreditEntry | undefined> {
  return await db.creditEntries.where('invoiceNumber').equals(invoiceNumber).first();
}

export async function getPendingCreditEntries(): Promise<CreditEntry[]> {
  return await db.creditEntries.where('status').equals('pending').toArray();
}

export async function createCreditEntry(entry: Omit<CreditEntry, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
  const now = new Date().toISOString();
  return await db.creditEntries.add({
    ...entry,
    created_at: now,
    updated_at: now
  });
}

export async function updateCreditEntry(id: number, updates: Partial<CreditEntry>): Promise<void> {
  const now = new Date().toISOString();
  await db.creditEntries.update(id, {
    ...updates,
    updated_at: now
  });
}

export async function markCreditAsPaid(id: number): Promise<void> {
  const now = new Date().toISOString();
  await db.creditEntries.update(id, {
    status: 'paid',
    paidAt: now,
    updated_at: now
  });
}
