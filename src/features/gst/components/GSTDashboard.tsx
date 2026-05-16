import { useState } from 'react';
import { useGSTInvoices } from '../hooks/useGSTInvoices';
import { TaxSummaryPanel } from './TaxSummaryPanel';
import { ErrorInbox } from './ErrorInbox';
import { downloadGSTR1, downloadGSTR3B } from '../services/gst-export.service';

interface Props {
  gstin: string;
  companyStateCode: number;
}

const STATUS_COLOR: Record<string, string> = {
  VALID:   'text-green-600',
  WARNING: 'text-yellow-600',
  ERROR:   'text-red-600',
  PENDING: 'text-gray-400',
};

export function GSTDashboard({ gstin, companyStateCode }: Props) {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const { invoices, validations, summary, loading, error, refresh } = useGSTInvoices(period);

  const errorCount   = invoices.filter(i => i.validationStatus === 'ERROR').length;
  const warningCount = invoices.filter(i => i.validationStatus === 'WARNING').length;
  const validCount   = invoices.filter(i => i.validationStatus === 'VALID').length;

  const meta = { gstin, companyStateCode, returnPeriod: period, fp: '' };

  function handleDownloadGSTR1() {
    downloadGSTR1(invoices, meta);
  }

  function handleDownloadGSTR3B() {
    downloadGSTR3B(invoices, meta);
  }

  return (
    <div className="space-y-5 p-4">
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">GST Compliance</h2>
          <p className="text-xs text-gray-500">{gstin}</p>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          />
          <button
            onClick={refresh}
            className="text-xs border rounded px-3 py-1.5 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Valid', count: validCount, cls: 'text-green-700 bg-green-50 border-green-200' },
          { label: 'Warnings', count: warningCount, cls: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
          { label: 'Errors', count: errorCount, cls: 'text-red-700 bg-red-50 border-red-200' },
        ].map(s => (
          <div key={s.label} className={`border rounded-lg p-3 text-center ${s.cls}`}>
            <div className="text-2xl font-bold">{s.count}</div>
            <div className="text-xs mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Invoice list */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : invoices.length > 0 ? (
        <div className="border rounded-lg overflow-hidden shadow-sm">
          <div className="px-4 py-2 bg-gray-50 border-b text-xs font-medium text-gray-600 flex justify-between">
            <span>Invoices ({invoices.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-2 text-left">Invoice #</th>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-right">Taxable</th>
                  <th className="p-2 text-right">GST</th>
                  <th className="p-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => {
                  const gst = inv.igstPaise + inv.cgstPaise + inv.sgstPaise;
                  return (
                    <tr key={inv.id} className="border-t hover:bg-gray-50">
                      <td className="p-2 font-mono text-xs">{inv.invoiceNumber}</td>
                      <td className="p-2">{inv.invoiceDate}</td>
                      <td className="p-2 text-xs">{inv.invoiceType}</td>
                      <td className="p-2 text-right">₹{(inv.taxableValuePaise / 100).toFixed(2)}</td>
                      <td className="p-2 text-right">₹{(gst / 100).toFixed(2)}</td>
                      <td className={`p-2 text-xs font-medium ${STATUS_COLOR[inv.validationStatus]}`}>
                        {inv.validationStatus}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-8">
          No GST invoices for {period}. Add invoices to get started.
        </p>
      )}

      {/* Validation issues */}
      <ErrorInbox invoices={invoices} validations={validations} />

      {/* Tax summary */}
      {summary && <TaxSummaryPanel summary={summary} returnPeriod={period} />}

      {/* Export */}
      {invoices.length > 0 && (
        <div className="border rounded-lg p-4 bg-white shadow-sm">
          <h3 className="font-semibold text-sm text-gray-700 mb-3">Export for GSTN Portal</h3>
          {errorCount > 0 && (
            <p className="text-xs text-red-600 mb-2">
              {errorCount} invoice(s) with errors will be excluded from export.
            </p>
          )}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleDownloadGSTR1}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Download GSTR-1 JSON
            </button>
            <button
              onClick={handleDownloadGSTR3B}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
            >
              Download GSTR-3B JSON
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Upload these files directly at the GSTN portal under Returns → File Returns.
          </p>
        </div>
      )}
    </div>
  );
}
