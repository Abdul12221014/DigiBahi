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
