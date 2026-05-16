export type InvoiceType =
  | 'B2B'
  | 'B2CS'
  | 'B2CL'
  | 'B2B_RCM'
  | 'EXP_WITH_PAY'
  | 'EXP_WITHOUT_PAY'
  | 'CDNR'
  | 'CDNUR'
  | 'SEZ_WITH_PAY'
  | 'SEZ_WITHOUT_PAY'
  | 'EXEMPTED';

export type ValidationStatus = 'PENDING' | 'VALID' | 'WARNING' | 'ERROR';
export type FilingStatus = 'PENDING' | 'STAGED' | 'FILED';
export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface GSTInvoice {
  id?: number;
  ledgerId: number;
  returnPeriod: string;           // 'YYYY-MM'

  invoiceType: InvoiceType;

  buyerGstin?: string;
  buyerName?: string;
  buyerStateCode?: number;

  invoiceNumber: string;
  invoiceDate: string;            // 'YYYY-MM-DD'

  placeOfSupply: number;          // 2-digit state code
  isInterState: boolean;
  reverseCharge: boolean;

  // All monetary amounts in paise (integer) — avoids float errors
  taxableValuePaise: number;
  igstPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  cessPaise: number;
  totalPaise: number;

  hsnCode?: string;
  hsnType?: 'HSN' | 'SAC';
  gstRate: number;                // 0 | 0.1 | 0.25 | 3 | 5 | 12 | 18 | 28

  validationStatus: ValidationStatus;
  filingStatus: FilingStatus;

  createdAt: string;
  updatedAt: string;
}

export interface GSTValidation {
  id?: number;
  gstInvoiceId: number;
  ruleCode: string;
  severity: ValidationSeverity;
  message: string;
  fieldName?: string;
  currentValue?: string;
  expectedValue?: string;
  resolutionHint: string;
  fixedAt?: string;
  ignoredAt?: string;
  ignoredReason?: string;
  createdAt: string;
}

export interface ReturnPeriodSummary {
  period: string;
  invoiceCount: number;
  errorCount: number;
  warningCount: number;
  totalTaxableRupees: number;
  igstRupees: number;
  cgstRupees: number;
  sgstRupees: number;
  netLiabilityRupees: number;
  filingStatus: 'NOT_READY' | 'READY' | 'FILED';
}
