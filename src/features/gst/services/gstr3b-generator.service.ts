import type { GSTInvoice } from '../types/gst-invoice.types';
import { toRupees } from './tax-splitter.service';

export interface GSTR3BSupplyDetail {
  txval: number;   // rupees, 2dp
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

export interface GSTR3BInterStateRow {
  pos: string;
  txval: number;
  iamt: number;
}

export interface GSTR3BSections {
  sup_details: {
    osup_det: GSTR3BSupplyDetail;      // 3.1(a) outward taxable (normal rate)
    osup_zero: GSTR3BSupplyDetail;     // 3.1(b) zero-rated (exports/SEZ)
    osup_nil_exmp: GSTR3BSupplyDetail; // 3.1(c) nil-rated / exempt
    isup_rev: GSTR3BSupplyDetail;      // 3.1(d) inward on which RCM payable
  };
  inter_sup: {
    unreg_details: GSTR3BInterStateRow[]; // 3.2 inter-state to unregistered
    comp_details: GSTR3BInterStateRow[];  // 3.2 inter-state to composition
    uin_details: GSTR3BInterStateRow[];   // 3.2 inter-state to UIN holders
  };
}

// ─── Internal paise accumulator ───────────────────────────────────────────────
// Accumulate in paise (integers) to avoid float drift across many invoices.
// Convert to rupees ONCE at output — not per-invoice.

interface PaiseDetail {
  txval: number; camt: number; samt: number; iamt: number; csamt: number;
}

interface PaiseInterState {
  pos: string; txval: number; iamt: number;
}

function zeroPaise(): PaiseDetail {
  return { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
}

function addPaise(acc: PaiseDetail, inv: GSTInvoice): void {
  acc.txval += inv.taxableValuePaise;
  acc.iamt  += inv.igstPaise;
  acc.camt  += inv.cgstPaise;
  acc.samt  += inv.sgstPaise;
  acc.csamt += inv.cessPaise;
}

function r2(n: number): number { return Math.round(n * 100) / 100; }

function toDetail(p: PaiseDetail): GSTR3BSupplyDetail {
  return {
    txval: r2(toRupees(p.txval)),
    iamt:  r2(toRupees(p.iamt)),
    camt:  r2(toRupees(p.camt)),
    samt:  r2(toRupees(p.samt)),
    csamt: r2(toRupees(p.csamt)),
  };
}

export function generateGSTR3BSections(invoices: GSTInvoice[]): GSTR3BSections {
  const valid = invoices.filter(
    i => !i.isDeleted && (i.validationStatus === 'VALID' || i.validationStatus === 'WARNING'),
  );

  const osup_det      = zeroPaise();
  const osup_zero     = zeroPaise();
  const osup_nil_exmp = zeroPaise();
  const isup_rev      = zeroPaise();

  // POS → paise accumulator for inter-state unregistered
  const unregMap = new Map<string, PaiseInterState>();

  for (const inv of valid) {
    const pos = String(inv.placeOfSupply).padStart(2, '0');

    switch (inv.invoiceType) {
      case 'B2B':
        addPaise(osup_det, inv);
        break;

      case 'B2B_RCM':
        addPaise(isup_rev, inv);
        break;

      case 'B2CS':
        addPaise(osup_det, inv);
        if (inv.isInterState) {
          const ex = unregMap.get(pos);
          if (ex) {
            ex.txval += inv.taxableValuePaise;
            ex.iamt  += inv.igstPaise;
          } else {
            unregMap.set(pos, { pos, txval: inv.taxableValuePaise, iamt: inv.igstPaise });
          }
        }
        break;

      case 'B2CL':
        addPaise(osup_det, inv);
        {
          const ex = unregMap.get(pos);
          if (ex) {
            ex.txval += inv.taxableValuePaise;
            ex.iamt  += inv.igstPaise;
          } else {
            unregMap.set(pos, { pos, txval: inv.taxableValuePaise, iamt: inv.igstPaise });
          }
        }
        break;

      case 'EXP_WITH_PAY':
      case 'EXP_WITHOUT_PAY':
      case 'SEZ_WITH_PAY':
      case 'SEZ_WITHOUT_PAY':
        addPaise(osup_zero, inv);
        break;

      case 'EXEMPTED':
        addPaise(osup_nil_exmp, inv);
        break;

      // CDNR / CDNUR — portal applies them independently as separate adjustments
    }
  }

  // Convert paise → rupees once per section at output
  return {
    sup_details: {
      osup_det:      toDetail(osup_det),
      osup_zero:     toDetail(osup_zero),
      osup_nil_exmp: toDetail(osup_nil_exmp),
      isup_rev:      toDetail(isup_rev),
    },
    inter_sup: {
      unreg_details: Array.from(unregMap.values()).map(p => ({
        pos:   p.pos,
        txval: r2(toRupees(p.txval)),
        iamt:  r2(toRupees(p.iamt)),
      })),
      comp_details: [],
      uin_details:  [],
    },
  };
}
