import Dexie from 'dexie';
import { getPenPin } from './penSession';

// strokeId is stored in plaintext so rows can be located and deleted by the
// canvas engine without requiring full-table decryption.
export interface StrokeRow { id?: number; strokeId?: string; payload: ArrayBuffer; iv: ArrayBuffer; salt: ArrayBuffer; createdAt: number }
export interface ShapeRow { id?: number; payload: ArrayBuffer; iv: ArrayBuffer; salt: ArrayBuffer; createdAt: number }
export interface OcrRow { id?: number; payload: ArrayBuffer; iv: ArrayBuffer; salt: ArrayBuffer; createdAt: number }
export interface OCRCorrectionRow { id?: number; payload: ArrayBuffer; iv: ArrayBuffer; salt: ArrayBuffer; createdAt: number }
export interface OCRTelemetryRow { id?: number; payload: ArrayBuffer; iv: ArrayBuffer; salt: ArrayBuffer; createdAt: number }
export interface ConsentRow { id?: number; payload: ArrayBuffer; iv: ArrayBuffer; salt: ArrayBuffer; createdAt: number }

/**
 * Consent Record Interface (before encryption)
 * Stores user consent for telemetry and federated learning
 */
export interface ConsentRecord {
  version: string;
  timestamp: number;
  accepted: boolean;
  scope: Array<'ocr' | 'federated'>;
  expiresAt?: number;
  revokedAt?: number;
}

/**
 * OCR Correction Interface (before encryption)
 * Stores user corrections for adaptive learning
 */
export interface OCRCorrection {
  id: string;
  strokeIds: string[];
  recognizedText: string;
  correctedText: string;
  timestamp: number;
  confidence: number;
  locale?: string;
}

/**
 * OCR Telemetry Interface (before encryption)
 * Stores OCR recognition results for analytics and debugging
 */
export interface OCRTelemetry {
  id: string;
  timestamp: number;
  imageHash: string;
  recognizedText: string;
  correctedText?: string;
  confidence: number;
  format?: string;
  deviceType?: string;
  screenDPI?: number;
  strokeCount?: number;
  sessionId?: string;
  userLang?: string;
  fields?: Record<string, string>;
}

/**
 * Notebook Page Interface (before encryption)
 * Represents a single page in the digital ledger book
 */
export interface NotebookPage {
  id: string;
  pageNumber: number;
  title?: string;
  templateId: string; // NEW: Template ID (blank, lined, columnar)
  sectionId?: string; // NEW: Section ID for organization
  canvasDataURL?: string; // Base64 PNG snapshot
  strokes: unknown[]; // Stroke data for this page
  shapes: unknown[]; // Shape data for this page
  entries: unknown[]; // Ledger entries from OCR on this page
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  sectionColor?: string; // For color-coded sections
}

export interface NotebookPageRow {
  id?: number;
  pageId: string; // Unique page ID
  pageNumber: number; // For ordering
  payload: ArrayBuffer;
  iv: ArrayBuffer;
  salt: ArrayBuffer;
  createdAt: number;
  updatedAt: number;
}

/**
 * Notebook Section Interface (before encryption)
 * Represents a section/category for organizing pages
 */
export interface NotebookSection {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  order?: number;
}

export interface NotebookSectionRow {
  id?: number;
  sectionId: string;
  payload: ArrayBuffer;
  iv: ArrayBuffer;
  salt: ArrayBuffer;
  createdAt: number;
}

class PenDB extends Dexie {
  strokes!: Dexie.Table<StrokeRow, number>;
  shapes!: Dexie.Table<ShapeRow, number>;
  ocr!: Dexie.Table<OcrRow, number>;
  ocrCorrections!: Dexie.Table<OCRCorrectionRow, number>;
  ocrTelemetry!: Dexie.Table<OCRTelemetryRow, number>;
  consent!: Dexie.Table<ConsentRow, number>;
  notebookPages!: Dexie.Table<NotebookPageRow, number>;
  notebookSections!: Dexie.Table<NotebookSectionRow, number>;

