import { classifyInvoice, ClassifyInput } from '../services/invoice-classifier.service';

const base: ClassifyInput = {
  buyerGstin: undefined,
  placeOfSupply: 29,
  companyStateCode: 29,
  totalAmountPaise: 100000,
  isExport: false,
  reverseCharge: false,
  isCredit: false,
};

describe('Invoice Classifier', () => {
  test('registered buyer same state → B2B', () => {
    expect(classifyInvoice({ ...base, buyerGstin: '29AABCE2134J1ZR' })).toBe('B2B');
  });

  test('registered buyer different state → B2B', () => {
    expect(classifyInvoice({ ...base, buyerGstin: '06AABCE2134J1ZR', placeOfSupply: 6 })).toBe('B2B');
  });

  test('unregistered buyer same state → B2CS', () => {
    expect(classifyInvoice({ ...base })).toBe('B2CS');
  });

  test('unregistered inter-state below 2.5L → B2CS', () => {
    expect(classifyInvoice({ ...base, placeOfSupply: 6, totalAmountPaise: 24999900 })).toBe('B2CS');
  });

  test('unregistered inter-state above 2.5L → B2CL', () => {
    expect(classifyInvoice({ ...base, placeOfSupply: 6, totalAmountPaise: 25000001 })).toBe('B2CL');
  });

  test('export → EXP_WITHOUT_PAY by default', () => {
    expect(classifyInvoice({ ...base, isExport: true })).toBe('EXP_WITHOUT_PAY');
  });

  test('export with payment → EXP_WITH_PAY', () => {
    expect(classifyInvoice({ ...base, isExport: true, exportWithPayment: true })).toBe('EXP_WITH_PAY');
  });

  test('RCM → B2B_RCM', () => {
    expect(classifyInvoice({ ...base, buyerGstin: '29AABCE2134J1ZR', reverseCharge: true })).toBe('B2B_RCM');
  });

  test('credit note registered → CDNR', () => {
    expect(classifyInvoice({ ...base, buyerGstin: '29AABCE2134J1ZR', isCredit: true })).toBe('CDNR');
  });

  test('credit note unregistered → CDNUR', () => {
    expect(classifyInvoice({ ...base, isCredit: true })).toBe('CDNUR');
  });
});
