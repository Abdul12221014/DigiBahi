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
