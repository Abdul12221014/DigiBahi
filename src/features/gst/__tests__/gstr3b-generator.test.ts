import { generateGSTR3BSections } from '../services/gstr3b-generator.service';
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

describe('GSTR-3B Generator', () => {
  test('B2B invoice goes into osup_det', () => {
    const s = generateGSTR3BSections([base()]);
    expect(s.sup_details.osup_det.txval).toBe(1000);
    expect(s.sup_details.osup_det.camt).toBe(90);
    expect(s.sup_details.osup_det.samt).toBe(90);
  });

  test('B2CS intra-state goes into osup_det only (no unreg_details entry)', () => {
    const inv = base({ invoiceType: 'B2CS', buyerGstin: undefined, isInterState: false });
    const s = generateGSTR3BSections([inv]);
    expect(s.sup_details.osup_det.txval).toBe(1000);
    expect(s.inter_sup.unreg_details).toHaveLength(0);
  });

  test('B2CS inter-state goes into osup_det AND unreg_details', () => {
    const inv = base({ invoiceType: 'B2CS', buyerGstin: undefined, isInterState: true, placeOfSupply: 27, igstPaise: 18000, cgstPaise: 0, sgstPaise: 0 });
    const s = generateGSTR3BSections([inv]);
    expect(s.sup_details.osup_det.txval).toBe(1000);
    expect(s.inter_sup.unreg_details).toHaveLength(1);
    expect(s.inter_sup.unreg_details[0].pos).toBe('27');
    expect(s.inter_sup.unreg_details[0].iamt).toBe(180);
  });

  test('B2CL goes into osup_det AND unreg_details', () => {
    const inv = base({ invoiceType: 'B2CL', buyerGstin: undefined, isInterState: true, placeOfSupply: 27, igstPaise: 18000, cgstPaise: 0, sgstPaise: 0 });
    const s = generateGSTR3BSections([inv]);
    expect(s.sup_details.osup_det.txval).toBe(1000);
    expect(s.inter_sup.unreg_details[0].pos).toBe('27');
  });

  test('unreg_details consolidated by POS', () => {
    const inv1 = base({ id: 1, invoiceType: 'B2CL', buyerGstin: undefined, isInterState: true, placeOfSupply: 27, igstPaise: 18000, cgstPaise: 0, sgstPaise: 0 });
    const inv2 = base({ id: 2, invoiceType: 'B2CL', buyerGstin: undefined, invoiceNumber: 'INV-002', isInterState: true, placeOfSupply: 27, igstPaise: 18000, cgstPaise: 0, sgstPaise: 0 });
    const s = generateGSTR3BSections([inv1, inv2]);
    expect(s.inter_sup.unreg_details).toHaveLength(1);
    expect(s.inter_sup.unreg_details[0].txval).toBe(2000);
  });

  test('EXP_WITH_PAY goes into osup_zero', () => {
    const inv = base({ invoiceType: 'EXP_WITH_PAY', buyerGstin: undefined, isInterState: true, placeOfSupply: 96, igstPaise: 18000, cgstPaise: 0, sgstPaise: 0 });
    const s = generateGSTR3BSections([inv]);
    expect(s.sup_details.osup_zero.txval).toBe(1000);
    expect(s.sup_details.osup_det.txval).toBe(0);
  });

  test('EXP_WITHOUT_PAY goes into osup_zero', () => {
    const inv = base({ invoiceType: 'EXP_WITHOUT_PAY', buyerGstin: undefined, isInterState: true, placeOfSupply: 96, igstPaise: 0, cgstPaise: 0, sgstPaise: 0 });
    const s = generateGSTR3BSections([inv]);
    expect(s.sup_details.osup_zero.txval).toBe(1000);
  });

  test('EXEMPTED goes into osup_nil_exmp', () => {
    const inv = base({ invoiceType: 'EXEMPTED', buyerGstin: undefined, igstPaise: 0, cgstPaise: 0, sgstPaise: 0, totalPaise: 100000 });
    const s = generateGSTR3BSections([inv]);
    expect(s.sup_details.osup_nil_exmp.txval).toBe(1000);
    expect(s.sup_details.osup_det.txval).toBe(0);
  });

  test('B2B_RCM goes into isup_rev only', () => {
    const inv = base({ invoiceType: 'B2B_RCM', reverseCharge: true });
    const s = generateGSTR3BSections([inv]);
    expect(s.sup_details.isup_rev.txval).toBe(1000);
    expect(s.sup_details.osup_det.txval).toBe(0);
  });

  test('ERROR invoices are excluded', () => {
    const inv = base({ validationStatus: 'ERROR' });
    const s = generateGSTR3BSections([inv]);
    expect(s.sup_details.osup_det.txval).toBe(0);
  });

  test('cess amount included in csamt', () => {
    const inv = base({ cessPaise: 5000 });
    const s = generateGSTR3BSections([inv]);
    expect(s.sup_details.osup_det.csamt).toBe(50);
  });

  test('multiple B2B invoices accumulate in osup_det', () => {
    const inv1 = base({ id: 1 });
    const inv2 = base({ id: 2, invoiceNumber: 'INV-002' });
    const s = generateGSTR3BSections([inv1, inv2]);
    expect(s.sup_details.osup_det.txval).toBe(2000);
    expect(s.sup_details.osup_det.camt).toBe(180);
  });
});
