import { useState, useMemo } from 'react';
import { computeInvoiceFields, saveGSTInvoice, updateGSTInvoice, type InvoiceFormData } from '../services/gst-invoice.service';
import { validateGSTIN } from '../services/gstin-validator.service';
import type { GSTInvoice } from '../types/gst-invoice.types';

const GST_RATES = [0, 0.1, 0.25, 3, 5, 12, 18, 28] as const;

// Indian states for POS picker
const STATES: { code: number; name: string }[] = [
  { code: 1,  name: '01 - Jammu & Kashmir' },
  { code: 2,  name: '02 - Himachal Pradesh' },
  { code: 3,  name: '03 - Punjab' },
  { code: 4,  name: '04 - Chandigarh' },
  { code: 5,  name: '05 - Uttarakhand' },
  { code: 6,  name: '06 - Haryana' },
  { code: 7,  name: '07 - Delhi' },
  { code: 8,  name: '08 - Rajasthan' },
  { code: 9,  name: '09 - Uttar Pradesh' },
  { code: 10, name: '10 - Bihar' },
  { code: 11, name: '11 - Sikkim' },
  { code: 12, name: '12 - Arunachal Pradesh' },
  { code: 13, name: '13 - Nagaland' },
  { code: 14, name: '14 - Manipur' },
  { code: 15, name: '15 - Mizoram' },
  { code: 16, name: '16 - Tripura' },
  { code: 17, name: '17 - Meghalaya' },
  { code: 18, name: '18 - Assam' },
  { code: 19, name: '19 - West Bengal' },
  { code: 20, name: '20 - Jharkhand' },
  { code: 21, name: '21 - Odisha' },
  { code: 22, name: '22 - Chhattisgarh' },
  { code: 23, name: '23 - Madhya Pradesh' },
  { code: 24, name: '24 - Gujarat' },
  { code: 26, name: '26 - Dadra & Nagar Haveli and Daman & Diu' },
  { code: 27, name: '27 - Maharashtra' },
  { code: 28, name: '28 - Andhra Pradesh (old)' },
  { code: 29, name: '29 - Karnataka' },
  { code: 30, name: '30 - Goa' },
  { code: 31, name: '31 - Lakshadweep' },
  { code: 32, name: '32 - Kerala' },
  { code: 33, name: '33 - Tamil Nadu' },
  { code: 34, name: '34 - Puducherry' },
  { code: 35, name: '35 - Andaman & Nicobar Islands' },
  { code: 36, name: '36 - Telangana' },
  { code: 37, name: '37 - Andhra Pradesh' },
  { code: 38, name: '38 - Ladakh' },
  { code: 96, name: '96 - Foreign Country (Export)' },
  { code: 97, name: '97 - Other Territory' },
];

interface Props {
  companyStateCode: number;
  returnPeriod: string;
  onSaved: (id: number) => void;
  onCancel: () => void;
  /** Pass to edit an existing invoice */
  initialData?: GSTInvoice;
}

function defaultForm(returnPeriod: string, companyStateCode: number, initial?: GSTInvoice): InvoiceFormData & { taxableValueRupees: number } {
  if (initial) {
    return {
      returnPeriod: initial.returnPeriod,
      invoiceNumber: initial.invoiceNumber,
      invoiceDate: initial.invoiceDate,
      buyerGstin: initial.buyerGstin ?? '',
      buyerName: initial.buyerName ?? '',
      taxableValueRupees: initial.taxableValuePaise / 100,
      gstRate: initial.gstRate,
      placeOfSupply: initial.placeOfSupply,
      reverseCharge: initial.reverseCharge,
      hsnCode: initial.hsnCode ?? '',
    };
  }
  const today = new Date().toISOString().slice(0, 10);
  return {
    returnPeriod,
    invoiceNumber: '',
    invoiceDate: today,
    buyerGstin: '',
    buyerName: '',
    taxableValueRupees: 0,
    gstRate: 18,
    placeOfSupply: companyStateCode || 29,  // default to Karnataka when not configured
    reverseCharge: false,
    hsnCode: '',
  };
}

