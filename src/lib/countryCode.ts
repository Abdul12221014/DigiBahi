/**
 * Country Code Service
 * ─────────────────────
 * Replaces all hardcoded "+91" instances.
 * User-selectable, persisted to localStorage.
 * Default: India (most DigiBahi users are Indian businesses).
 */

export interface Country {
  name:     string;
  code:     string;     // ISO 3166-1 alpha-2
  dialCode: string;     // E.164 prefix without "+"
  flag:     string;
  maxPhoneLength: number;
}

export const COUNTRIES: Country[] = [
  { name: 'India',          code: 'IN', dialCode: '91',  flag: '🇮🇳', maxPhoneLength: 10 },
  { name: 'United States',  code: 'US', dialCode: '1',   flag: '🇺🇸', maxPhoneLength: 10 },
  { name: 'United Kingdom', code: 'GB', dialCode: '44',  flag: '🇬🇧', maxPhoneLength: 10 },
  { name: 'UAE',            code: 'AE', dialCode: '971', flag: '🇦🇪', maxPhoneLength: 9  },
  { name: 'Saudi Arabia',   code: 'SA', dialCode: '966', flag: '🇸🇦', maxPhoneLength: 9  },
  { name: 'Bangladesh',     code: 'BD', dialCode: '880', flag: '🇧🇩', maxPhoneLength: 10 },
  { name: 'Nepal',          code: 'NP', dialCode: '977', flag: '🇳🇵', maxPhoneLength: 10 },
  { name: 'Pakistan',       code: 'PK', dialCode: '92',  flag: '🇵🇰', maxPhoneLength: 10 },
];

const STORAGE_KEY = 'digbahi_country_code';

export function getDefaultCountry(): Country {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const found = COUNTRIES.find(c => c.code === stored);
    if (found) return found;
  }
  return COUNTRIES[0]; // India default
}

export function setDefaultCountry(code: string): void {
  localStorage.setItem(STORAGE_KEY, code);
}

export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find(c => c.code === code);
}

/**
 * Build a wa.me URL with proper country code.
 * Strips leading zeros from local phone numbers.
 */
export function buildWaUrl(
  phone: string,
  dialCode: string,
  message: string,
): string {
  const cleanPhone = phone.replace(/^0+/, '').replace(/\D/g, '');
  return `https://wa.me/${dialCode}${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Validate phone length for given country.
 */
export function isValidPhone(phone: string, country: Country): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length === country.maxPhoneLength;
}

/**
 * Format phone for display: "+91 98765 43210"
 */
export function formatPhoneDisplay(phone: string, dialCode: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 10) {
    return `+${dialCode} ${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  return `+${dialCode} ${clean}`;
}

export function toE164(localPhone: string, dialCode: string): string {
  if (!localPhone) return '';
  const clean = localPhone.replace(/\D/g, '').replace(/^0+/, '');
  return `+${dialCode}${clean}`;
}

export function parseE164(
  e164: string,
  countries: Country[],
): { dialCode: string; localPhone: string } | null {
  if (!e164.startsWith('+')) return null;
  const digits = e164.slice(1);
  const sorted = [...countries].sort((a, b) => b.dialCode.length - a.dialCode.length);
  for (const country of sorted) {
    if (digits.startsWith(country.dialCode)) {
      return { dialCode: country.dialCode, localPhone: digits.slice(country.dialCode.length) };
    }
  }
  return null;
}
