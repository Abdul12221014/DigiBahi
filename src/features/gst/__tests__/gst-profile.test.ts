import { normaliseProfile, stateCodeFromGSTIN } from '../services/gst-profile.service';
import type { CompanySettings } from '@/lib/db';

function settings(overrides: Partial<CompanySettings> = {}): CompanySettings {
  return { id: 1, businessName: 'Test Co', updated_at: '2024-01-01T00:00:00Z', ...overrides };
}

describe('stateCodeFromGSTIN', () => {
  test('extracts state code 29 from Karnataka GSTIN', () => {
    expect(stateCodeFromGSTIN('29AABCE2134J1ZR')).toBe(29);
  });

  test('extracts state code 27 from Maharashtra GSTIN', () => {
    expect(stateCodeFromGSTIN('27AAACR5055K1ZV')).toBe(27);
  });

  test('returns 0 for invalid GSTIN', () => {
    expect(stateCodeFromGSTIN('INVALID')).toBe(0);
  });

  test('returns 0 for empty string', () => {
    expect(stateCodeFromGSTIN('')).toBe(0);
  });

  test('normalises lowercase input before format check', () => {
    // profile service uppercases before validating — tolerant of user input
    expect(stateCodeFromGSTIN('29aabce2134j1zr')).toBe(29);
  });
});

describe('normaliseProfile', () => {
  test('null settings → isConfigured false', () => {
    const p = normaliseProfile(null);
    expect(p.isConfigured).toBe(false);
    expect(p.gstin).toBe('');
    expect(p.companyStateCode).toBe(0);
  });

  test('valid GSTIN with no explicit stateCode → derives from GSTIN', () => {
    const p = normaliseProfile(settings({ gstin: '29AABCE2134J1ZR' }));
    expect(p.isConfigured).toBe(true);
    expect(p.gstin).toBe('29AABCE2134J1ZR');
    expect(p.companyStateCode).toBe(29);
  });

  test('explicit companyStateCode overrides GSTIN-derived value', () => {
    const p = normaliseProfile(settings({ gstin: '29AABCE2134J1ZR', companyStateCode: 27 }));
    expect(p.companyStateCode).toBe(27);
  });

  test('invalid GSTIN → isConfigured false', () => {
    const p = normaliseProfile(settings({ gstin: 'INVALID' }));
    expect(p.isConfigured).toBe(false);
  });

  test('missing GSTIN → isConfigured false', () => {
    const p = normaliseProfile(settings({ gstin: undefined }));
    expect(p.isConfigured).toBe(false);
  });

  test('uppercase normalisation applied to stored GSTIN', () => {
    // Profile service uppercases before validating — so lowercase is accepted
    const p = normaliseProfile(settings({ gstin: '29aabce2134j1zr' }));
    expect(p.isConfigured).toBe(true);
    expect(p.gstin).toBe('29AABCE2134J1ZR');
  });

  test('businessName preserved', () => {
    const p = normaliseProfile(settings({ gstin: '29AABCE2134J1ZR', businessName: 'Acme Ltd' }));
    expect(p.businessName).toBe('Acme Ltd');
  });
});