export function InvoiceEntryForm({ companyStateCode, returnPeriod, onSaved, onCancel, initialData }: Props) {
  const [form, setForm] = useState(() => defaultForm(returnPeriod, companyStateCode, initialData));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  // Live computation — runs on every keystroke, no DB access
  const computed = useMemo(() => {
    if (!form.taxableValueRupees || form.taxableValueRupees <= 0) return null;
    try {
      return computeInvoiceFields(form, companyStateCode);
    } catch {
      return null;
    }
  }, [form, companyStateCode]);

  const gstinValidation = form.buyerGstin?.trim()
    ? validateGSTIN(form.buyerGstin.trim().toUpperCase())
    : null;

  const errors = computed?.validationResults.filter(r => r.severity === 'ERROR') ?? [];
  const warnings = computed?.validationResults.filter(r => r.severity === 'WARNING') ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!computed) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (initialData?.id) {
        await updateGSTInvoice(initialData.id, form, companyStateCode);
        onSaved(initialData.id);
      } else {
        const id = await saveGSTInvoice(form, companyStateCode);
        onSaved(id);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const inv = computed?.invoice;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="font-semibold text-sm text-gray-700">
        {initialData ? 'Edit Invoice' : 'Add GST Invoice'}
      </h3>

      {/* Row 1: Invoice # and Date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Invoice Number *</label>
          <input
            type="text"
            value={form.invoiceNumber}
            onChange={e => set('invoiceNumber', e.target.value)}
            maxLength={16}
            placeholder="INV-001"
            required
            className="w-full border rounded px-3 py-2 text-sm font-mono"
          />
          <p className="text-xs text-gray-400 mt-0.5">{form.invoiceNumber.length}/16</p>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Invoice Date *</label>
          <input
            type="date"
            value={form.invoiceDate}
            onChange={e => set('invoiceDate', e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            required
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Buyer GSTIN */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Buyer GSTIN</label>
        <input
          type="text"
          value={form.buyerGstin ?? ''}
          onChange={e => set('buyerGstin', e.target.value.toUpperCase())}
          maxLength={15}
          placeholder="Leave blank for B2C"
          className={`w-full border rounded px-3 py-2 text-sm font-mono tracking-wider
            ${gstinValidation && !gstinValidation.formatValid ? 'border-red-400' :
              gstinValidation?.formatValid ? 'border-green-400' : 'border-gray-300'}`}
        />
        {gstinValidation && (
          <p className={`text-xs mt-0.5 ${gstinValidation.formatValid && gstinValidation.stateCodeValid ? 'text-green-600' : 'text-red-600'}`}>
            {!gstinValidation.formatValid ? 'Invalid format (need 15 chars)' :
             !gstinValidation.stateCodeValid ? 'Invalid state code' :
             !gstinValidation.checksumValid ? '⚠ Checksum mismatch — verify GSTIN' :
             'Valid GSTIN'}
          </p>
        )}
      </div>

      {/* Buyer Name */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Buyer Name</label>
        <input
          type="text"
          value={form.buyerName ?? ''}
          onChange={e => set('buyerName', e.target.value)}
          placeholder="Optional"
          className="w-full border rounded px-3 py-2 text-sm"
        />
      </div>

      {/* Row 2: Taxable Value, GST Rate */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Taxable Value (₹) *</label>
          <input
            type="number"
            value={form.taxableValueRupees || ''}
            onChange={e => set('taxableValueRupees', parseFloat(e.target.value) || 0)}
            min={0}
            step={0.01}
            placeholder="0.00"
            required
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">GST Rate *</label>
          <select
            value={form.gstRate}
            onChange={e => set('gstRate', parseFloat(e.target.value))}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            {GST_RATES.map(r => (
              <option key={r} value={r}>{r}%</option>
            ))}
          </select>
        </div>
      </div>

      {/* Place of Supply */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Place of Supply *</label>
        <select
          value={form.placeOfSupply}
          onChange={e => set('placeOfSupply', parseInt(e.target.value, 10))}
          className="w-full border rounded px-3 py-2 text-sm"
        >
          {STATES.map(s => (
            <option key={s.code} value={s.code}>{s.name}</option>
          ))}
        </select>
        {inv && (
          <p className="text-xs mt-0.5 text-gray-500">
            → {inv.isInterState ? 'Inter-state (IGST)' : 'Intra-state (CGST+SGST)'}
          </p>
        )}
      </div>

      {/* HSN Code */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">HSN / SAC Code</label>
        <input
          type="text"
          value={form.hsnCode ?? ''}
          onChange={e => set('hsnCode', e.target.value)}
          maxLength={8}
          placeholder="e.g. 998311"
          className="w-full border rounded px-3 py-2 text-sm font-mono"
        />
      </div>

      {/* Checkboxes */}
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.reverseCharge ?? false}
            onChange={e => set('reverseCharge', e.target.checked)}
            className="rounded"
          />
          Reverse Charge
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.isExport ?? false}
            onChange={e => set('isExport', e.target.checked)}
            className="rounded"
          />
          Export
        </label>
        {form.isExport && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.exportWithPayment ?? false}
              onChange={e => set('exportWithPayment', e.target.checked)}
              className="rounded"
            />
            With Payment of Tax
          </label>
        )}
      </div>

      {/* Live computation preview */}
      {inv && (
        <div className="border rounded-lg p-3 bg-gray-50 text-sm space-y-1">
          <div className="flex justify-between font-medium text-xs text-gray-500 mb-1 uppercase tracking-wide">
            <span>Computed</span>
            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold
              ${inv.validationStatus === 'VALID' ? 'bg-green-100 text-green-700' :
                inv.validationStatus === 'WARNING' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'}`}>
              {inv.invoiceType} · {inv.validationStatus}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {inv.igstPaise > 0 && <div>IGST: ₹{(inv.igstPaise / 100).toFixed(2)}</div>}
            {inv.cgstPaise > 0 && <div>CGST: ₹{(inv.cgstPaise / 100).toFixed(2)}</div>}
            {inv.sgstPaise > 0 && <div>SGST: ₹{(inv.sgstPaise / 100).toFixed(2)}</div>}
            <div className="font-medium">Total: ₹{(inv.totalPaise / 100).toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Validation issues preview */}
      {(errors.length > 0 || warnings.length > 0) && (
        <div className="space-y-1">
          {errors.map(e => (
            <div key={e.ruleCode} className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              <span className="font-mono font-semibold">{e.ruleCode}</span> — {e.message}
            </div>
          ))}
          {warnings.map(w => (
            <div key={w.ruleCode} className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1.5">
              <span className="font-mono font-semibold">{w.ruleCode}</span> — {w.message}
            </div>
          ))}
        </div>
      )}

      {saveError && (
        <p className="text-xs text-red-600">{saveError}</p>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={saving || !form.invoiceNumber || !form.taxableValueRupees}
          className="flex-1 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : initialData ? 'Update Invoice' : 'Add Invoice'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
