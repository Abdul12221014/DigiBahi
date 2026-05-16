import { splitTax, toPaise, toRupees } from '../services/tax-splitter.service';

describe('Tax Splitter', () => {
  test('intra-state: CGST=SGST, IGST=0', () => {
    const r = splitTax({ taxableValueRupees: 1000, gstRate: 18, isInterState: false });
    expect(r.igstPaise).toBe(0);
    expect(r.cgstPaise).toBe(9000);
    expect(r.sgstPaise).toBe(9000);
    expect(r.totalPaise).toBe(118000);
  });

  test('inter-state: IGST only', () => {
    const r = splitTax({ taxableValueRupees: 1000, gstRate: 18, isInterState: true });
    expect(r.igstPaise).toBe(18000);
    expect(r.cgstPaise).toBe(0);
    expect(r.sgstPaise).toBe(0);
    expect(r.totalPaise).toBe(118000);
  });

  test('zero rate: all taxes zero', () => {
    const r = splitTax({ taxableValueRupees: 500, gstRate: 0, isInterState: false });
    expect(r.igstPaise).toBe(0);
    expect(r.cgstPaise).toBe(0);
    expect(r.sgstPaise).toBe(0);
    expect(r.totalPaise).toBe(50000);
  });

  test('5% intra-state rounds correctly', () => {
    const r = splitTax({ taxableValueRupees: 100, gstRate: 5, isInterState: false });
    expect(r.cgstPaise).toBe(250);
    expect(r.sgstPaise).toBe(250);
    expect(r.igstPaise).toBe(0);
    expect(r.totalPaise).toBe(10500);
  });

  test('taxableValuePaise matches input', () => {
    const r = splitTax({ taxableValueRupees: 1000, gstRate: 18, isInterState: false });
    expect(r.taxableValuePaise).toBe(100000);
  });

  test('toPaise and toRupees round-trip', () => {
    expect(toPaise(1.50)).toBe(150);
    expect(toRupees(150)).toBe(1.5);
  });
});
