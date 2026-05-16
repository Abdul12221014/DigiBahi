import { useState, useEffect } from 'react';
import { getGSTProfile, saveGSTProfile, type GSTProfile } from '../services/gst-profile.service';

export interface UseCompanyGSTProfileResult {
  profile: GSTProfile | null;
  loading: boolean;
  error: string | null;
  save: (gstin: string, companyStateCode: number) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useCompanyGSTProfile(): UseCompanyGSTProfileResult {
  const [profile, setProfile] = useState<GSTProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setProfile(await getGSTProfile());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const save = async (gstin: string, companyStateCode: number) => {
    await saveGSTProfile(gstin, companyStateCode);
    await load();
  };

  useEffect(() => { load(); }, []);

  return { profile, loading, error, save, refresh: load };
}
