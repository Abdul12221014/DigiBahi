import React from 'react';
import { Card } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/gst';
import { formatPhoneDisplay } from '@/lib/countryCode';
import type { CompanySettingsData } from '@/lib/invoiceGenerator';

interface LiveInvoicePreviewProps {
  companySettings: CompanySettingsData | null;
  invoiceNumber: string;
  date: string;
  customerName: string;
  customerPhone: string;
  country: { dialCode: string };
  description: string;
  amountNum: number;
  gstRate: number;
  gstCalculation: {
    baseAmount: number;
    gstAmount: number;
    totalAmount: number;
  };
}

export const LiveInvoicePreview = React.memo(function LiveInvoicePreview({
  companySettings,
  invoiceNumber,
  date,
  customerName,
  customerPhone,
  country,
  description,
  amountNum,
  gstRate,
  gstCalculation
}: LiveInvoicePreviewProps) {
  // We use React.memo so typing in unrelated fields (like OTP) doesn't cause a full re-render of this tree.
  return (
    <div className="hidden lg:block sticky top-6">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Live Preview</h3>
      <Card className="p-0 bg-white border border-slate-200 shadow-xl overflow-hidden rounded-xl">
        {/* Header */}
        <div className="bg-[#2A67B2] p-8 text-white text-center">
          <h2 className="text-2xl font-bold mb-1">{companySettings?.businessName || 'DigitalMuneem'}</h2>
          {companySettings?.address && <p className="text-sm opacity-90">{companySettings.address}</p>}
          {companySettings?.gstin && <p className="text-xs mt-2 opacity-80">GSTIN: {companySettings.gstin}</p>}
        </div>
        
        {/* Title */}
        <div className="px-8 py-6 flex justify-between items-end border-b border-slate-100">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">TAX INVOICE</h1>
            <p className="text-sm text-slate-500 mt-1">No: <span className="font-medium text-slate-800">{invoiceNumber || '---'}</span></p>
          </div>
          <p className="text-sm text-slate-500">Date: <span className="font-medium text-slate-800">{date ? formatDate(date) : '---'}</span></p>
        </div>

        {/* Bill To */}
        <div className="px-8 py-6 flex flex-col bg-slate-50/50">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Bill To</p>
          <p className="font-semibold text-slate-800 text-lg">{customerName || 'Customer Name'}</p>
          <p className="text-slate-600">Phone: {customerPhone ? `+${country.dialCode} ${formatPhoneDisplay(customerPhone, country.dialCode).replace(`+${country.dialCode} `, '')}` : '---'}</p>
        </div>

        {/* Line Items */}
        <div className="px-8 py-6">
          <div className="flex justify-between border-b pb-3 mb-4 text-sm font-semibold text-slate-500">
            <span>Description</span>
            <span>Amount</span>
          </div>
          <div className="flex justify-between items-center py-2 text-slate-800">
            <span className="font-medium truncate max-w-[200px]">{description || 'Item description'}</span>
            <span>{formatCurrency(amountNum)}</span>
          </div>
        </div>

        {/* Totals */}
        <div className="bg-slate-50 p-8 border-t border-slate-100">
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm text-slate-600">
              <span>Subtotal</span>
              <span>{formatCurrency(gstCalculation.baseAmount)}</span>
            </div>
            {gstRate > 0 && (
              <div className="flex justify-between items-center text-sm text-slate-600">
                <span>GST ({gstRate}%)</span>
                <span>{formatCurrency(gstCalculation.gstAmount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-4 border-t border-slate-200 mt-2">
              <span className="font-bold text-slate-800 uppercase tracking-tight">Total Amount</span>
              <span className="font-bold text-xl text-[#2A67B2]">{formatCurrency(gstCalculation.totalAmount)}</span>
            </div>
          </div>
        </div>
        
        <div className="bg-slate-100 p-4 text-center">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Generated securely by DigitalMuneem</p>
        </div>
      </Card>
    </div>
  );
});
