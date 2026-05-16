import type { GSTValidation, ValidationSeverity } from '../types/gst-invoice.types';
import { validateGSTIN } from './gstin-validator.service';

export interface ValidationInput {
  buyerGstin?: string;
  invoiceNumber: string;
  invoiceDate: string;
  placeOfSupply: number;
  companyStateCode: number;
  isInterState: boolean;
  taxableValuePaise: number;
  igstPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  cessPaise: number;
  totalPaise: number;
  gstRate: number;
  returnPeriod: string;
  hsnCode?: string;
}

export type ValidationResult = Omit<GSTValidation,
  'id' | 'gstInvoiceId' | 'createdAt' | 'fixedAt' | 'ignoredAt' | 'ignoredReason'>;

function rule(
  ruleCode: string,
  severity: ValidationSeverity,
  message: string,
  resolutionHint: string,
  fieldName?: string,
  currentValue?: string,
): ValidationResult {
  return { ruleCode, severity, message, resolutionHint, fieldName, currentValue };
}

export function runValidation(input: ValidationInput): ValidationResult[] {
  const results: ValidationResult[] = [];
  const { buyerGstin, invoiceNumber, invoiceDate, placeOfSupply,
          companyStateCode, isInterState, igstPaise, cgstPaise, sgstPaise,
          totalPaise, taxableValuePaise, cessPaise } = input;

  // GST-001: GSTIN format
  if (buyerGstin) {
    const g = validateGSTIN(buyerGstin.toUpperCase());
    if (!g.formatValid) {
      results.push(rule('GST-001', 'ERROR',
        `Buyer GSTIN "${buyerGstin}" format is invalid`,
        'GSTIN must be 15 chars: 2-digit state code + PAN + entity + Z + check digit',
        'buyerGstin', buyerGstin));
    } else if (!g.stateCodeValid) {
      results.push(rule('GST-002', 'ERROR',
        `GSTIN state code "${buyerGstin.substring(0,2)}" is not a valid state code`,
        'First 2 digits of GSTIN must be a valid Indian state/UT code',
        'buyerGstin', buyerGstin));
    } else if (!g.checksumValid) {
      results.push(rule('GST-006', 'WARNING',
        `GSTIN "${buyerGstin}" checksum mismatch — possible typo`,
        "Double-check each character against the buyer's GST certificate",
        'buyerGstin', buyerGstin));
    }
  }

  // TAX-002: CGST must equal SGST (intra-state)
  if (!isInterState && cgstPaise !== sgstPaise) {
    results.push(rule('TAX-002', 'ERROR',
      `CGST (₹${cgstPaise/100}) ≠ SGST (₹${sgstPaise/100}) — must be equal for intra-state`,
      'For intra-state supplies CGST and SGST are always equal (half the total GST each)',
      'cgstPaise'));
  }

  // TAX-003: No IGST on intra-state
  if (!isInterState && igstPaise > 0) {
    results.push(rule('TAX-003', 'ERROR',
      `IGST ₹${igstPaise/100} must be 0 for intra-state supply`,
      'Intra-state supplies use CGST + SGST. Set IGST to 0',
      'igstPaise', String(igstPaise)));
  }

  // TAX-004: No CGST/SGST on inter-state
  if (isInterState && (cgstPaise > 0 || sgstPaise > 0)) {
    results.push(rule('TAX-004', 'ERROR',
      'CGST/SGST must be 0 for inter-state supply — use IGST instead',
      'Inter-state supplies use IGST only. Set CGST and SGST to 0',
      'cgstPaise'));
  }

  // TAX-005: Total must equal taxable + taxes (±1 paise tolerance)
  const expectedTotal = taxableValuePaise + igstPaise + cgstPaise + sgstPaise + cessPaise;
  if (Math.abs(expectedTotal - totalPaise) > 1) {
    results.push(rule('TAX-005', 'ERROR',
      `Invoice total ₹${totalPaise/100} ≠ taxable + taxes (expected ₹${expectedTotal/100})`,
      'Total = Taxable Value + IGST + CGST + SGST + Cess',
      'totalPaise'));
  }

  // DOC-001: Invoice number max 16 chars
  if (invoiceNumber.length > 16) {
    results.push(rule('DOC-001', 'ERROR',
      `Invoice number "${invoiceNumber}" is ${invoiceNumber.length} chars — max is 16`,
      'Shorten to 16 characters. GSTN portal rejects longer numbers',
      'invoiceNumber', invoiceNumber));
  }

  // DOC-002: Only letters, numbers, /, -
  if (!/^[a-zA-Z0-9/\-]+$/.test(invoiceNumber)) {
    results.push(rule('DOC-002', 'ERROR',
      `Invoice number "${invoiceNumber}" contains disallowed characters`,
      'Only letters, numbers, / and - are allowed in invoice numbers',
      'invoiceNumber', invoiceNumber));
  }

  // DOC-003: No future dates
  const invDate = new Date(invoiceDate);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  if (invDate > todayEnd) {
    results.push(rule('DOC-003', 'ERROR',
      `Invoice date "${invoiceDate}" is in the future`,
      'Set the invoice date to today or a past date',
      'invoiceDate', invoiceDate));
  }

  // POS-002: POS is inter-state but tax type is intra-state
  const posIsInterState = placeOfSupply !== companyStateCode;
  if (!isInterState && posIsInterState) {
    results.push(rule('POS-002', 'ERROR',
      `Place of Supply (state ${placeOfSupply}) differs from your state (${companyStateCode}) but CGST+SGST applied`,
      'This is inter-state. Switch to IGST and set CGST/SGST to 0',
      'placeOfSupply'));
  }

  // POS-003: POS is intra-state but tax type is inter-state
  if (isInterState && !posIsInterState) {
    results.push(rule('POS-003', 'ERROR',
      `Place of Supply (state ${placeOfSupply}) is your own state but IGST applied`,
      'This is intra-state. Switch to CGST+SGST and set IGST to 0',
      'placeOfSupply'));
  }

  return results;
}

export function getValidationStatus(results: ValidationResult[]): 'VALID' | 'WARNING' | 'ERROR' {
  if (results.some(r => r.severity === 'ERROR')) return 'ERROR';
  if (results.some(r => r.severity === 'WARNING')) return 'WARNING';
  return 'VALID';
}
