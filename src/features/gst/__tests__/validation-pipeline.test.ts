import { runValidation, ValidationInput } from '../services/validation-pipeline.service';

const valid: ValidationInput = {
  buyerGstin: '29AABCE2134J1ZR',
  invoiceNumber: 'INV-2024-001',
  invoiceDate: '2024-04-15',
  placeOfSupply: 29,
  companyStateCode: 29,
  isInterState: false,
  taxableValuePaise: 100000,
  igstPaise: 0,
  cgstPaise: 9000,
  sgstPaise: 9000,
  cessPaise: 0,
  totalPaise: 118000,
  gstRate: 18,
  returnPeriod: '2024-04',
};

describe('Validation Pipeline', () => {
  test('valid invoice produces no errors', () => {
    expect(runValidation(valid).filter(r => r.severity === 'ERROR')).toHaveLength(0);
  });

  test('invalid GSTIN format → ERROR GST-001', () => {
    expect(runValidation({ ...valid, buyerGstin: 'INVALID' }).some(r => r.ruleCode === 'GST-001' && r.severity === 'ERROR')).toBe(true);
  });

  test('invoice number > 16 chars → ERROR DOC-001', () => {
    expect(runValidation({ ...valid, invoiceNumber: 'INV-2024-VERY-VERY-LONG' }).some(r => r.ruleCode === 'DOC-001')).toBe(true);
  });

  test('special chars in invoice number → ERROR DOC-002', () => {
    expect(runValidation({ ...valid, invoiceNumber: 'INV@2024' }).some(r => r.ruleCode === 'DOC-002')).toBe(true);
  });

  test('CGST ≠ SGST intra-state → ERROR TAX-002', () => {
    expect(runValidation({ ...valid, cgstPaise: 9000, sgstPaise: 8500 }).some(r => r.ruleCode === 'TAX-002')).toBe(true);
  });

  test('IGST on intra-state → ERROR TAX-003', () => {
    expect(runValidation({ ...valid, isInterState: false, igstPaise: 18000, cgstPaise: 0, sgstPaise: 0 }).some(r => r.ruleCode === 'TAX-003')).toBe(true);
  });

  test('CGST+SGST on inter-state → ERROR TAX-004', () => {
    expect(runValidation({ ...valid, isInterState: true, igstPaise: 0, cgstPaise: 9000, sgstPaise: 9000 }).some(r => r.ruleCode === 'TAX-004')).toBe(true);
  });

  test('total mismatch → ERROR TAX-005', () => {
    expect(runValidation({ ...valid, totalPaise: 120000 }).some(r => r.ruleCode === 'TAX-005')).toBe(true);
  });

  test('future date → ERROR DOC-003', () => {
    expect(runValidation({ ...valid, invoiceDate: '2099-01-01' }).some(r => r.ruleCode === 'DOC-003')).toBe(true);
  });

  test('POS inter-state but intra-state tax → ERROR POS-002', () => {
    // placeOfSupply=6 (different state) but isInterState=false (using CGST+SGST)
    expect(runValidation({ ...valid, placeOfSupply: 6, isInterState: false }).some(r => r.ruleCode === 'POS-002')).toBe(true);
  });

  test('reverse charge without GSTIN → ERROR RC-001', () => {
    expect(runValidation({ ...valid, buyerGstin: undefined, reverseCharge: true }).some(r => r.ruleCode === 'RC-001')).toBe(true);
  });

  test('reverse charge with GSTIN present → no RC-001', () => {
    expect(runValidation({ ...valid, reverseCharge: true }).some(r => r.ruleCode === 'RC-001')).toBe(false);
  });

  test('reverse charge on B2CS → ERROR RC-002', () => {
    expect(runValidation({ ...valid, buyerGstin: undefined, reverseCharge: true, invoiceType: 'B2CS' }).some(r => r.ruleCode === 'RC-002')).toBe(true);
  });

  test('reverse charge on B2B → no RC-002', () => {
    expect(runValidation({ ...valid, reverseCharge: true, invoiceType: 'B2B' }).some(r => r.ruleCode === 'RC-002')).toBe(false);
  });

  test('no reverse charge flag → no RC rules fire', () => {
    const results = runValidation({ ...valid, reverseCharge: false, invoiceType: 'B2B' });
    expect(results.some(r => r.ruleCode === 'RC-001' || r.ruleCode === 'RC-002')).toBe(false);
  });
});
