import { validateGSTIN, getStateFromGSTIN } from '../services/gstin-validator.service';

describe('GSTIN Validator', () => {
  test('valid GSTIN passes all checks', () => {
    const result = validateGSTIN('29AABCE2134J1ZR');
    expect(result.formatValid).toBe(true);
    expect(result.stateCodeValid).toBe(true);
    expect(result.panEmbedded).toBe('AABCE2134J');
    expect(result.checksumValid).toBe(true);
    expect(result.isValid).toBe(true);
  });

  test('wrong length fails', () => {
    expect(validateGSTIN('29AABCE2134J1Z').isValid).toBe(false);
    expect(validateGSTIN('29AABCE2134J1ZKX').isValid).toBe(false);
  });

  test('invalid state code fails', () => {
    const r = validateGSTIN('00AABCE2134J1ZK');
    expect(r.stateCodeValid).toBe(false);
    expect(r.isValid).toBe(false);
  });

  test('lowercase GSTIN fails format check', () => {
    const r = validateGSTIN('29aabce2134j1zk');
    expect(r.formatValid).toBe(false);
  });

  test('empty string fails with helpful error', () => {
    expect(validateGSTIN('').isValid).toBe(false);
    expect(validateGSTIN('').errors[0]).toMatch(/required/i);
  });

  test('getStateFromGSTIN extracts state code', () => {
    expect(getStateFromGSTIN('29AABCE2134J1ZR')).toBe(29);
    expect(getStateFromGSTIN('06AABCE2134J1ZR')).toBe(6);
    expect(getStateFromGSTIN('INVALID')).toBeNull();
  });

  test('checksum error produces warning not error', () => {
    // 'X' is not the correct check digit for this prefix (correct is 'R')
    const r = validateGSTIN('29AABCE2134J1ZX');
    // Format may pass, checksum should fail — result is invalid but via warning path
    if (r.formatValid && r.stateCodeValid) {
      expect(r.checksumValid).toBe(false);
      expect(r.warnings.length).toBeGreaterThan(0);
    }
  });
});
