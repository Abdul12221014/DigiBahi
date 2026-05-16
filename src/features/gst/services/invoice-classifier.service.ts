import type { InvoiceType } from '../types/gst-invoice.types';
import { isValidGSTINFormat } from './gstin-validator.service';

export interface ClassifyInput {
  buyerGstin?: string;
  placeOfSupply: number;
  companyStateCode: number;
  totalAmountPaise: number;
  isExport: boolean;
  reverseCharge: boolean;
  isCredit: boolean;
  exportWithPayment?: boolean;
  isSEZ?: boolean;
}

const B2CL_THRESHOLD_PAISE = 25_000_000; // ₹2,50,000

export function classifyInvoice(input: ClassifyInput): InvoiceType {
  const { buyerGstin, placeOfSupply, companyStateCode, totalAmountPaise,
          isExport, reverseCharge, isCredit, exportWithPayment, isSEZ } = input;

  if (isExport) return exportWithPayment ? 'EXP_WITH_PAY' : 'EXP_WITHOUT_PAY';

  const hasRegisteredBuyer = !!buyerGstin && isValidGSTINFormat(buyerGstin.toUpperCase());
  const isInterState = placeOfSupply !== companyStateCode;

  if (isSEZ) return exportWithPayment ? 'SEZ_WITH_PAY' : 'SEZ_WITHOUT_PAY';

  if (isCredit) return hasRegisteredBuyer ? 'CDNR' : 'CDNUR';

  if (hasRegisteredBuyer) return reverseCharge ? 'B2B_RCM' : 'B2B';

  if (isInterState && totalAmountPaise > B2CL_THRESHOLD_PAISE) return 'B2CL';

  return 'B2CS';
}

export function isInterStateSupply(placeOfSupply: number, companyStateCode: number): boolean {
  return placeOfSupply !== companyStateCode;
}
