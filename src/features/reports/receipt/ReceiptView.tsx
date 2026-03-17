import React, { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatCurrency, formatDate } from '@/lib/gst';
import { printerService } from '@/services/PrinterService';
import { ESCPOS } from '@/lib/escpos';
import { toast } from 'sonner';

export function ReceiptView() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const autoPrint = searchParams.get('autoprint') === 'true';
  const printerState = searchParams.get('printer');

  const entry = useLiveQuery(async () => {
    if (!id) return null;
    if (id === 'demo') {
      return {
        id: 12345,
        date: new Date(),
        type: 'SALE',
        description: 'Demo Transaction Items',
        amount: 500,
        gstAmount: 25,
        gstRate: 5,
        partyName: 'Cash Sale'
      };
    }
    return await db.ledger.get(parseInt(id));
  }, [id]);

  useEffect(() => {
    if (entry && autoPrint) {
      handlePrint();
    }
  }, [entry, autoPrint]);

  const handlePrint = async () => {
    if (!entry) return;

    if (printerState === 'offline') {
      window.print();
      return;
    }

    // Check if server printer is available
    const status = await printerService.getStatus();

    if (status.status === 'online') {
      try {
        const encoder = new ESCPOS();
        encoder
          .reset()
          .align('center')
          .bold(true)
          .textLine('DigBahi')
          .bold(false)
          .textLine('Professional Accounting')
          .textLine('Ph: +91 98765 43210')
          .feed(1)
          .separator()
          .align('left')
          .textLine(`Date: ${formatDate(entry.date)}`)
          .textLine(`Rcpt #: TRX-${entry.id}`)
          .textLine(`Type: ${entry.type.toUpperCase()}`)
          .separator()
          .bold(true)
          .textLine(entry.description)
          .bold(false)
          .textLine(`Amount: ${formatCurrency(entry.amount)}`)
          .textLine(`GST: ${formatCurrency(entry.gstAmount)}`)
          .separator()
          .align('right')
          .bold(true)
          .textLine(`TOTAL: ${formatCurrency(entry.amount + entry.gstAmount)}`)
          .bold(false)
          .feed(2)
          .align('center')
          .textLine('Thank you for your business!')
          .textLine('Powered by DigBahi')
          .feed(3)
          .cut();

        const success = await printerService.print(encoder.encode());
        if (!success) throw new Error("Server print failed");

        toast.success("Printed to Thermal Printer");
      } catch (error) {
        console.error("Print Error", error);
        toast.error("Printer error. Falling back to system dialog.");
        window.print(); // Fallback
      }
    } else {
      // Fallback if printer is offline
      setTimeout(() => {
        window.print();
      }, 500);
    }
  };

  if (!entry) return <div>Loading receipt...</div>;

  return (
    <div className="receipt-container font-mono text-xs text-black bg-white mx-auto">
      {/* Print Styles */}
      <style>{`
        @media print {
          @page { margin: 0; size: 58mm auto; }
          body { margin: 0; padding: 0; background: white; }
          .no-print { display: none; }
          .receipt-container { 
            width: 58mm; 
            margin: 0; 
            padding: 0 5mm; 
            border: none;
            box-sizing: border-box;
          }
        }
        .receipt-container {
          width: 58mm;
          padding: 10px;
          background: white;
          font-family: 'Courier New', Courier, monospace;
        }
      `}</style>

      {/* Header */}
      <div className="text-center mb-4 border-b border-black pb-2 border-dashed">
        <h1 className="text-base font-bold uppercase tracking-wider">DigBahi</h1>
        <p className="text-[10px]">Professional Accounting</p>
        <p className="text-[10px] mt-1">Ph: +91 98765 43210</p>
      </div>

      {/* Transaction Details */}
      <div className="mb-2 space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span>Date:</span>
          <span>{formatDate(entry.date)}</span>
        </div>
        <div className="flex justify-between">
          <span>Rcpt #:</span>
          <span>TRX-{entry.id}</span>
        </div>
        <div className="flex justify-between">
          <span>Type:</span>
          <span className="uppercase font-bold">{entry.type}</span>
        </div>
      </div>

      <div className="border-b border-black border-dashed my-2"></div>

      {/* Items */}
      <div className="mb-2">
        <div className="font-bold mb-1 text-[12px]">{entry.description}</div>
        <div className="flex justify-between pl-2 text-[11px]">
          <span>Amount</span>
          <span>{formatCurrency(entry.amount)}</span>
        </div>
        {entry.gstAmount > 0 && (
          <div className="flex justify-between pl-2 text-[10px] text-gray-600">
            <span>GST ({entry.gstRate}%)</span>
            <span>{formatCurrency(entry.gstAmount)}</span>
          </div>
        )}
      </div>

      <div className="border-b border-black border-dashed my-2"></div>

      {/* Total */}
      <div className="flex justify-between font-bold text-sm mb-4">
        <span>TOTAL</span>
        <span>{formatCurrency(entry.amount + entry.gstAmount)}</span>
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] space-y-1 mt-6">
        <p>Thank you for your business!</p>
        <p className="text-[8px] text-gray-500">Powered by DigBahi</p>
      </div>

      <div className="no-print mt-4 text-center">
        <button
          onClick={handlePrint}
          className="bg-black text-white px-4 py-2 rounded text-xs hover:bg-gray-800 transition-colors"
        >
          Print Receipt (58mm)
        </button>
      </div>
    </div>
  );
}
