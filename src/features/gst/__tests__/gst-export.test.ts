import { buildGSTR1JSON, buildGSTR3BJSON, type GSTNExportMeta } from '../services/gst-export.service';
import type { GSTInvoice } from '../types/gst-invoice.types';

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

const meta: GSTNExportMeta = {
  gstin: '29AABCE2134J1ZR',
  companyStateCode: 29,
  returnPeriod: '2024-04',
  fp: '042024',
};

function inv(overrides: Partial<GSTInvoice> = {}): GSTInvoice {
  return {
    id: 1, ledgerId: 1, returnPeriod: '2024-04',
    invoiceType: 'B2B', buyerGstin: '29AABCE2134J1ZR',
    invoiceNumber: 'INV-001', invoiceDate: '2024-04-15',
    placeOfSupply: 29, isInterState: false, reverseCharge: false,
    taxableValuePaise: 100000, igstPaise: 0, cgstPaise: 9000, sgstPaise: 9000,
    cessPaise: 0, totalPaise: 118000, gstRate: 18,
    validationStatus: 'VALID', filingStatus: 'PENDING',
    createdAt: '2024-04-15T00:00:00Z', updatedAt: '2024-04-15T00:00:00Z',
    ...overrides,
  };
}

describe('GST Export Service', () => {
  test('GSTR-1 JSON has gstin and fp fields', () => {
    const json = buildGSTR1JSON([inv()], meta) as Record<string, unknown>;
    expect(json.gstin).toBe('29AABCE2134J1ZR');
    expect(json.fp).toBe('042024');
  });

  test('GSTR-1 JSON has b2b section', () => {
    const json = buildGSTR1JSON([inv()], meta) as Record<string, unknown>;
    expect(Array.isArray(json.b2b)).toBe(true);
  });

  test('GSTR-1 JSON has all required sections', () => {
    const json = buildGSTR1JSON([inv()], meta) as Record<string, unknown>;
    expect(json).toHaveProperty('b2b');
    expect(json).toHaveProperty('b2cs');
    expect(json).toHaveProperty('b2cl');
    expect(json).toHaveProperty('exp');
    expect(json).toHaveProperty('cdnr');
    expect(json).toHaveProperty('cdnur');
  });

  test('GSTR-3B JSON has gstin and ret_period fields', () => {
    const json = buildGSTR3BJSON([inv()], meta) as Record<string, unknown>;
    expect(json.gstin).toBe('29AABCE2134J1ZR');
    expect(json.ret_period).toBe('042024');
  });

  test('GSTR-3B JSON has sup_details and inter_sup', () => {
    const json = buildGSTR3BJSON([inv()], meta) as Record<string, unknown>;
    expect(json).toHaveProperty('sup_details');
    expect(json).toHaveProperty('inter_sup');
  });

  test('GSTR-1 fp derived from returnPeriod correctly', () => {
    const marchMeta = { ...meta, returnPeriod: '2024-03' };
    const json = buildGSTR1JSON([], marchMeta) as Record<string, unknown>;
    expect(json.fp).toBe('032024');
  });

  test('empty invoices produce valid empty JSON structures', () => {
    const gstr1 = buildGSTR1JSON([], meta) as Record<string, unknown>;
    expect(gstr1.b2b).toEqual([]);
    expect(gstr1.b2cs).toEqual([]);

    const gstr3b = buildGSTR3BJSON([], meta) as Record<string, unknown>;
    const sup = (gstr3b.sup_details as Record<string, unknown>);
    const det = sup.osup_det as Record<string, number>;
    expect(det.txval).toBe(0);
  });
});
