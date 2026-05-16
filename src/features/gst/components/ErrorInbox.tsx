import { useState } from 'react';
import type { GSTInvoice, GSTValidation } from '../types/gst-invoice.types';
import { FIXABLE_RULES, applyAllFixes } from '../services/autofix.service';

interface Props {
  invoices: GSTInvoice[];
  validations: GSTValidation[];
  companyStateCode?: number;
  onFixed?: () => void;
}

const SEVERITY_STYLE = {
  ERROR:   'bg-red-50 border-red-200 text-red-700',
  WARNING: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  INFO:    'bg-blue-50 border-blue-200 text-blue-700',
} as const;

const SEVERITY_BADGE = {
  ERROR:   'bg-red-100 text-red-700',
  WARNING: 'bg-yellow-100 text-yellow-700',
  INFO:    'bg-blue-100 text-blue-700',
} as const;

export function ErrorInbox({ invoices, validations, companyStateCode, onFixed }: Props) {
  const [fixing, setFixing] = useState<number | null>(null);
  const [fixMsg, setFixMsg] = useState<Record<number, string>>({});

  const errors   = validations.filter(v => v.severity === 'ERROR'   && !v.fixedAt && !v.ignoredAt);
  const warnings = validations.filter(v => v.severity === 'WARNING' && !v.fixedAt && !v.ignoredAt);
  const invMap   = new Map(invoices.map(i => [i.id, i]));

  if (errors.length === 0 && warnings.length === 0) {
    return (
      <div className="border rounded-lg p-4 bg-green-50 border-green-200 text-green-700 text-sm">
        All invoices are valid — no issues found.
      </div>
    );
  }

  const items = [...errors, ...warnings];

  async function handleFix(invoiceId: number) {
    if (!companyStateCode) return;
    setFixing(invoiceId);
    try {
      const results = await applyAllFixes(invoiceId, companyStateCode);
      const applied = results.filter(r => r.applied).length;
      setFixMsg(prev => ({ ...prev, [invoiceId]: `${applied} fix(es) applied` }));
      onFixed?.();
    } catch (err) {
      setFixMsg(prev => ({ ...prev, [invoiceId]: err instanceof Error ? err.message : 'Fix failed' }));
    } finally {
      setFixing(null);
    }
  }

  // Group items by invoice so we show one Fix button per invoice
  const invoiceIds = [...new Set(items.map(v => v.gstInvoiceId).filter(Boolean))];
  const invoicesWithFix = invoiceIds.filter(id => {
    const inv = id ? invMap.get(id) : undefined;
    if (!inv || inv.filingStatus !== 'PENDING') return false;
    const invVals = items.filter(v => v.gstInvoiceId === id);
    return invVals.some(v => FIXABLE_RULES.has(v.ruleCode));
  });

  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
        <h3 className="font-semibold text-sm text-gray-700">Validation Issues</h3>
        <div className="flex gap-2 text-xs">
          {errors.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              {errors.length} error{errors.length > 1 ? 's' : ''}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
              {warnings.length} warning{warnings.length > 1 ? 's' : ''}
            </span>
          )}
          {companyStateCode && invoicesWithFix.length > 0 && (
            <button
              onClick={async () => {
                for (const id of invoicesWithFix) {
                  await handleFix(id!);
                }
              }}
              disabled={fixing !== null}
              className="px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Auto-fix all
            </button>
          )}
        </div>
      </div>

      <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
        {items.map(v => {
          const inv = v.gstInvoiceId ? invMap.get(v.gstInvoiceId) : undefined;
          const style  = SEVERITY_STYLE[v.severity as keyof typeof SEVERITY_STYLE] ?? SEVERITY_STYLE.INFO;
          const badge  = SEVERITY_BADGE[v.severity as keyof typeof SEVERITY_BADGE] ?? SEVERITY_BADGE.INFO;
          const isFixable = FIXABLE_RULES.has(v.ruleCode) && inv?.filingStatus === 'PENDING';
          return (
            <li key={v.id} className={`px-4 py-3 border-l-4 ${style}`}>
              <div className="flex items-start gap-2">
                <span className={`text-xs font-mono px-1.5 py-0.5 rounded mt-0.5 shrink-0 ${badge}`}>
                  {v.ruleCode}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{v.message}</p>
                  {inv && (
                    <p className="text-xs mt-0.5 opacity-70">
                      Invoice {inv.invoiceNumber} · {inv.invoiceDate}
                    </p>
                  )}
                  <p className="text-xs mt-1 opacity-80">{v.resolutionHint}</p>
                </div>
                {isFixable && companyStateCode && v.gstInvoiceId && (
                  <button
                    onClick={() => handleFix(v.gstInvoiceId!)}
                    disabled={fixing === v.gstInvoiceId}
                    className="shrink-0 text-xs border border-current rounded px-2 py-0.5 hover:opacity-80 disabled:opacity-50"
                  >
                    {fixing === v.gstInvoiceId ? '…' : 'Fix'}
                  </button>
                )}
              </div>
              {v.gstInvoiceId && fixMsg[v.gstInvoiceId] && (
                <p className="text-xs mt-1 text-green-700">{fixMsg[v.gstInvoiceId]}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
