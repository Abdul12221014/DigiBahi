import { saveAs } from 'file-saver';
import type { GSTInvoice } from '../types/gst-invoice.types';
import { generateGSTR1Sections } from './gstr1-generator.service';
import { generateGSTR3BSections } from './gstr3b-generator.service';

export interface GSTNExportMeta {
  gstin: string;
  companyStateCode: number;
  returnPeriod: string; // 'YYYY-MM'
  fp: string;           // 'MMYYYY' — derived automatically
}

function toFP(returnPeriod: string): string {
  const [y, m] = returnPeriod.split('-');
  return `${m}${y}`;
}

export function buildGSTR1JSON(invoices: GSTInvoice[], meta: GSTNExportMeta): object {
  const sections = generateGSTR1Sections(invoices, meta.companyStateCode);
  return {
    gstin: meta.gstin,
    fp: toFP(meta.returnPeriod),
    ...sections,
  };
}

export function buildGSTR3BJSON(invoices: GSTInvoice[], meta: GSTNExportMeta): object {
  const sections = generateGSTR3BSections(invoices);
  return {
    gstin: meta.gstin,
    ret_period: toFP(meta.returnPeriod),
    ...sections,
  };
}

function downloadJSON(data: object, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  saveAs(blob, filename);
}

export function downloadGSTR1(invoices: GSTInvoice[], meta: GSTNExportMeta): void {
  const data = buildGSTR1JSON(invoices, meta);
  downloadJSON(data, `GSTR1_${meta.gstin}_${toFP(meta.returnPeriod)}.json`);
}

export function downloadGSTR3B(invoices: GSTInvoice[], meta: GSTNExportMeta): void {
  const data = buildGSTR3BJSON(invoices, meta);
  downloadJSON(data, `GSTR3B_${meta.gstin}_${toFP(meta.returnPeriod)}.json`);
}
