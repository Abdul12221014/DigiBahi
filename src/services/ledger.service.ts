import Dexie from 'dexie';
import { api } from './api.service';

export interface LedgerLocal {
  id?: number;
  date: string;
  description: string;
  amount: number;
  type: 'sale' | 'purchase' | 'expense' | 'receipt';
  synced?: boolean;
  createdAt: number;
}

class LedgerDB extends Dexie {
  entries!: Dexie.Table<LedgerLocal, number>;
  constructor() {
    super('digbahi_ledger');
    this.version(1).stores({ entries: '++id, date, type, synced, createdAt' });
  }
}

const ledgerDB = new LedgerDB();

export async function getLedger() { return ledgerDB.entries.orderBy('createdAt').reverse().toArray(); }
export async function addEntry(entry: Omit<LedgerLocal, 'createdAt' | 'synced'>) {
  return ledgerDB.entries.add({ ...entry, createdAt: Date.now(), synced: false });
}
export async function deleteEntry(id: number) { return ledgerDB.entries.delete(id); }
export async function markSynced(ids: number[]) { return ledgerDB.entries.where('id').anyOf(ids).modify({ synced: true }); }

export async function syncPending() {
  const pending = await ledgerDB.entries.where('synced').equals(false).toArray();
  if (pending.length === 0) return 0;
  const res = await api.sync(pending);
  if (res?.ok) await markSynced(pending.map(e => e.id!).filter(Boolean));
  return pending.length;
}


