import { describe, it, expect } from 'vitest';
import { toE164, parseE164, COUNTRIES } from '../countryCode';

describe('toE164', () => {
  it('formats a 10-digit Indian number', () => {
    expect(toE164('9876543210', '91')).toBe('+919876543210');
  });

  it('strips leading zeros', () => {
    expect(toE164('09876543210', '91')).toBe('+919876543210');
  });

  it('handles UAE 9-digit number', () => {
    expect(toE164('501234567', '971')).toBe('+971501234567');
  });

  it('strips non-digit characters', () => {
    expect(toE164('98765-43210', '91')).toBe('+919876543210');
  });

  it('returns empty string for empty input', () => {
    expect(toE164('', '91')).toBe('');
  });
});

describe('parseE164', () => {
  it('parses an Indian E.164 number', () => {
    expect(parseE164('+919876543210', COUNTRIES)).toEqual({
      dialCode: '91',
      localPhone: '9876543210',
    });
  });

  it('parses a UAE E.164 number', () => {
    expect(parseE164('+971501234567', COUNTRIES)).toEqual({
      dialCode: '971',
      localPhone: '501234567',
    });
  });

  it('returns null without leading +', () => {
    expect(parseE164('919876543210', COUNTRIES)).toBeNull();
  });

  it('returns null for unrecognised dial code', () => {
    expect(parseE164('+9991234567', COUNTRIES)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseE164('', COUNTRIES)).toBeNull();
  });
});
