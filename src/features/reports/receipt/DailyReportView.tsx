import React, { useEffect, useState } from 'react';
import { db, LedgerEntry } from '@/lib/db';
import { formatCurrency, formatDate } from '@/lib/gst';
import { useSearchParams } from 'react-router-dom';
import { printerService } from '@/services/PrinterService';
import { ESCPOS } from '@/lib/escpos';
import { toast } from 'sonner';

export function DailyReportView() {
    const [entries, setEntries] = useState<LedgerEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchParams] = useSearchParams();
    const autoPrint = searchParams.get('autoprint') === 'true';
    const printerState = searchParams.get('printer');

    useEffect(() => {
        loadDailyEntries();
    }, []);

    async function loadDailyEntries() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get all entries for today
        const dailyEntries = await db.ledger
            .where('date')
            .aboveOrEqual(today)
            .toArray();

        setEntries(dailyEntries);
        setLoading(false);
    }

    const totals = entries.reduce((acc, entry) => {
        if (entry.type === 'sale' || entry.type === 'receipt') {
            acc.sales += entry.amount + entry.gstAmount;
            acc.gstCollected += entry.gstAmount;
            acc.count++;
        } else if (entry.type === 'purchase' || entry.type === 'expense') {
            acc.expenses += entry.amount + entry.gstAmount;
            acc.gstPaid += entry.gstAmount;
        }
        return acc;
    }, { sales: 0, expenses: 0, gstCollected: 0, gstPaid: 0, count: 0 });

    useEffect(() => {
        if (!loading && autoPrint) {
            handlePrint();
        }
    }, [loading, autoPrint]);

    const handlePrint = async () => {
        if (loading) return;

        if (printerState === 'offline') {
            window.print();
            return;
        }

        const status = await printerService.getStatus();

        if (status.status === 'online') {
            try {
                const encoder = new ESCPOS();
                encoder
                    .reset()
                    .align('center')
                    .bold(true)
                    .textLine('DAILY REPORT')
                    .bold(false)
                    .textLine(formatDate(new Date()))
                    .textLine('DigBahi App')
                    .feed(1)
                    .separator()
                    .align('left')
                    .bold(true)
                    .textLine('SALES SUMMARY')
                    .bold(false)
                    .textLine(`Transactions: ${totals.count}`)
                    .bold(true)
                    .textLine(`Total Sales: ${formatCurrency(totals.sales)}`)
                    .bold(false)
                    .separator()
                    .bold(true)
                    .textLine('TAX SUMMARY')
                    .bold(false)
                    .textLine(`GST Collected: ${formatCurrency(totals.gstCollected)}`)
                    .textLine(`GST Paid: ${formatCurrency(totals.gstPaid)}`)
                    .feed(1)
                    .bold(true)
                    .textLine(`Net GST: ${formatCurrency(totals.gstCollected - totals.gstPaid)}`)
                    .bold(false)
                    .separator()
                    .align('center')
                    .textLine('End of Report')
                    .textLine(new Date().toLocaleTimeString())
                    .feed(3)
                    .cut();

                const success = await printerService.print(encoder.encode());
                if (!success) throw new Error("Server print failed");
                toast.success("Printed Daily Report");
            } catch (error) {
                console.error("Print Error", error);
                toast.error("Printer error. Falling back to system dialog.");
                window.print();
            }
        } else {
            setTimeout(() => {
                window.print();
            }, 500);
        }
    };

    if (loading) return <div>Generating report...</div>;

    return (
        <div className="receipt-container font-mono text-xs text-black bg-white mx-auto">
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
                <h1 className="text-base font-bold uppercase tracking-wider">DAILY REPORT</h1>
                <p className="text-[10px]">{formatDate(new Date())}</p>
                <p className="text-[10px] mt-1">DigBahi App</p>
            </div>

            {/* Summary Section */}
            <div className="mb-2">
                <h2 className="font-bold text-[11px] border-b border-black border-dashed mb-1">SALES SUMMARY</h2>
                <div className="flex justify-between text-[11px] mb-1">
                    <span>Transactions:</span>
                    <span>{totals.count}</span>
                </div>
                <div className="flex justify-between font-bold text-[12px]">
                    <span>Total Sales:</span>
                    <span>{formatCurrency(totals.sales)}</span>
                </div>
            </div>

            <div className="my-2 border-b border-black border-dashed"></div>

            {/* GST Section */}
            <div className="mb-2">
                <h2 className="font-bold text-[11px] border-b border-black border-dashed mb-1">TAX SUMMARY</h2>
                <div className="flex justify-between text-[11px] mb-1">
                    <span>GST Collected:</span>
                    <span>{formatCurrency(totals.gstCollected)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                    <span>GST Paid:</span>
                    <span>{formatCurrency(totals.gstPaid)}</span>
                </div>
                <div className="flex justify-between font-bold text-[11px] mt-1 pt-1 border-t border-dotted border-gray-400">
                    <span>Net GST:</span>
                    <span>{formatCurrency(totals.gstCollected - totals.gstPaid)}</span>
                </div>
            </div>

            {/* Footer */}
            <div className="text-center text-[10px] space-y-1 mt-6 border-t border-black border-dashed pt-2">
                <p>End of Report</p>
                <p className="text-[8px] text-gray-500">{new Date().toLocaleTimeString()}</p>
            </div>

            <div className="no-print mt-4 text-center">
                <button
                    onClick={handlePrint}
                    className="bg-black text-white px-4 py-2 rounded text-xs hover:bg-gray-800 transition-colors"
                >
                    Print Report (58mm)
                </button>
            </div>
        </div>
    );
}
