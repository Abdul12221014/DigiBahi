export interface TaxSplitInput {
  taxableValueRupees: number;
  gstRate: number;
  isInterState: boolean;
  cessRate?: number;
}

export interface TaxSplitResult {
  taxableValuePaise: number;
  igstPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  cessPaise: number;
  totalPaise: number;
}

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function toRupees(paise: number): number {
  return paise / 100;
}

export function splitTax(input: TaxSplitInput): TaxSplitResult {
  const { taxableValueRupees, gstRate, isInterState, cessRate = 0 } = input;

  const taxableValuePaise = toPaise(taxableValueRupees);
  const totalGstPaise = toPaise((taxableValueRupees * gstRate) / 100);
  const cessPaise = toPaise((taxableValueRupees * cessRate) / 100);

  let igstPaise = 0, cgstPaise = 0, sgstPaise = 0;

  if (isInterState) {
    igstPaise = totalGstPaise;
  } else {
    cgstPaise = Math.round(totalGstPaise / 2);
    sgstPaise = totalGstPaise - cgstPaise; // absorbs rounding remainder
  }

  return {
    taxableValuePaise,
    igstPaise,
    cgstPaise,
    sgstPaise,
    cessPaise,
    totalPaise: taxableValuePaise + igstPaise + cgstPaise + sgstPaise + cessPaise,
  };
}

export function extractTaxableFromTotal(totalRupees: number, gstRate: number): number {
  if (gstRate === 0) return totalRupees;
  return totalRupees / (1 + gstRate / 100);
}
