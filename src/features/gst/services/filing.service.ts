import { db } from '@/lib/db';

export interface FilingStatus {
  total: number;
  valid: number;       // VALID or WARNING
  errors: number;
  staged: number;
  filed: number;
  readyToStage: number;  // VALID/WARNING and not yet staged or filed
  canStage: boolean;     // true when readyToStage > 0 and errors === 0
  canMarkFiled: boolean; // true when staged > 0
}

export interface FilingActionResult {
  affected: number;
  period: string;
}

/** Summarise the filing state for a return period. */
export async function getFilingStatus(returnPeriod: string): Promise<FilingStatus> {
  const invoices = await db.gstInvoices.where('returnPeriod').equals(returnPeriod).toArray();

  const errors  = invoices.filter(i => i.validationStatus === 'ERROR').length;
  const valid   = invoices.filter(i => i.validationStatus === 'VALID' || i.validationStatus === 'WARNING').length;
  const staged  = invoices.filter(i => i.filingStatus === 'STAGED').length;
  const filed   = invoices.filter(i => i.filingStatus === 'FILED').length;
  const readyToStage = invoices.filter(
    i => (i.validationStatus === 'VALID' || i.validationStatus === 'WARNING') &&
         i.filingStatus === 'PENDING',
  ).length;

  return {
    total: invoices.length,
    valid,
    errors,
    staged,
    filed,
    readyToStage,
    canStage: readyToStage > 0 && errors === 0,
    canMarkFiled: staged > 0,
  };
}

/**
 * Move all VALID/WARNING PENDING invoices to STAGED.
 * Throws if any ERROR invoices exist in the period — the caller must fix them first.
 */
export async function stageForFiling(returnPeriod: string): Promise<FilingActionResult> {
  const status = await getFilingStatus(returnPeriod);
  if (status.errors > 0) {
    throw new Error(
      `Cannot stage: ${status.errors} invoice(s) have validation errors. Fix or remove them first.`,
    );
  }
  if (status.readyToStage === 0) {
    throw new Error('No valid invoices to stage for this period.');
  }

  const now = new Date().toISOString();
  const toStage = await db.gstInvoices
    .where('returnPeriod').equals(returnPeriod)
    .filter(i =>
      (i.validationStatus === 'VALID' || i.validationStatus === 'WARNING') &&
      i.filingStatus === 'PENDING',
    )
    .toArray();

  await db.transaction('rw', db.gstInvoices, async () => {
    for (const inv of toStage) {
      await db.gstInvoices.update(inv.id!, { filingStatus: 'STAGED', updatedAt: now });
    }
  });

  return { affected: toStage.length, period: returnPeriod };
}

/**
 * Revert STAGED invoices back to PENDING — useful when corrections are needed.
 */
export async function unstageForFiling(returnPeriod: string): Promise<FilingActionResult> {
  const now = new Date().toISOString();
  const toUnstage = await db.gstInvoices
    .where('returnPeriod').equals(returnPeriod)
    .filter(i => i.filingStatus === 'STAGED')
    .toArray();

  await db.transaction('rw', db.gstInvoices, async () => {
    for (const inv of toUnstage) {
      await db.gstInvoices.update(inv.id!, { filingStatus: 'PENDING', updatedAt: now });
    }
  });

  return { affected: toUnstage.length, period: returnPeriod };
}

/**
 * Mark all STAGED invoices as FILED.
 * In production this would be called after the user confirms upload to GSTN portal.
 */
export async function markAsFiled(returnPeriod: string): Promise<FilingActionResult> {
  const status = await getFilingStatus(returnPeriod);
  if (status.staged === 0) {
    throw new Error('No staged invoices to mark as filed. Run "Stage for filing" first.');
  }

  const now = new Date().toISOString();
  const toFile = await db.gstInvoices
    .where('returnPeriod').equals(returnPeriod)
    .filter(i => i.filingStatus === 'STAGED')
    .toArray();

  await db.transaction('rw', db.gstInvoices, async () => {
    for (const inv of toFile) {
      await db.gstInvoices.update(inv.id!, { filingStatus: 'FILED', updatedAt: now });
    }
  });

  return { affected: toFile.length, period: returnPeriod };
}
