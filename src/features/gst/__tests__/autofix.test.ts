import { computeFix, FIXABLE_RULES } from '../services/autofix.service';
import type { GSTInvoice, GSTValidation } from '../types/gst-invoice.types';

const STATE = 29;

function inv(overrides: Partial<GSTInvoice> = {}): GSTInvoice {
  return {
    id: 1, ledgerId: 0, returnPeriod: '2024-04',
    invoiceType: 'B2B', buyerGstin: '29AABCE2134J1ZR',
    invoiceNumber: 'INV-001', invoiceDate: '2024-04-15',
    placeOfSupply: 29, isInterState: false, reverseCharge: false,
    taxableValuePaise: 100000, igstPaise: 0, cgstPaise: 9000, sgstPaise: 9000,
    cessPaise: 0, totalPaise: 118000, gstRate: 18,
    validationStatus: 'ERROR', filingStatus: 'PENDING',
    createdAt: '2024-04-15T00:00:00Z', updatedAt: '2024-04-15T00:00:00Z',
    ...overrides,
  };
}

function val(ruleCode: string): GSTValidation {
  return {
    id: 1, gstInvoiceId: 1, ruleCode, severity: 'ERROR',
    message: 'test', resolutionHint: 'fix it', createdAt: '2024-04-15T00:00:00Z',
  };
}

describe('FIXABLE_RULES set', () => {
  test('contains TAX-003, TAX-004, POS-002, POS-003', () => {
    expect(FIXABLE_RULES.has('TAX-003')).toBe(true);
    expect(FIXABLE_RULES.has('TAX-004')).toBe(true);
    expect(FIXABLE_RULES.has('POS-002')).toBe(true);
    expect(FIXABLE_RULES.has('POS-003')).toBe(true);
    expect(FIXABLE_RULES.has('TAX-002')).toBe(false);
    expect(FIXABLE_RULES.has('DOC-001')).toBe(false);
  });
});

describe('computeFix — TAX-003 (IGST on intra-state)', () => {
  test('splits IGST into equal CGST+SGST', () => {
    const invoice = inv({ igstPaise: 18000, cgstPaise: 0, sgstPaise: 0, totalPaise: 118000 });
    const patch = computeFix(invoice, val('TAX-003'), STATE);
    expect(patch).not.toBeNull();
    expect(patch!.igstPaise).toBe(0);
    expect(patch!.cgstPaise).toBe(9000);
    expect(patch!.sgstPaise).toBe(9000);
    expect(patch!.totalPaise).toBe(118000);
  });

  test('handles odd total tax (rounding absorbed by SGST)', () => {
    // 5% of ₹1000 = ₹50 = 5000 paise → CGST=2500, SGST=2500
    const invoice = inv({ taxableValuePaise: 100000, igstPaise: 5000, cgstPaise: 0, sgstPaise: 0, totalPaise: 105000, gstRate: 5 });
    const patch = computeFix(invoice, val('TAX-003'), STATE);
    expect(patch!.cgstPaise! + patch!.sgstPaise!).toBe(5000);
    expect(patch!.igstPaise).toBe(0);
  });
});

describe('computeFix — TAX-004 (CGST/SGST on inter-state)', () => {
  test('consolidates CGST+SGST into IGST', () => {
    const invoice = inv({ isInterState: true, igstPaise: 0, cgstPaise: 9000, sgstPaise: 9000 });
    const patch = computeFix(invoice, val('TAX-004'), STATE);
    expect(patch!.igstPaise).toBe(18000);
    expect(patch!.cgstPaise).toBe(0);
    expect(patch!.sgstPaise).toBe(0);
    expect(patch!.totalPaise).toBe(118000);
  });
});

describe('computeFix — POS-002 (inter-state POS but intra-state tax)', () => {
  test('flips isInterState and recalculates to IGST', () => {
    // Invoice says intra-state (isInterState=false) but POS=27 (inter-state)
    const invoice = inv({ placeOfSupply: 27, isInterState: false, igstPaise: 0, cgstPaise: 9000, sgstPaise: 9000 });
    const patch = computeFix(invoice, val('POS-002'), STATE);
    expect(patch!.isInterState).toBe(true);
    expect(patch!.igstPaise).toBe(18000);
    expect(patch!.cgstPaise).toBe(0);
    expect(patch!.sgstPaise).toBe(0);
  });

  test('returns null when isInterState is already true', () => {
    const invoice = inv({ placeOfSupply: 27, isInterState: true });
    const patch = computeFix(invoice, val('POS-002'), STATE);
    expect(patch).toBeNull();
  });
});

describe('computeFix — POS-003 (intra-state POS but inter-state tax)', () => {
  test('flips isInterState and recalculates to CGST+SGST', () => {
    const invoice = inv({ placeOfSupply: 29, isInterState: true, igstPaise: 18000, cgstPaise: 0, sgstPaise: 0 });
    const patch = computeFix(invoice, val('POS-003'), STATE);
    expect(patch!.isInterState).toBe(false);
    expect(patch!.igstPaise).toBe(0);
    expect(patch!.cgstPaise).toBe(9000);
    expect(patch!.sgstPaise).toBe(9000);
  });

  test('returns null when isInterState is already false', () => {
    const invoice = inv({ placeOfSupply: 29, isInterState: false });
    const patch = computeFix(invoice, val('POS-003'), STATE);
    expect(patch).toBeNull();
  });
});

describe('computeFix — unfixable rules', () => {
  test('returns null for TAX-002 (CGST≠SGST — no safe auto-fix)', () => {
    expect(computeFix(inv(), val('TAX-002'), STATE)).toBeNull();
  });

  test('returns null for DOC-001 (invoice number too long)', () => {
    expect(computeFix(inv(), val('DOC-001'), STATE)).toBeNull();
  });

  test('returns null for unknown rule code', () => {
    expect(computeFix(inv(), val('UNKNOWN'), STATE)).toBeNull();
  });
});
