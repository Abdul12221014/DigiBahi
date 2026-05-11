import Dexie from 'dexie';
import { api } from './api.service';

export interface LedgerLocal {
  id?: number;
  date: string;
  description: string;
  amount: number;
  type: 'sale' | 'purchase' | 'expense' | 'receipt';
  // Stored as 0 (unsynced) or 1 (synced). Booleans are not valid IndexedDB
  // key values so they can't be indexed; numeric 0/1 works correctly.
  synced?: 0 | 1;
  createdAt: number;
}

class LedgerDB extends Dexie {
  entries!: Dexie.Table<LedgerLocal, number>;
  constructor() {
    super('digbahi_ledger');
    this.version(1).stores({ entries: '++id, date, type, synced, createdAt' });
    // v2: migrate synced boolean → 0|1 so the index actually works.
    this.version(2).stores({ entries: '++id, date, type, synced, createdAt' })
      .upgrade(async tx => {
        await tx.table('entries').toCollection().modify((entry: Record<string, unknown>) => {
          if (typeof entry.synced === 'boolean') {
            entry.synced = entry.synced ? 1 : 0;
          } else if (entry.synced == null) {
            entry.synced = 0;
          }
        });
      });
  }
}

const ledgerDB = new LedgerDB();

export async function getLedger() { return ledgerDB.entries.orderBy('createdAt').reverse().toArray(); }
export async function addEntry(entry: Omit<LedgerLocal, 'createdAt' | 'synced'>) {
  return ledgerDB.entries.add({ ...entry, createdAt: Date.now(), synced: 0 });
}
export async function deleteEntry(id: number) { return ledgerDB.entries.delete(id); }
export async function markSynced(ids: number[]) { return ledgerDB.entries.where('id').anyOf(ids).modify({ synced: 1 }); }

export async function syncPending() {
  const pending = await ledgerDB.entries.where('synced').equals(0).toArray();
  if (pending.length === 0) return 0;
  const res = await api.sync(pending);
  if (res?.ok) await markSynced(pending.map(e => e.id!).filter(Boolean));
  return pending.length;
}


