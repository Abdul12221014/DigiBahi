import { db } from '@/lib/db';
import type { GSTInvoice, GSTValidation } from '../types/gst-invoice.types';
import { splitTax, toRupees } from './tax-splitter.service';
import { classifyInvoice } from './invoice-classifier.service';
import { runValidation, getValidationStatus } from './validation-pipeline.service';

/** Rule codes that this service can automatically correct. */
export const FIXABLE_RULES = new Set(['TAX-003', 'TAX-004', 'POS-002', 'POS-003']);

export interface AutoFixResult {
  ruleCode: string;
  applied: boolean;
  reason?: string;
  patch?: Partial<GSTInvoice>;
}

/**
 * Pure function — given one invoice and one fixable validation, compute the
 * corrected field values. Returns null when the rule is not fixable or the
 * fix cannot be determined safely.
 */
export function computeFix(
  invoice: GSTInvoice,
  validation: GSTValidation,
  companyStateCode: number,
): Partial<GSTInvoice> | null {
  const { ruleCode } = validation;
  const taxableRupees = toRupees(invoice.taxableValuePaise);
  const gstRate = invoice.gstRate;

  // TAX-003: IGST was applied on intra-state → replace with CGST + SGST
  if (ruleCode === 'TAX-003') {
    const totalTaxPaise = invoice.igstPaise + invoice.cgstPaise + invoice.sgstPaise;
    const cgst = Math.round(totalTaxPaise / 2);
    const sgst = totalTaxPaise - cgst;
    return {
      igstPaise: 0,
      cgstPaise: cgst,
      sgstPaise: sgst,
      totalPaise: invoice.taxableValuePaise + cgst + sgst + invoice.cessPaise,
    };
  }

  // TAX-004: CGST/SGST was applied on inter-state → replace with IGST
  if (ruleCode === 'TAX-004') {
    const totalTaxPaise = invoice.igstPaise + invoice.cgstPaise + invoice.sgstPaise;
    return {
      igstPaise: totalTaxPaise,
      cgstPaise: 0,
      sgstPaise: 0,
      totalPaise: invoice.taxableValuePaise + totalTaxPaise + invoice.cessPaise,
    };
  }

  // POS-002: POS says inter-state but CGST+SGST applied → switch to IGST
  // The fix is to recalculate taxes with isInterState=true
  if (ruleCode === 'POS-002') {
    if (!invoice.isInterState) {
      const split = splitTax({ taxableValueRupees: taxableRupees, gstRate, isInterState: true });
      const newType = classifyInvoice({
        buyerGstin: invoice.buyerGstin,
        companyStateCode,
        placeOfSupply: invoice.placeOfSupply,
        totalAmountPaise: split.totalPaise,
        reverseCharge: invoice.reverseCharge,
        isExport: false,
        isSEZ: false,
        isCredit: false,
      });
      return {
        isInterState: true,
        invoiceType: newType,
        igstPaise: split.igstPaise,
        cgstPaise: split.cgstPaise,
        sgstPaise: split.sgstPaise,
        cessPaise: split.cessPaise,
        totalPaise: split.totalPaise,
      };
    }
    return null;
  }

  // POS-003: POS says intra-state but IGST applied → switch to CGST+SGST
  if (ruleCode === 'POS-003') {
    if (invoice.isInterState) {
      const split = splitTax({ taxableValueRupees: taxableRupees, gstRate, isInterState: false });
      const newType = classifyInvoice({
        buyerGstin: invoice.buyerGstin,
        companyStateCode,
        placeOfSupply: invoice.placeOfSupply,
        totalAmountPaise: split.totalPaise,
        reverseCharge: invoice.reverseCharge,
        isExport: false,
        isSEZ: false,
        isCredit: false,
      });
      return {
        isInterState: false,
        invoiceType: newType,
        igstPaise: split.igstPaise,
        cgstPaise: split.cgstPaise,
        sgstPaise: split.sgstPaise,
        cessPaise: split.cessPaise,
        totalPaise: split.totalPaise,
      };
    }
    return null;
  }

  return null;
}

/**
 * Apply all fixable validations for one invoice.
 * Patches the invoice, marks fixed validations, and re-derives validationStatus.
 * Returns a summary of what was applied.
 */
export async function applyAllFixes(
  invoiceId: number,
  companyStateCode: number,
): Promise<AutoFixResult[]> {
  const invoice = await db.gstInvoices.get(invoiceId);
  if (!invoice) throw new Error(`GSTInvoice ${invoiceId} not found`);

  const validations = await db.gstValidations
    .where('gstInvoiceId').equals(invoiceId)
    .filter(v => !v.fixedAt && !v.ignoredAt && FIXABLE_RULES.has(v.ruleCode))
    .toArray();

  if (validations.length === 0) return [];

  const results: AutoFixResult[] = [];
  const now = new Date().toISOString();

  // Accumulate patches — apply in order, re-reading the latest working copy
  let working: GSTInvoice = { ...invoice };

  for (const val of validations) {
    const patch = computeFix(working, val, companyStateCode);
    if (patch) {
      working = { ...working, ...patch };
      results.push({ ruleCode: val.ruleCode, applied: true, patch });
    } else {
      results.push({ ruleCode: val.ruleCode, applied: false, reason: 'No fix available' });
    }
  }

  const applied = results.filter(r => r.applied);
  if (applied.length === 0) return results;

  // Re-validate the patched invoice to get the new status
  const revalidated = runValidation({
    buyerGstin: working.buyerGstin,
    invoiceNumber: working.invoiceNumber,
    invoiceDate: working.invoiceDate,
    placeOfSupply: working.placeOfSupply,
    companyStateCode,
    isInterState: working.isInterState,
    reverseCharge: working.reverseCharge,
    invoiceType: working.invoiceType,
    taxableValuePaise: working.taxableValuePaise,
    igstPaise: working.igstPaise,
    cgstPaise: working.cgstPaise,
    sgstPaise: working.sgstPaise,
    cessPaise: working.cessPaise,
    totalPaise: working.totalPaise,
    gstRate: working.gstRate,
    returnPeriod: working.returnPeriod,
    hsnCode: working.hsnCode,
  });
  const newStatus = getValidationStatus(revalidated);

  await db.transaction('rw', db.gstInvoices, db.gstValidations, async () => {
    // Write the patched invoice fields + new status
    await db.gstInvoices.update(invoiceId, {
      ...working,
      validationStatus: newStatus,
      updatedAt: now,
    });

    // Mark applied validations as fixed
    const fixedIds = validations
      .filter((_, i) => results[i].applied)
      .map(v => v.id!);
    for (const id of fixedIds) {
      await db.gstValidations.update(id, { fixedAt: now });
    }
  });

  return results;
}
