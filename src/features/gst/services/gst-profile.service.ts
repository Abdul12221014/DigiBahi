import { db, type CompanySettings } from '@/lib/db';
import { isValidGSTINFormat } from './gstin-validator.service';

export interface GSTProfile {
  gstin: string;
  companyStateCode: number;
  businessName: string;
  isConfigured: boolean;
}

const FALLBACK: GSTProfile = {
  gstin: '',
  companyStateCode: 0,
  businessName: '',
  isConfigured: false,
};

/** Derive the 2-digit state code from positions 0-1 of a valid GSTIN. */
export function stateCodeFromGSTIN(gstin: string): number {
  const g = gstin.trim().toUpperCase();
  if (!isValidGSTINFormat(g)) return 0;
  const code = parseInt(g.substring(0, 2), 10);
  return isNaN(code) ? 0 : code;
}

/** Read the stored profile and normalise it into GSTProfile. Pure transform — testable. */
export function normaliseProfile(settings: CompanySettings | null): GSTProfile {
  if (!settings) return FALLBACK;
  const gstin = settings.gstin?.trim().toUpperCase() ?? '';
  const isValid = isValidGSTINFormat(gstin);
  const stateFromGstin = isValid ? stateCodeFromGSTIN(gstin) : 0;
  const companyStateCode = settings.companyStateCode ?? stateFromGstin;
  return {
    gstin,
    companyStateCode,
    businessName: settings.businessName ?? '',
    isConfigured: isValid && companyStateCode > 0,
  };
}

/** Fetch the current GST profile from Dexie. */
export async function getGSTProfile(): Promise<GSTProfile> {
  const settings = (await db.companySettings.toCollection().first()) ?? null;
  return normaliseProfile(settings);
}

/** Persist GSTIN + stateCode into companySettings (upsert). */
export async function saveGSTProfile(
  gstin: string,
  companyStateCode: number,
): Promise<void> {
  const g = gstin.trim().toUpperCase();
  const existing = await db.companySettings.toCollection().first();
  const now = new Date().toISOString();
  if (existing) {
    await db.companySettings.update(existing.id!, { gstin: g, companyStateCode, updated_at: now });
  } else {
    await db.companySettings.add({ businessName: '', gstin: g, companyStateCode, updated_at: now });
  }
}