  constructor() {
    super('digbahi_pen');
    // Version 1: Original schema
    this.version(1).stores({
      strokes: '++id, createdAt',
      shapes: '++id, createdAt',
      ocr: '++id, createdAt',
    });
    // Version 2: Add ocrCorrections for adaptive learning
    this.version(2).stores({
      strokes: '++id, createdAt',
      shapes: '++id, createdAt',
      ocr: '++id, createdAt',
      ocrCorrections: '++id, createdAt',
    });
    // Version 3: Add ocrTelemetry for analytics and debugging
    this.version(3).stores({
      strokes: '++id, createdAt',
      shapes: '++id, createdAt',
      ocr: '++id, createdAt',
      ocrCorrections: '++id, createdAt',
      ocrTelemetry: '++id, createdAt',
    });
    // Version 4: Add notebookPages for multi-page support
    this.version(4).stores({
      strokes: '++id, createdAt',
      shapes: '++id, createdAt',
      ocr: '++id, createdAt',
      ocrCorrections: '++id, createdAt',
      ocrTelemetry: '++id, createdAt',
      notebookPages: '++id, pageId, pageNumber, createdAt, updatedAt',
    });
    // Version 5: Add notebookSections for page organization
    this.version(5).stores({
      strokes: '++id, createdAt',
      shapes: '++id, createdAt',
      ocr: '++id, createdAt',
      ocrCorrections: '++id, createdAt',
      ocrTelemetry: '++id, createdAt',
      notebookPages: '++id, pageId, pageNumber, createdAt, updatedAt',
      notebookSections: '++id, sectionId, createdAt',
    });

    // Version 6: Add consent table for privacy-first telemetry gating
    this.version(6).stores({
      strokes: '++id, createdAt',
      shapes: '++id, createdAt',
      ocr: '++id, createdAt',
      ocrCorrections: '++id, createdAt',
      ocrTelemetry: '++id, createdAt',
      consent: '++id, createdAt',
      notebookPages: '++id, pageId, pageNumber, createdAt, updatedAt',
      notebookSections: '++id, sectionId, createdAt',
    });

    // Version 7: Add strokeId plaintext index so individual strokes can be
    // deleted by string ID without decrypting the entire table.
    // Pre-v7 rows have no strokeId and remain undeletable by ID (same as before).
    this.version(7).stores({
      strokes: '++id, strokeId, createdAt',
      shapes: '++id, createdAt',
      ocr: '++id, createdAt',
      ocrCorrections: '++id, createdAt',
      ocrTelemetry: '++id, createdAt',
      consent: '++id, createdAt',
      notebookPages: '++id, pageId, pageNumber, createdAt, updatedAt',
      notebookSections: '++id, sectionId, createdAt',
    });
  }
}

export const penDB = new PenDB();

// AES-GCM helpers
async function importKeyFromPIN(pin: string, salt: ArrayBuffer) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function randBytes(len: number) { return crypto.getRandomValues(new Uint8Array(len)).buffer }

export async function encryptObject(obj: unknown, pin: string) {
  const salt = randBytes(16); const iv = randBytes(12);
  const key = await importKeyFromPIN(pin, salt);
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const payload = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { payload, iv, salt };
}

export async function decryptObject<T>(payload: ArrayBuffer, iv: ArrayBuffer, salt: ArrayBuffer, pin: string): Promise<T> {
  const key = await importKeyFromPIN(pin, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, payload);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(decrypted))) as T;
}

// Save helpers — PIN defaults to the current session key (set at login).
export async function saveStroke(payload: unknown, pin?: string) {
  const activePin = pin ?? getPenPin();
  const strokeId = (payload as { id?: string }).id ?? '';
  const { payload: data, iv, salt } = await encryptObject(payload, activePin);
  return penDB.strokes.add({ strokeId, payload: data, iv, salt, createdAt: Date.now() });
}
export async function saveShape(payload: unknown, pin?: string) {
  const activePin = pin ?? getPenPin();
  const { payload: data, iv, salt } = await encryptObject(payload, activePin);
  return penDB.shapes.add({ payload: data, iv, salt, createdAt: Date.now() });
}
export async function saveOcr(payload: unknown, pin?: string) {
  const activePin = pin ?? getPenPin();
  const { payload: data, iv, salt } = await encryptObject(payload, activePin);
  return penDB.ocr.add({ payload: data, iv, salt, createdAt: Date.now() });
}

