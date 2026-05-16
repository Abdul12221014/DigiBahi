const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const VALID_STATE_CODES = new Set([
  1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,
  21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,97,99
]);

export interface GSTINValidationResult {
  isValid: boolean;
  formatValid: boolean;
  stateCodeValid: boolean;
  checksumValid: boolean;
  panEmbedded: string | null;
  stateCode: number | null;
  errors: string[];
  warnings: string[];
}

function computeChecksum(gstin: string): string {
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const val = CHARSET.indexOf(gstin[i]);
    if (val === -1) return '';
    const product = val * (i % 2 === 0 ? 1 : 2);
    total += product > 35 ? Math.floor(product / 36) + (product % 36) : product;
  }
  return CHARSET[(36 - (total % 36)) % 36];
}

export function validateGSTIN(raw: string): GSTINValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || raw.trim() === '') {
    return {
      isValid: false, formatValid: false, stateCodeValid: false,
      checksumValid: false, panEmbedded: null, stateCode: null,
      errors: ['GSTIN is required'], warnings: [],
    };
  }

  const gstin = raw.trim(); // deliberate: no toUpperCase — lowercase fails format check

  if (gstin.length !== 15) {
    errors.push(`GSTIN must be exactly 15 characters (got ${gstin.length})`);
    return { isValid: false, formatValid: false, stateCodeValid: false, checksumValid: false, panEmbedded: null, stateCode: null, errors, warnings };
  }

  // Format: 2-digit state + 5 alpha + 4 digit + 1 alpha + 1 alphanumeric + Z + 1 alphanumeric
  const formatRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  const formatValid = formatRegex.test(gstin);
  if (!formatValid) {
    errors.push('GSTIN format is invalid — expected: 2-digit state code + PAN (5 letters + 4 digits + 1 letter) + entity + Z + check digit');
  }

  const stateCode = parseInt(gstin.substring(0, 2), 10);
  const stateCodeValid = VALID_STATE_CODES.has(stateCode);
  if (!stateCodeValid) {
    errors.push(`State code "${gstin.substring(0, 2)}" is not a valid GST state/UT code`);
  }

  const panEmbedded = formatValid ? gstin.substring(2, 12) : null;

  const expectedCheck = computeChecksum(gstin);
  const checksumValid = formatValid && expectedCheck !== '' && expectedCheck === gstin[14];
  if (formatValid && !checksumValid) {
    warnings.push('GSTIN checksum does not match — possible transcription error. Verify against the buyer\'s GST certificate.');
  }

  return {
    isValid: formatValid && stateCodeValid && checksumValid,
    formatValid,
    stateCodeValid,
    checksumValid,
    panEmbedded,
    stateCode: stateCodeValid ? stateCode : null,
    errors,
    warnings,
  };
}

export function getStateFromGSTIN(gstin: string): number | null {
  if (!gstin || gstin.length < 2) return null;
  const code = parseInt(gstin.substring(0, 2), 10);
  return VALID_STATE_CODES.has(code) ? code : null;
}

export function isValidGSTINFormat(gstin: string): boolean {
  return validateGSTIN(gstin).formatValid;
}
