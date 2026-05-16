import type { GSTInvoice } from '../types/gst-invoice.types';
import { toRupees } from './tax-splitter.service';

export interface B2BInvItem {
  inum: string;
  idt: string;        // DD-MM-YYYY
  val: number;
  pos: string;
  rchrg: string;
  itms: Array<{ num: number; itm_det: { txval: number; rt: number; iamt?: number; camt?: number; samt?: number } }>;
}

export interface B2BGroup { ctin: string; inv: B2BInvItem[] }

export interface B2CSItem {
  sply_ty: string;
  rt: number;
  txval: number;
  iamt?: number;
  camt?: number;
  samt?: number;
  pos: string;
}

export interface EXPInvItem {
  inum: string;
  idt: string;
  val: number;
  itms: Array<{ txval: number; rt: number; iamt?: number }>;
}

export interface EXPGroup { exp_typ: string; inv: EXPInvItem[] }

export interface GSTR1Sections {
  b2b: B2BGroup[];
  b2cs: B2CSItem[];
  b2cl: B2BGroup[];
  exp: EXPGroup[];
  cdnr: unknown[];
  cdnur: unknown[];
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function r2(n: number) { return Math.round(n * 100) / 100; }

export function generateGSTR1Sections(invoices: GSTInvoice[], _companyStateCode: number): GSTR1Sections {
  const valid = invoices.filter(i => i.validationStatus === 'VALID' || i.validationStatus === 'WARNING');

  const b2bMap = new Map<string, B2BInvItem[]>();
  const b2csMap = new Map<string, B2CSItem>(); // key: `${pos}_${rate}`
  const b2clMap = new Map<string, B2BInvItem[]>();
  const expWpay: EXPInvItem[] = [];
  const expWopay: EXPInvItem[] = [];

  for (const inv of valid) {
    const txval = r2(toRupees(inv.taxableValuePaise));
    const val   = r2(toRupees(inv.totalPaise));
    const iamt  = inv.igstPaise  ? r2(toRupees(inv.igstPaise))  : undefined;
    const camt  = inv.cgstPaise  ? r2(toRupees(inv.cgstPaise))  : undefined;
    const samt  = inv.sgstPaise  ? r2(toRupees(inv.sgstPaise))  : undefined;
    const pos   = String(inv.placeOfSupply).padStart(2, '0');
    const itm_det = { txval, rt: inv.gstRate, ...(iamt ? {iamt} : {}), ...(camt ? {camt} : {}), ...(samt ? {samt} : {}) };
    const invItem: B2BInvItem = {
      inum: inv.invoiceNumber, idt: fmtDate(inv.invoiceDate),
      val, pos, rchrg: inv.reverseCharge ? 'Y' : 'N',
      itms: [{ num: 1, itm_det }],
    };

    if (inv.invoiceType === 'B2B' || inv.invoiceType === 'B2B_RCM') {
      const g = inv.buyerGstin!;
      if (!b2bMap.has(g)) b2bMap.set(g, []);
      b2bMap.get(g)!.push(invItem);
    } else if (inv.invoiceType === 'B2CS') {
      const key = `${pos}_${inv.gstRate}`;
      const ex = b2csMap.get(key);
      const sply_ty = inv.isInterState ? 'INTER' : 'INTRA';
      if (ex) {
        ex.txval = r2(ex.txval + txval);
        if (iamt !== undefined) ex.iamt = r2((ex.iamt ?? 0) + iamt);
        if (camt !== undefined) ex.camt = r2((ex.camt ?? 0) + camt);
        if (samt !== undefined) ex.samt = r2((ex.samt ?? 0) + samt);
      } else {
        b2csMap.set(key, { sply_ty, rt: inv.gstRate, txval, iamt, camt, samt, pos });
      }
    } else if (inv.invoiceType === 'B2CL') {
      const k = inv.buyerGstin ?? 'URP';
      if (!b2clMap.has(k)) b2clMap.set(k, []);
      b2clMap.get(k)!.push(invItem);
    } else if (inv.invoiceType === 'EXP_WITH_PAY') {
      expWpay.push({ inum: inv.invoiceNumber, idt: fmtDate(inv.invoiceDate), val, itms: [{txval, rt: inv.gstRate, iamt}] });
    } else if (inv.invoiceType === 'EXP_WITHOUT_PAY') {
      expWopay.push({ inum: inv.invoiceNumber, idt: fmtDate(inv.invoiceDate), val, itms: [{txval, rt: inv.gstRate}] });
    }
  }

  const exp: EXPGroup[] = [];
  if (expWpay.length)  exp.push({ exp_typ: 'WPAY',  inv: expWpay });
  if (expWopay.length) exp.push({ exp_typ: 'WOPAY', inv: expWopay });

  return {
    b2b:  Array.from(b2bMap.entries()).map(([ctin, inv]) => ({ ctin, inv })),
    b2cs: Array.from(b2csMap.values()),
    b2cl: Array.from(b2clMap.entries()).map(([ctin, inv]) => ({ ctin, inv })),
    exp,
    cdnr: [], cdnur: [],
  };
}
