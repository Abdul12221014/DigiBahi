import type { GSTInvoice } from '../types/gst-invoice.types';

test('GSTInvoice type has required fields', () => {
  const inv: GSTInvoice = {
    ledgerId: 1,
    returnPeriod: '2024-04',
    invoiceType: 'B2B',
    invoiceNumber: 'INV-001',
    invoiceDate: '2024-04-01',
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
    validationStatus: 'PENDING',
    filingStatus: 'PENDING',
    createdAt: '2024-04-01T00:00:00.000Z',
    updatedAt: '2024-04-01T00:00:00.000Z',
  };
  expect(inv.ledgerId).toBe(1);
  expect(inv.invoiceType).toBe('B2B');
});
