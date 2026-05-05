import { penDB } from '@/lib/localStore';
import { db } from '@/lib/db';

export async function exportBackup(): Promise<Blob> {
  const [
    strokes, shapes, ocr,
    ledger, customerContacts, companySettings,
    creditEntries, gstRecords,
    upiIntents, syncQueue, analyticsEvents,
  ] = await Promise.all([
    penDB.strokes.toArray(),
    penDB.shapes.toArray(),
    penDB.ocr.toArray(),
    db.ledger.toArray(),
    db.customerContacts.toArray(),
    db.companySettings.toArray(),
    db.creditEntries.toArray(),
    db.gstRecords.toArray(),
    db.upiIntents.toArray(),
    db.syncQueue.toArray(),
    db.analyticsEvents.toArray(),
  ]);

  const snapshot = {
    version: 3,
    date: Date.now(),
    // Pen data
    strokes,
    shapes,
    ocr,
    // Accounting data
    ledger,
    customerContacts,
    companySettings,
    creditEntries,
    gstRecords,
    // Payments / sync
    upiIntents,
    syncQueue,
    analyticsEvents,
  };

  const data = new TextEncoder().encode(JSON.stringify(snapshot));
  return new Blob([data], { type: 'application/octet-stream' });
}

export async function importBackup(file: File) {
  const buf = await file.arrayBuffer();
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf)));
  if (!json || typeof json !== 'object') throw new Error('Invalid backup');

  // Restore pen data
  await penDB.transaction('rw', penDB.strokes, penDB.shapes, penDB.ocr, async () => {
    await Promise.all([penDB.strokes.clear(), penDB.shapes.clear(), penDB.ocr.clear()]);
    if (Array.isArray(json.strokes)) await penDB.strokes.bulkAdd(json.strokes);
    if (Array.isArray(json.shapes)) await penDB.shapes.bulkAdd(json.shapes);
    if (Array.isArray(json.ocr)) await penDB.ocr.bulkAdd(json.ocr);
  });

  // Restore accounting data (version 2+ backups)
  if (json.version >= 2) {
    await db.transaction(
      'rw',
      db.ledger, db.customerContacts, db.companySettings,
      db.creditEntries, db.gstRecords,
      async () => {
        await Promise.all([
          db.ledger.clear(),
          db.customerContacts.clear(),
          db.companySettings.clear(),
          db.creditEntries.clear(),
          db.gstRecords.clear(),
        ]);
        if (Array.isArray(json.ledger)) await db.ledger.bulkAdd(json.ledger);
        if (Array.isArray(json.customerContacts)) await db.customerContacts.bulkAdd(json.customerContacts);
        if (Array.isArray(json.companySettings)) await db.companySettings.bulkAdd(json.companySettings);
        if (Array.isArray(json.creditEntries)) await db.creditEntries.bulkAdd(json.creditEntries);
        if (Array.isArray(json.gstRecords)) await db.gstRecords.bulkAdd(json.gstRecords);
      }
    );
  }

  // Restore payments / sync data (version 3+ backups)
  if (json.version >= 3) {
    await db.transaction(
      'rw',
      db.upiIntents, db.syncQueue, db.analyticsEvents,
      async () => {
        await Promise.all([
          db.upiIntents.clear(),
          db.syncQueue.clear(),
          db.analyticsEvents.clear(),
        ]);
        if (Array.isArray(json.upiIntents)) await db.upiIntents.bulkAdd(json.upiIntents);
        if (Array.isArray(json.syncQueue)) await db.syncQueue.bulkAdd(json.syncQueue);
        if (Array.isArray(json.analyticsEvents)) await db.analyticsEvents.bulkAdd(json.analyticsEvents);
      }
    );
  }
}
