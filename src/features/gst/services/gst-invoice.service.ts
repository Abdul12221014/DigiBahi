import { db } from '@/lib/db';
import type { GSTInvoice, GSTValidation } from '../types/gst-invoice.types';
import { classifyInvoice } from './invoice-classifier.service';
import { splitTax, toPaise } from './tax-splitter.service';
import { runValidation, getValidationStatus } from './validation-pipeline.service';

export interface InvoiceFormData {
  returnPeriod: string;       // 'YYYY-MM'
  invoiceNumber: string;
  invoiceDate: string;        // 'YYYY-MM-DD'
  buyerGstin?: string;
  buyerName?: string;
  taxableValueRupees: number;
  gstRate: number;
  placeOfSupply: number;
  reverseCharge?: boolean;
  isExport?: boolean;
  exportWithPayment?: boolean;
  isSEZ?: boolean;
  isCredit?: boolean;
  hsnCode?: string;
  hsnType?: 'HSN' | 'SAC';
  cessRate?: number;
  // Optional override — if provided, taxes are NOT auto-computed.
  // Useful when user enters exact amounts from a physical invoice.
  manualTaxes?: {
    igstPaise: number;
    cgstPaise: number;
    sgstPaise: number;
    cessPaise: number;
    totalPaise: number;
  };
}

export interface ComputedInvoice {
  invoice: Omit<GSTInvoice, 'id' | 'createdAt' | 'updatedAt'>;
  validationResults: ReturnType<typeof runValidation>;
}

/** Pure function — classify + split + validate without touching the DB. */
export function computeInvoiceFields(
  data: InvoiceFormData,
  companyStateCode: number,
): ComputedInvoice {
  const {
    returnPeriod, invoiceNumber, invoiceDate, buyerGstin, buyerName,
    taxableValueRupees, gstRate, placeOfSupply, reverseCharge = false,
    isExport = false, exportWithPayment = false, isSEZ = false,
    isCredit = false, hsnCode, hsnType, cessRate = 0, manualTaxes,
  } = data;

  const isInterState = placeOfSupply !== companyStateCode;

  const invoiceType = classifyInvoice({
    buyerGstin,
    companyStateCode,
    placeOfSupply,
    totalAmountPaise: toPaise(taxableValueRupees * (1 + gstRate / 100)),
    reverseCharge,
    isExport,
    exportWithPayment,
    isSEZ,
    isCredit,
  });

  let taxes: { igstPaise: number; cgstPaise: number; sgstPaise: number; cessPaise: number; totalPaise: number };

  if (manualTaxes) {
    taxes = manualTaxes;
  } else {
    const split = splitTax({ taxableValueRupees, gstRate, isInterState, cessRate });
    taxes = {
      igstPaise: split.igstPaise,
      cgstPaise: split.cgstPaise,
      sgstPaise: split.sgstPaise,
      cessPaise: split.cessPaise,
      totalPaise: split.totalPaise,
    };
  }

  const taxableValuePaise = toPaise(taxableValueRupees);

  const validationResults = runValidation({
    buyerGstin,
    invoiceNumber,
    invoiceDate,
    placeOfSupply,
    companyStateCode,
    isInterState,
    taxableValuePaise,
    igstPaise: taxes.igstPaise,
    cgstPaise: taxes.cgstPaise,
    sgstPaise: taxes.sgstPaise,
    cessPaise: taxes.cessPaise,
    totalPaise: taxes.totalPaise,
    gstRate,
    returnPeriod,
    hsnCode,
  });

  const validationStatus = getValidationStatus(validationResults);

  const invoice: Omit<GSTInvoice, 'id' | 'createdAt' | 'updatedAt'> = {
    ledgerId: 0,  // caller can set via optional override
    returnPeriod,
    invoiceType,
    buyerGstin: buyerGstin?.trim().toUpperCase(),
    buyerName,
    invoiceNumber,
    invoiceDate,
    placeOfSupply,
    isInterState,
    reverseCharge,
    taxableValuePaise,
    ...taxes,
    hsnCode,
    hsnType,
    gstRate,
    validationStatus,
    filingStatus: 'PENDING',
  };

  return { invoice, validationResults };
}

