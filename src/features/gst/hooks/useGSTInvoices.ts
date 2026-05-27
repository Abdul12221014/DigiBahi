import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import type { GSTInvoice, GSTValidation } from '../types/gst-invoice.types';
import { generateGSTR3BSections, type GSTR3BSections } from '../services/gstr3b-generator.service';

export interface GSTInvoicesState {
  invoices: GSTInvoice[];
  validations: GSTValidation[];
  summary: GSTR3BSections | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useGSTInvoices(returnPeriod: string): GSTInvoicesState {
  const [invoices, setInvoices] = useState<GSTInvoice[]>([]);
  const [validations, setValidations] = useState<GSTValidation[]>([]);
  const [summary, setSummary] = useState<GSTR3BSections | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await db.gstInvoices.where('returnPeriod').equals(returnPeriod).toArray();
      // Exclude soft-deleted invoices from all active views
      const invs = all.filter(i => !i.isDeleted);
      const ids = invs.map(i => i.id!).filter(Boolean);
      const vals = ids.length
        ? await db.gstValidations.where('gstInvoiceId').anyOf(ids).toArray()
        : [];
      setInvoices(invs);
      setValidations(vals);
      setSummary(generateGSTR3BSections(invs));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load GST data');
    } finally {
      setLoading(false);
    }
  }, [returnPeriod]);

  useEffect(() => { load(); }, [load]);

  return { invoices, validations, summary, loading, error, refresh: load };
}
