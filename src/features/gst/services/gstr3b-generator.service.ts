import type { GSTInvoice } from '../types/gst-invoice.types';
import { toRupees } from './tax-splitter.service';

export interface GSTR3BSupplyDetail {
  txval: number;
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
    osup_det: GSTR3BSupplyDetail;     // 3.1(a) outward taxable (normal rate)
    osup_zero: GSTR3BSupplyDetail;    // 3.1(b) zero-rated (exports/SEZ)
    osup_nil_exmp: GSTR3BSupplyDetail; // 3.1(c) nil-rated / exempt
    isup_rev: GSTR3BSupplyDetail;     // 3.1(d) inward on which RCM payable
  };
  inter_sup: {
    unreg_details: GSTR3BInterStateRow[]; // 3.2 inter-state to unregistered
    comp_details: GSTR3BInterStateRow[];  // 3.2 inter-state to composition
    uin_details: GSTR3BInterStateRow[];   // 3.2 inter-state to UIN holders
  };
}

function zero(): GSTR3BSupplyDetail {
  return { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
}

function r2(n: number) { return Math.round(n * 100) / 100; }

function addToDetail(acc: GSTR3BSupplyDetail, inv: GSTInvoice) {
  acc.txval = r2(acc.txval + toRupees(inv.taxableValuePaise));
  acc.iamt  = r2(acc.iamt  + toRupees(inv.igstPaise));
  acc.camt  = r2(acc.camt  + toRupees(inv.cgstPaise));
  acc.samt  = r2(acc.samt  + toRupees(inv.sgstPaise));
  acc.csamt = r2(acc.csamt + toRupees(inv.cessPaise));
}

export function generateGSTR3BSections(invoices: GSTInvoice[]): GSTR3BSections {
  const valid = invoices.filter(i => i.validationStatus === 'VALID' || i.validationStatus === 'WARNING');

  const osup_det     = zero();
  const osup_zero    = zero();
  const osup_nil_exmp = zero();
  const isup_rev     = zero();

  const unregMap = new Map<string, GSTR3BInterStateRow>();

  for (const inv of valid) {
    const pos = String(inv.placeOfSupply).padStart(2, '0');

    switch (inv.invoiceType) {
      case 'B2B':
        addToDetail(osup_det, inv);
        break;

      case 'B2B_RCM':
        addToDetail(isup_rev, inv);
        break;

      case 'B2CS':
        addToDetail(osup_det, inv);
        if (inv.isInterState) {
          const ex = unregMap.get(pos);
          if (ex) {
            ex.txval = r2(ex.txval + toRupees(inv.taxableValuePaise));
            ex.iamt  = r2(ex.iamt  + toRupees(inv.igstPaise));
          } else {
            unregMap.set(pos, { pos, txval: r2(toRupees(inv.taxableValuePaise)), iamt: r2(toRupees(inv.igstPaise)) });
          }
        }
        break;

      case 'B2CL':
        addToDetail(osup_det, inv);
        {
          const ex = unregMap.get(pos);
          if (ex) {
            ex.txval = r2(ex.txval + toRupees(inv.taxableValuePaise));
            ex.iamt  = r2(ex.iamt  + toRupees(inv.igstPaise));
          } else {
            unregMap.set(pos, { pos, txval: r2(toRupees(inv.taxableValuePaise)), iamt: r2(toRupees(inv.igstPaise)) });
          }
        }
        break;

      case 'EXP_WITH_PAY':
      case 'EXP_WITHOUT_PAY':
      case 'SEZ_WITH_PAY':
      case 'SEZ_WITHOUT_PAY':
        addToDetail(osup_zero, inv);
        break;

      case 'EXEMPTED':
        addToDetail(osup_nil_exmp, inv);
        break;

      // CDNR / CDNUR reduce the respective section but handled as separate adjustment in portal
      // For now skip — portal applies them independently
    }
  }

  return {
    sup_details: { osup_det, osup_zero, osup_nil_exmp, isup_rev },
    inter_sup: {
      unreg_details: Array.from(unregMap.values()),
      comp_details: [],
      uin_details: [],
    },
  };
}
