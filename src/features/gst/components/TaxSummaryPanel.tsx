import type { GSTR3BSections } from '../services/gstr3b-generator.service';

interface Props {
  summary: GSTR3BSections;
  returnPeriod: string;
}

function Row({ label, val }: { label: string; val: number }) {
  return (
    <div className="flex justify-between py-1 border-b border-gray-100 last:border-0 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium">₹{val.toFixed(2)}</span>
    </div>
  );
}

export function TaxSummaryPanel({ summary, returnPeriod }: Props) {
  const { osup_det, osup_zero, osup_nil_exmp, isup_rev } = summary.sup_details;
  const totalTax = osup_det.iamt + osup_det.camt + osup_det.samt + osup_det.csamt
    + osup_zero.iamt + isup_rev.iamt + isup_rev.camt + isup_rev.samt;

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <h3 className="font-semibold mb-3 text-sm text-gray-700">
        GSTR-3B Summary — {returnPeriod}
      </h3>

      <div className="mb-3">
        <p className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">3.1 Outward Supplies</p>
        <Row label="Taxable (normal rate)" val={osup_det.txval} />
        <Row label="  → IGST" val={osup_det.iamt} />
        <Row label="  → CGST" val={osup_det.camt} />
        <Row label="  → SGST" val={osup_det.samt} />
        {osup_det.csamt > 0 && <Row label="  → Cess" val={osup_det.csamt} />}
        <Row label="Zero-rated (exports/SEZ)" val={osup_zero.txval} />
        <Row label="Nil / Exempt" val={osup_nil_exmp.txval} />
      </div>

      {(isup_rev.txval > 0) && (
        <div className="mb-3">
          <p className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">3.1(d) Reverse Charge Inward</p>
          <Row label="Taxable value" val={isup_rev.txval} />
          <Row label="  → IGST" val={isup_rev.iamt} />
          <Row label="  → CGST" val={isup_rev.camt} />
          <Row label="  → SGST" val={isup_rev.samt} />
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-gray-200">
        <div className="flex justify-between text-sm font-semibold">
          <span>Total GST Liability</span>
          <span className="text-blue-700">₹{totalTax.toFixed(2)}</span>
        </div>
      </div>

      {summary.inter_sup.unreg_details.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">3.2 Inter-state to Unregistered</p>
          {summary.inter_sup.unreg_details.map(r => (
            <div key={r.pos} className="flex justify-between text-sm py-1">
              <span className="text-gray-600">State {r.pos}</span>
              <span>₹{r.txval.toFixed(2)} (IGST ₹{r.iamt.toFixed(2)})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