// Deletes a stroke from the database by its string ID using the plaintext
// strokeId index added in PenDB v7. Pre-v7 rows without strokeId are
// unaffected (in-memory deletion via useCanvas still removes them visually).
export async function deleteStroke(id: string): Promise<void> {
  await penDB.strokes.where('strokeId').equals(id).delete();
}

export async function loadAll(pin?: string) {
  pin = pin ?? getPenPin();
  const [strokes, shapes, ocr] = await Promise.all([
    penDB.strokes.toArray(), penDB.shapes.toArray(), penDB.ocr.toArray(),
  ]);
  return {
    strokes: await Promise.all(strokes.map(r => decryptObject<unknown>(r.payload, r.iv, r.salt, pin))),
    shapes: await Promise.all(shapes.map(r => decryptObject<unknown>(r.payload, r.iv, r.salt, pin))),
    ocr: await Promise.all(ocr.map(r => decryptObject<unknown>(r.payload, r.iv, r.salt, pin))),
  };
}

// OCR Corrections helpers
export async function saveOCRCorrection(correction: OCRCorrection, pin?: string) {
  pin = pin ?? getPenPin();
  const { payload, iv, salt } = await encryptObject(correction, pin);
  return penDB.ocrCorrections.add({ payload, iv, salt, createdAt: Date.now() });
}

export async function loadOCRCorrections(pin?: string): Promise<OCRCorrection[]> {
  pin = pin ?? getPenPin();
  const rows = await penDB.ocrCorrections.orderBy('createdAt').reverse().toArray();
  return Promise.all(rows.map(r => decryptObject<OCRCorrection>(r.payload, r.iv, r.salt, pin)));
}

export async function deleteOCRCorrection(id: number) {
  return penDB.ocrCorrections.delete(id);
}

export async function clearOldCorrections(daysToKeep = 30) {
  const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
  return penDB.ocrCorrections.where('createdAt').below(cutoff).delete();
}

// OCR Telemetry helpers
export async function saveOCRTelemetry(telemetry: OCRTelemetry, pin?: string) {
  pin = pin ?? getPenPin();
  const { payload, iv, salt } = await encryptObject(telemetry, pin);
  return penDB.ocrTelemetry.add({ payload, iv, salt, createdAt: Date.now() });
}

export async function loadOCRTelemetry(pin?: string, limit = 100): Promise<OCRTelemetry[]> {
  pin = pin ?? getPenPin();
  const rows = await penDB.ocrTelemetry
    .orderBy('createdAt')
    .reverse()
    .limit(limit)
    .toArray();
  return Promise.all(rows.map(r => decryptObject<OCRTelemetry>(r.payload, r.iv, r.salt, pin)));
}

export async function deleteOCRTelemetry(id: number) {
  return penDB.ocrTelemetry.delete(id);
}

export async function clearOldTelemetry(daysToKeep = 90) {
  const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
  return penDB.ocrTelemetry.where('createdAt').below(cutoff).delete();
}

// ============================================================================
// NOTEBOOK PAGES HELPERS (Phase 1 - Multi-Page Support)
// ============================================================================

/**
 * Save a notebook page to IndexedDB
 */