/** Persist a new invoice + its validations atomically. Returns the new invoice id. */
export async function saveGSTInvoice(
  data: InvoiceFormData,
  companyStateCode: number,
  ledgerId = 0,
): Promise<number> {
  const { invoice, validationResults } = computeInvoiceFields(data, companyStateCode);
  const now = new Date().toISOString();
  const toStore: GSTInvoice = { ...invoice, ledgerId, createdAt: now, updatedAt: now };

  return db.transaction('rw', db.gstInvoices, db.gstValidations, async () => {
    const id = await db.gstInvoices.add(toStore);
    if (validationResults.length > 0) {
      const vals: GSTValidation[] = validationResults.map(r => ({
        gstInvoiceId: id,
        ruleCode: r.ruleCode,
        severity: r.severity,
        message: r.message,
        fieldName: r.fieldName,
        currentValue: r.currentValue,
        resolutionHint: r.resolutionHint,
        createdAt: now,
      }));
      await db.gstValidations.bulkAdd(vals);
    }
    return id;
  });
}

/** Update an existing invoice in-place: re-runs the full pipeline and replaces validations. */
export async function updateGSTInvoice(
  id: number,
  data: InvoiceFormData,
  companyStateCode: number,
  ledgerId?: number,
): Promise<void> {
  const { invoice, validationResults } = computeInvoiceFields(data, companyStateCode);
  const now = new Date().toISOString();

  await db.transaction('rw', db.gstInvoices, db.gstValidations, async () => {
    const existing = await db.gstInvoices.get(id);
    if (!existing) throw new Error(`GSTInvoice ${id} not found`);

    await db.gstInvoices.update(id, {
      ...invoice,
      ledgerId: ledgerId ?? existing.ledgerId,
      // Preserve filing status — don't reset a filed invoice on re-validate
      filingStatus: existing.filingStatus,
      updatedAt: now,
    });

    // Replace all non-fixed validations with fresh results
    const oldVals = await db.gstValidations.where('gstInvoiceId').equals(id).toArray();
    const fixedIds = oldVals.filter(v => v.fixedAt || v.ignoredAt).map(v => v.id!);
    const staleIds = oldVals.filter(v => !v.fixedAt && !v.ignoredAt).map(v => v.id!);
    await db.gstValidations.bulkDelete(staleIds);

    if (validationResults.length > 0) {
      const newVals: GSTValidation[] = validationResults.map(r => ({
        gstInvoiceId: id,
        ruleCode: r.ruleCode,
        severity: r.severity,
        message: r.message,
        fieldName: r.fieldName,
        currentValue: r.currentValue,
        resolutionHint: r.resolutionHint,
        createdAt: now,
      }));
      await db.gstValidations.bulkAdd(newVals);
    }

    // Re-derive status from surviving fixed records + new results
    const surviving = fixedIds.length
      ? await db.gstValidations.bulkGet(fixedIds)
      : [];
    const allActive = [
      ...surviving.filter(Boolean).map(v => v!),
      ...validationResults,
    ];
    const newStatus = getValidationStatus(allActive.map(v => ({
      ruleCode: v.ruleCode ?? (v as { ruleCode?: string }).ruleCode ?? '',
      severity: v.severity,
      message: v.message ?? '',
      resolutionHint: (v as GSTValidation).resolutionHint ?? '',
    })));
    await db.gstInvoices.update(id, { validationStatus: newStatus });
  });
}

/** Delete an invoice and all its validation records. */
export async function deleteGSTInvoice(id: number): Promise<void> {
  await db.transaction('rw', db.gstInvoices, db.gstValidations, async () => {
    await db.gstValidations.where('gstInvoiceId').equals(id).delete();
    await db.gstInvoices.delete(id);
  });
}

/** Fetch a single invoice with its validations. */
export async function getGSTInvoice(
  id: number,
): Promise<{ invoice: GSTInvoice; validations: GSTValidation[] } | null> {
  const invoice = await db.gstInvoices.get(id);
  if (!invoice) return null;
  const validations = await db.gstValidations.where('gstInvoiceId').equals(id).toArray();
  return { invoice, validations };
}
