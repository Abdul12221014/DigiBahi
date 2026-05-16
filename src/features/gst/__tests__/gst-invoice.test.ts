import { computeInvoiceFields, type InvoiceFormData } from '../services/gst-invoice.service';

const STATE = 29; // Karnataka

function base(overrides: Partial<InvoiceFormData> = {}): InvoiceFormData {
  return {
    returnPeriod: '2024-04',
    invoiceNumber: 'INV-001',
    invoiceDate: '2024-04-15',
    buyerGstin: '29AABCE2134J1ZR',
    taxableValueRupees: 1000,
    gstRate: 18,
    placeOfSupply: 29,
    ...overrides,
  };
}

describe('computeInvoiceFields', () => {
  describe('invoice type classification', () => {
    test('registered buyer same state → B2B', () => {
      const { invoice } = computeInvoiceFields(base(), STATE);
      expect(invoice.invoiceType).toBe('B2B');
    });

    test('no buyer GSTIN intra-state → B2CS', () => {
      const { invoice } = computeInvoiceFields(base({ buyerGstin: undefined }), STATE);
      expect(invoice.invoiceType).toBe('B2CS');
    });

    test('no buyer GSTIN inter-state large amount → B2CL', () => {
      const { invoice } = computeInvoiceFields(
        base({ buyerGstin: undefined, placeOfSupply: 27, taxableValueRupees: 300000 }),
        STATE,
      );
      expect(invoice.invoiceType).toBe('B2CL');
    });

    test('export with payment → EXP_WITH_PAY', () => {
      const { invoice } = computeInvoiceFields(
        base({ buyerGstin: undefined, isExport: true, exportWithPayment: true, placeOfSupply: 96 }),
        STATE,
      );
      expect(invoice.invoiceType).toBe('EXP_WITH_PAY');
    });

    test('reverse charge → B2B_RCM', () => {
      const { invoice } = computeInvoiceFields(base({ reverseCharge: true }), STATE);
      expect(invoice.invoiceType).toBe('B2B_RCM');
    });
  });

  describe('tax splitting', () => {
    test('intra-state: CGST = SGST, IGST = 0', () => {
      const { invoice } = computeInvoiceFields(base(), STATE);
      expect(invoice.igstPaise).toBe(0);
      expect(invoice.cgstPaise).toBe(9000);
      expect(invoice.sgstPaise).toBe(9000);
      expect(invoice.totalPaise).toBe(118000);
    });

    test('inter-state: IGST only', () => {
      const { invoice } = computeInvoiceFields(base({ placeOfSupply: 27, buyerGstin: '27AAACR5055K1ZV' }), STATE);
      expect(invoice.igstPaise).toBe(18000);
      expect(invoice.cgstPaise).toBe(0);
      expect(invoice.sgstPaise).toBe(0);
    });

    test('manual taxes override auto-split', () => {
      const manual = { igstPaise: 5000, cgstPaise: 0, sgstPaise: 0, cessPaise: 0, totalPaise: 105000 };
      const { invoice } = computeInvoiceFields(base({ manualTaxes: manual }), STATE);
      expect(invoice.igstPaise).toBe(5000);
      expect(invoice.cgstPaise).toBe(0);
    });
  });

  describe('isInterState derivation', () => {
    test('placeOfSupply === companyStateCode → intra-state', () => {
      const { invoice } = computeInvoiceFields(base({ placeOfSupply: 29 }), 29);
      expect(invoice.isInterState).toBe(false);
    });

    test('placeOfSupply !== companyStateCode → inter-state', () => {
      const { invoice } = computeInvoiceFields(base({ placeOfSupply: 27 }), 29);
      expect(invoice.isInterState).toBe(true);
    });
  });

  describe('validationStatus', () => {
    test('clean intra-state B2B → VALID', () => {
      const { invoice, validationResults } = computeInvoiceFields(base(), STATE);
      const errors = validationResults.filter(r => r.severity === 'ERROR');
      expect(errors).toHaveLength(0);
      expect(invoice.validationStatus).toBe('VALID');
    });

    test('CGST ≠ SGST → ERROR status', () => {
      const manual = { igstPaise: 0, cgstPaise: 9000, sgstPaise: 8000, cessPaise: 0, totalPaise: 117000 };
      const { invoice, validationResults } = computeInvoiceFields(base({ manualTaxes: manual }), STATE);
      expect(validationResults.some(r => r.ruleCode === 'TAX-002')).toBe(true);
      expect(invoice.validationStatus).toBe('ERROR');
    });

    test('future date → ERROR', () => {
      const { invoice } = computeInvoiceFields(base({ invoiceDate: '2099-01-01' }), STATE);
      expect(invoice.validationStatus).toBe('ERROR');
    });

    test('invoice number > 16 chars → ERROR', () => {
      const { invoice } = computeInvoiceFields(base({ invoiceNumber: 'INV-VERY-LONG-NUMBER-2024' }), STATE);
      expect(invoice.validationStatus).toBe('ERROR');
    });

    test('GSTIN checksum mismatch → WARNING (not ERROR)', () => {
      // Valid format + state code but wrong checksum
      const { invoice } = computeInvoiceFields(base({ buyerGstin: '29AABCE2134J1ZK' }), STATE);
      const hasChecksum = invoice.validationStatus === 'WARNING';
      expect(hasChecksum).toBe(true);
    });
  });

  describe('field preservation', () => {
    test('hsnCode passed through', () => {
      const { invoice } = computeInvoiceFields(base({ hsnCode: '998311' }), STATE);
      expect(invoice.hsnCode).toBe('998311');
    });

    test('filingStatus always starts as PENDING', () => {
      const { invoice } = computeInvoiceFields(base(), STATE);
      expect(invoice.filingStatus).toBe('PENDING');
    });

    test('returnPeriod preserved', () => {
      const { invoice } = computeInvoiceFields(base({ returnPeriod: '2024-03' }), STATE);
      expect(invoice.returnPeriod).toBe('2024-03');
    });
  });
});
