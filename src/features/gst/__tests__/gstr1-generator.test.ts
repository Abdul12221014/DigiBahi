import { generateGSTR1Sections } from '../services/gstr1-generator.service';
import type { GSTInvoice } from '../types/gst-invoice.types';

function base(overrides: Partial<GSTInvoice> = {}): GSTInvoice {
  return {
    id: 1,
    ledgerId: 1,
    returnPeriod: '2024-04',
    invoiceType: 'B2B',
    buyerGstin: '29AABCE2134J1ZR',
    invoiceNumber: 'INV-001',
    invoiceDate: '2024-04-15',
    placeOfSupply: 29,
    isInterState: false,
    reverseCharge: false,
    taxableValuePaise: 100000,
    igstPaise: 0,
    cgstPaise: 9000,
    sgstPaise: 9000,
    cessPaise: 0,
    totalPaise: 118000,
    gstRate: 18,
    validationStatus: 'VALID',
    filingStatus: 'PENDING',
    createdAt: '2024-04-15T00:00:00Z',
    updatedAt: '2024-04-15T00:00:00Z',
    ...overrides,
  };
}

describe('GSTR-1 Generator', () => {
  test('B2B invoice appears in b2b section with correct ctin and inum', () => {
    const sections = generateGSTR1Sections([base()], 29);
    expect(sections.b2b).toHaveLength(1);
    expect(sections.b2b[0].ctin).toBe('29AABCE2134J1ZR');
    expect(sections.b2b[0].inv[0].inum).toBe('INV-001');
  });

  test('B2B invoice date formatted as DD-MM-YYYY', () => {
    const sections = generateGSTR1Sections([base()], 29);
    expect(sections.b2b[0].inv[0].idt).toBe('15-04-2024');
  });

  test('B2B invoice amount converted to rupees (118000 paise → 1180)', () => {
    const sections = generateGSTR1Sections([base()], 29);
    expect(sections.b2b[0].inv[0].val).toBe(1180);
  });

  test('B2B_RCM also goes into b2b section', () => {
    const sections = generateGSTR1Sections([base({ invoiceType: 'B2B_RCM', reverseCharge: true })], 29);
    expect(sections.b2b).toHaveLength(1);
    expect(sections.b2b[0].inv[0].rchrg).toBe('Y');
  });

  test('B2CS invoice appears in b2cs section', () => {
    const inv = base({ invoiceType: 'B2CS', buyerGstin: undefined, isInterState: false, igstPaise: 0, cgstPaise: 9000, sgstPaise: 9000 });
    const sections = generateGSTR1Sections([inv], 29);
    expect(sections.b2cs).toHaveLength(1);
    expect(sections.b2cs[0].rt).toBe(18);
    expect(sections.b2cs[0].txval).toBe(1000);
  });

  test('B2CS invoices with same POS+rate are consolidated', () => {
    const inv1 = base({ id: 1, invoiceType: 'B2CS', buyerGstin: undefined, taxableValuePaise: 50000, igstPaise: 0, cgstPaise: 4500, sgstPaise: 4500, totalPaise: 59000 });
    const inv2 = base({ id: 2, invoiceType: 'B2CS', buyerGstin: undefined, taxableValuePaise: 50000, igstPaise: 0, cgstPaise: 4500, sgstPaise: 4500, totalPaise: 59000 });
    const sections = generateGSTR1Sections([inv1, inv2], 29);
    expect(sections.b2cs).toHaveLength(1);
    expect(sections.b2cs[0].txval).toBe(1000); // 50000+50000=100000 paise = 1000 rupees
  });

  test('EXP_WITH_PAY appears in exp section as WPAY', () => {
    const inv = base({ invoiceType: 'EXP_WITH_PAY', buyerGstin: undefined, isInterState: true, igstPaise: 18000, cgstPaise: 0, sgstPaise: 0, placeOfSupply: 96 });
    const sections = generateGSTR1Sections([inv], 29);
    expect(sections.exp).toHaveLength(1);
    expect(sections.exp[0].exp_typ).toBe('WPAY');
    expect(sections.exp[0].inv[0].inum).toBe('INV-001');
  });

  test('EXP_WITHOUT_PAY appears in exp section as WOPAY', () => {
    const inv = base({ invoiceType: 'EXP_WITHOUT_PAY', buyerGstin: undefined, isInterState: true, igstPaise: 0, cgstPaise: 0, sgstPaise: 0, placeOfSupply: 96 });
    const sections = generateGSTR1Sections([inv], 29);
    expect(sections.exp[0].exp_typ).toBe('WOPAY');
  });

  test('ERROR status invoices are excluded', () => {
    const inv = base({ validationStatus: 'ERROR' });
    const sections = generateGSTR1Sections([inv], 29);
    expect(sections.b2b).toHaveLength(0);
  });

  test('VALID and WARNING status invoices are included', () => {
    const inv1 = base({ id: 1, validationStatus: 'VALID' });
    const inv2 = base({ id: 2, invoiceNumber: 'INV-002', validationStatus: 'WARNING' });
    const sections = generateGSTR1Sections([inv1, inv2], 29);
    expect(sections.b2b[0].inv).toHaveLength(2);
  });

  test('multiple B2B buyers grouped separately', () => {
    const inv1 = base({ id: 1, buyerGstin: '29AABCE2134J1ZR' });
    const inv2 = base({ id: 2, invoiceNumber: 'INV-002', buyerGstin: '27AAACR5055K1ZV' });
    const sections = generateGSTR1Sections([inv1, inv2], 29);
    expect(sections.b2b).toHaveLength(2);
  });

  test('B2CL invoice appears in b2cl section', () => {
    const inv = base({ invoiceType: 'B2CL', buyerGstin: undefined, isInterState: true, igstPaise: 18000, cgstPaise: 0, sgstPaise: 0, placeOfSupply: 27 });
    const sections = generateGSTR1Sections([inv], 29);
    expect(sections.b2cl).toHaveLength(1);
  });

  test('empty invoices array returns empty sections', () => {
    const sections = generateGSTR1Sections([], 29);
    expect(sections.b2b).toHaveLength(0);
    expect(sections.b2cs).toHaveLength(0);
    expect(sections.b2cl).toHaveLength(0);
    expect(sections.exp).toHaveLength(0);
    expect(sections.cdnr).toHaveLength(0);
    expect(sections.cdnur).toHaveLength(0);
  });
});