export async function savePage(page: NotebookPage, pin?: string): Promise<number> {
  pin = pin ?? getPenPin();
  const now = Date.now();
  const pageData = {
    ...page,
    updatedAt: now,
  };

  const { payload, iv, salt } = await encryptObject(pageData, pin);

  // Check if page exists
  const existingPage = await penDB.notebookPages
    .where('pageId')
    .equals(page.id)
    .first();

  if (existingPage) {
    // Update existing page
    await penDB.notebookPages.update(existingPage.id!, {
      payload,
      iv,
      salt,
      updatedAt: now,
      pageNumber: page.pageNumber,
    });
    return existingPage.id!;
  } else {
    // Create new page
    return penDB.notebookPages.add({
      pageId: page.id,
      pageNumber: page.pageNumber,
      payload,
      iv,
      salt,
      createdAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Load a specific page by pageId
 */
export async function loadPage(pageId: string, pin?: string): Promise<NotebookPage | null> {
  pin = pin ?? getPenPin();
  const row = await penDB.notebookPages
    .where('pageId')
    .equals(pageId)
    .first();

  if (!row) return null;

  return decryptObject<NotebookPage>(row.payload, row.iv, row.salt, pin);
}

/**
 * Load a page by page number
 */
export async function loadPageByNumber(pageNumber: number, pin?: string): Promise<NotebookPage | null> {
  pin = pin ?? getPenPin();
  const row = await penDB.notebookPages
    .where('pageNumber')
    .equals(pageNumber)
    .first();

  if (!row) return null;

  return decryptObject<NotebookPage>(row.payload, row.iv, row.salt, pin);
}

/**
 * List all pages (sorted by page number)
 */
export async function listPages(pin?: string): Promise<NotebookPage[]> {
  pin = pin ?? getPenPin();
  const rows = await penDB.notebookPages
    .orderBy('pageNumber')
    .toArray();

  return Promise.all(
    rows.map(r => decryptObject<NotebookPage>(r.payload, r.iv, r.salt, pin))
  );
}

/**
 * Delete a page by pageId
 */
export async function deletePage(pageId: string): Promise<void> {
  const row = await penDB.notebookPages
    .where('pageId')
    .equals(pageId)
    .first();

  if (row?.id) {
    await penDB.notebookPages.delete(row.id);
  }
}

/**
 * Get total page count
 */
export async function getPageCount(): Promise<number> {
  return penDB.notebookPages.count();
}

/**
 * Create initial blank page if no pages exist
 */
export async function ensureInitialPage(pin?: string): Promise<NotebookPage> {
  pin = pin ?? getPenPin();
  const count = await getPageCount();

  if (count === 0) {
    const initialPage: NotebookPage = {
      id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      pageNumber: 1,
      title: 'Page 1',
      templateId: 'lined', // Default template
      sectionId: undefined,
      strokes: [],
      shapes: [],
      entries: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
    };

    await savePage(initialPage, pin);
    return initialPage;
  }

  // Return first page if it exists
  const firstPage = await loadPageByNumber(1, pin);
  return firstPage!;
}

/**
 * Migration helper: Migrate pages to V2 (add templateId & sectionId)
 * Non-destructive: only adds missing fields, preserves existing data
 */
export async function migratePagesToV2(pin?: string): Promise<{ migrated: number; skipped: number; errors: number }> {
  pin = pin ?? getPenPin();
  const results = { migrated: 0, skipped: 0, errors: 0 };

  try {
    const pages = await listPages(pin);

    for (const page of pages) {
      try {
        let needsMigration = false;

        // Add templateId if missing
        if (!page.templateId) {
          page.templateId = 'lined'; // defaultTemplateId
          needsMigration = true;
        }

        if (needsMigration) {
          await savePage(page, pin);
          results.migrated++;
          console.log(`[Migration] Migrated page ${page.pageNumber} (${page.id})`);
        } else {
          results.skipped++;
        }
      } catch (error) {
        console.error(`[Migration] Error migrating page ${page.pageNumber}:`, error);
        results.errors++;
      }
    }

    console.log(`[Migration] Complete: ${results.migrated} migrated, ${results.skipped} skipped, ${results.errors} errors`);
    return results;
  } catch (error) {
    console.error('[Migration] Fatal error:', error);
    throw error;
  }
}

/**
 * Create backup of all pages before migration
 */
export async function backupPagesBeforeMigration(pin?: string): Promise<string> {
  pin = pin ?? getPenPin();
  try {
    const pages = await listPages(pin);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupData = {
      timestamp,
      version: 'v1',
      pages,
      count: pages.length,
    };

    // Return JSON string (caller will save to file)
    return JSON.stringify(backupData, null, 2);
  } catch (error) {
    console.error('[Backup] Error creating backup:', error);
    throw error;
  }
}

// ============================================================================
// NOTEBOOK SECTIONS HELPERS
// ============================================================================

/**
 * Save a section to IndexedDB
 */
export async function saveSection(section: NotebookSection, pin?: string): Promise<number> {
  pin = pin ?? getPenPin();
  const { payload, iv, salt } = await encryptObject(section, pin);

  // Check if section exists
  const existingSection = await penDB.notebookSections
    .where('sectionId')
    .equals(section.id)
    .first();

  if (existingSection) {
    // Update existing
    await penDB.notebookSections.update(existingSection.id!, {
      payload,
      iv,
      salt,
    });
    return existingSection.id!;
  } else {
    // Create new
    return penDB.notebookSections.add({
      sectionId: section.id,
      payload,
      iv,
      salt,
      createdAt: Date.now(),
    });
  }
}

/**
 * Load all sections
 */
export async function listSections(pin?: string): Promise<NotebookSection[]> {
  pin = pin ?? getPenPin();
  const rows = await penDB.notebookSections
    .orderBy('createdAt')
    .toArray();

  return Promise.all(
    rows.map(r => decryptObject<NotebookSection>(r.payload, r.iv, r.salt, pin))
  );
}

/**
 * Delete a section
 */
export async function deleteSection(sectionId: string): Promise<void> {
  const row = await penDB.notebookSections
    .where('sectionId')
    .equals(sectionId)
    .first();

  if (row?.id) {
    await penDB.notebookSections.delete(row.id);
  }
}

// ============================================================================
// CONSENT MANAGEMENT (Privacy-First Telemetry Gating)
// ============================================================================

/**
 * Save consent record
 */
export async function saveConsent(consent: ConsentRecord, pin?: string): Promise<number> {
  pin = pin ?? getPenPin();
  const { payload, iv, salt } = await encryptObject(consent, pin);

  return penDB.consent.add({
    payload,
    iv,
    salt,
    createdAt: Date.now(),
  });
}

/**
 * Get current consent record (most recent)
 */
export async function getConsent(pin?: string): Promise<ConsentRecord | null> {
  pin = pin ?? getPenPin();
  const row = await penDB.consent
    .orderBy('createdAt')
    .reverse()
    .first();

  if (!row) return null;

  const consent = await decryptObject<ConsentRecord>(row.payload, row.iv, row.salt, pin);

  // Check if consent is expired
  if (consent.expiresAt && Date.now() > consent.expiresAt) {
    return null;
  }

  // Check if consent was revoked
  if (consent.revokedAt) {
    return null;
  }

  return consent;
}

/**
 * Check if user has consented to a specific scope
 */
export async function hasConsent(scope: 'ocr' | 'federated', pin?: string): Promise<boolean> {
  const consent = await getConsent(pin);

  if (!consent || !consent.accepted) return false;

  return consent.scope.includes(scope);
}

/**
 * Revoke consent (for privacy settings)
 */
export async function revokeConsent(pin?: string): Promise<void> {
  pin = pin ?? getPenPin();
  const current = await getConsent(pin);

  if (current) {
    const revokedConsent: ConsentRecord = {
      ...current,
      accepted: false,
      revokedAt: Date.now(),
      scope: [],
    };

    await saveConsent(revokedConsent, pin);
  }
}

/**
 * Get consent history (for privacy dashboard)
 */
export async function getConsentHistory(pin?: string): Promise<ConsentRecord[]> {
  pin = pin ?? getPenPin();
  const rows = await penDB.consent
    .orderBy('createdAt')
    .reverse()
    .toArray();

  return Promise.all(
    rows.map(r => decryptObject<ConsentRecord>(r.payload, r.iv, r.salt, pin))
  );
}

