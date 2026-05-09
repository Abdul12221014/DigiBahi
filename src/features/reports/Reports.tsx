import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { db, LedgerEntry } from '@/lib/db';
import { formatCurrency, formatDate } from '@/lib/gst';
import { toast } from 'sonner';
import { FileText, Download, Printer, Usb } from 'lucide-react';
import { saveAs } from 'file-saver';
import { usbPrinter } from '@/services/UsbPrinterService';
import { ESCPOS } from '@/lib/escpos';

// Lazy-load jsPDF
const loadJsPDF = async () => {
  const { default: jsPDF } = await import(/* webpackChunkName: "jspdf" */ 'jspdf');
  return jsPDF;
};

export function Reports() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [usbConnected, setUsbConnected] = useState(false);

  useEffect(() => {
    loadEntries();
    // Silently reconnect to a previously paired printer (no dialog shown)
    if (navigator.usb) {
      usbPrinter.reconnect().then(ok => {
        if (ok) setUsbConnected(true);
      });
    }
  }, []);

  const connectPrinter = async () => {
    try {
      const ok = await usbPrinter.connect();
      setUsbConnected(ok);
      if (ok) toast.success('USB Printer connected!');
      else toast.error('Could not connect to printer. Make sure it is plugged in.');
    } catch {
      toast.error('Printer connection cancelled.');
    }
  };

  const disconnectPrinter = async () => {
    await usbPrinter.disconnect();
    setUsbConnected(false);
    toast.info('Printer disconnected.');
  };

  async function loadEntries() {
    setLoading(true);
    try {
      const allEntries = await db.ledger.orderBy('date').reverse().toArray();
      setEntries(allEntries.filter(e => e.is_active !== false));
    } catch (error) {
      toast.error('Failed to load entries');
    } finally {
      setLoading(false);
    }
  }

  const calculateTotals = () => {
    const sales = entries.filter(e => e.type === 'sale').reduce((sum, e) => sum + e.amount + e.gstAmount, 0);
    const purchases = entries.filter(e => e.type === 'purchase').reduce((sum, e) => sum + e.amount + e.gstAmount, 0);
    const expenses = entries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount + e.gstAmount, 0);
    const receipts = entries.filter(e => e.type === 'receipt').reduce((sum, e) => sum + e.amount + e.gstAmount, 0);
    const gstCollected = entries.filter(e => e.type === 'sale').reduce((sum, e) => sum + e.gstAmount, 0);
    const gstPaid = entries.filter(e => ['purchase', 'expense'].includes(e.type)).reduce((sum, e) => sum + e.gstAmount, 0);

    return { sales, purchases, expenses, receipts, gstCollected, gstPaid };
  };

  const exportPDF = async (reportType: 'pl' | 'gst' | 'ledger') => {
    const jsPDF = await loadJsPDF();
    const doc = new jsPDF();
    const totals = calculateTotals();

    // Header
    doc.setFontSize(20);
    doc.text('DigitalMuneem', 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text('Professional Accounting Solutions', 105, 28, { align: 'center' });
    doc.line(20, 32, 190, 32);

    let yPos = 45;

    if (reportType === 'pl') {
      // Profit & Loss Statement
      doc.setFontSize(16);
      doc.text('Profit & Loss Statement', 20, yPos);
      yPos += 10;

      doc.setFontSize(11);
      doc.text(`Period: ${new Date().toLocaleDateString('en-IN')}`, 20, yPos);
      yPos += 15;

      // Income
      doc.setFontSize(12);
      doc.text('Income', 20, yPos);
      yPos += 8;
      doc.setFontSize(10);
      doc.text(`Sales Revenue: ${formatCurrency(totals.sales)}`, 30, yPos);
      yPos += 6;
      doc.text(`Other Receipts: ${formatCurrency(totals.receipts)}`, 30, yPos);
      yPos += 6;
      doc.text(`Total Income: ${formatCurrency(totals.sales + totals.receipts)}`, 30, yPos);
      yPos += 12;

      // Expenses
      doc.setFontSize(12);
      doc.text('Expenses', 20, yPos);
      yPos += 8;
      doc.setFontSize(10);
      doc.text(`Purchases: ${formatCurrency(totals.purchases)}`, 30, yPos);
      yPos += 6;
      doc.text(`Operating Expenses: ${formatCurrency(totals.expenses)}`, 30, yPos);
      yPos += 6;
      doc.text(`Total Expenses: ${formatCurrency(totals.purchases + totals.expenses)}`, 30, yPos);
      yPos += 12;

      // Net Profit/Loss
      const netPL = (totals.sales + totals.receipts) - (totals.purchases + totals.expenses);
      doc.setFontSize(12);
      doc.text(`Net ${netPL >= 0 ? 'Profit' : 'Loss'}: ${formatCurrency(Math.abs(netPL))}`, 20, yPos);

    } else if (reportType === 'gst') {
      // GST Report
      doc.setFontSize(16);
      doc.text('GST Report', 20, yPos);
      yPos += 10;

      doc.setFontSize(11);
      doc.text(`Period: ${new Date().toLocaleDateString('en-IN')}`, 20, yPos);
      yPos += 15;

      doc.setFontSize(10);
      doc.text(`GST Collected (Output Tax): ${formatCurrency(totals.gstCollected)}`, 20, yPos);
      yPos += 8;
      doc.text(`GST Paid (Input Tax Credit): ${formatCurrency(totals.gstPaid)}`, 20, yPos);
      yPos += 8;
      const netGST = totals.gstCollected - totals.gstPaid;
      doc.text(`Net GST ${netGST >= 0 ? 'Payable' : 'Refundable'}: ${formatCurrency(Math.abs(netGST))}`, 20, yPos);
      yPos += 15;

      // GST Breakdown by Rate
      doc.text('GST Breakdown by Rate:', 20, yPos);
      yPos += 8;
      const gstByRate = entries.reduce((acc, e) => {
        if (e.gstRate > 0) {
          if (!acc[e.gstRate]) acc[e.gstRate] = 0;
          acc[e.gstRate] += e.gstAmount;
        }
        return acc;
      }, {} as Record<number, number>);

      Object.entries(gstByRate).forEach(([rate, amount]) => {
        doc.text(`  ${rate}% GST: ${formatCurrency(amount)}`, 30, yPos);
        yPos += 6;
      });

    } else {
      // Ledger Summary
      doc.setFontSize(16);
      doc.text('Ledger Summary', 20, yPos);
      yPos += 10;

      doc.setFontSize(11);
      doc.text(`Total Entries: ${entries.length}`, 20, yPos);
      yPos += 15;

      doc.setFontSize(10);
      entries.slice(0, 20).forEach(entry => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(`${formatDate(entry.date)} - ${entry.description}`, 20, yPos);
        yPos += 5;
        doc.text(`${entry.type.toUpperCase()}: ${formatCurrency(entry.amount + entry.gstAmount)}`, 30, yPos);
        yPos += 8;
      });

      if (entries.length > 20) {
        doc.text(`... and ${entries.length - 20} more entries`, 20, yPos);
      }
    }

    // Footer
    doc.setFontSize(8);
    doc.text('Generated by DigitalMuneem Accounting Solutions', 105, 285, { align: 'center' });
    doc.text(`Date: ${new Date().toLocaleString('en-IN')}`, 105, 290, { align: 'center' });

    // Save PDF
    doc.save(`${reportType}_report_${Date.now()}.pdf`);
    toast.success('Report exported successfully');
  };

  const exportCSV = () => {
    const csvContent = [
      ['Date', 'Description', 'Type', 'Amount', 'GST Rate', 'GST Amount', 'Total'],
      ...entries.map(e => [
        e.date,
        e.description,
        e.type,
        e.amount.toString(),
        `${e.gstRate}%`,
        e.gstAmount.toString(),
        (e.amount + e.gstAmount).toString()
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `ledger_${Date.now()}.csv`);
    toast.success('Ledger exported to CSV');
  };

  const printReceipt = async (id: number) => {
    // If USB printer is connected, print directly from this window (avoids cross-window singleton issue)
    if (usbConnected && usbPrinter.isConnected()) {
      const entry = entries.find(e => e.id === id);
      if (!entry) { toast.error('Entry not found'); return; }
      try {
        const encoder = new ESCPOS();
        encoder
          .reset()
          .align('center')
          .bold(true).textLine('DigitalMuneem').bold(false)
          .textLine('Professional Accounting')
          .textLine('Ph: +91 98765 43210')
          .feed(1).separator()
          .align('left')
          .textLine(`Date: ${formatDate(entry.date)}`)
          .textLine(`Rcpt #: TRX-${entry.id}`)
          .textLine(`Type: ${entry.type.toUpperCase()}`)
          .separator()
          .bold(true).textLine(entry.description).bold(false)
          .textLine(`Amount: ${formatCurrency(entry.amount)}`)
          .textLine(`GST: ${formatCurrency(entry.gstAmount)}`)
          .separator()
          .align('right')
          .bold(true).textLine(`TOTAL: ${formatCurrency(entry.amount + entry.gstAmount)}`).bold(false)
          .feed(2).align('center')
          .textLine('Thank you for your business!')
          .textLine('Powered by DigitalMuneem')
          .feed(3).cut();
        const success = await usbPrinter.print(encoder.encode());
        if (!success) throw new Error('USB print failed');
        toast.success('Printed receipt to thermal printer');
      } catch (error) {
        console.error('USB Receipt Print Error:', error);
        toast.error('Printer error. Opening print dialog instead.');
        openReceiptPopup(id);
      }
    } else {
      // Not connected — open popup for browser print dialog
      openReceiptPopup(id);
    }
  };

  const openReceiptPopup = (id: number) => {
    const width = 400, height = 600;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    window.open(
      `/#/print/receipt/${id}?autoprint=true&printer=offline`,
      'ReceiptPrint',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
  };

  const printDailyReport = async () => {
    // If USB printer is connected, print directly from this window
    if (usbConnected && usbPrinter.isConnected()) {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayEntries = entries.filter(e => new Date(e.date) >= today);
        const dailyTotals = todayEntries.reduce((acc, e) => {
          if (e.type === 'sale' || e.type === 'receipt') {
            acc.sales += e.amount + e.gstAmount;
            acc.gstCollected += e.gstAmount;
            acc.count++;
          } else if (e.type === 'purchase' || e.type === 'expense') {
            acc.expenses += e.amount + e.gstAmount;
            acc.gstPaid += e.gstAmount;
          }
          return acc;
        }, { sales: 0, expenses: 0, gstCollected: 0, gstPaid: 0, count: 0 });

        const encoder = new ESCPOS();
        encoder
          .reset()
          .align('center')
          .bold(true).textLine('DAILY REPORT').bold(false)
          .textLine(formatDate(new Date().toISOString()))
          .textLine('DigitalMuneem App')
          .feed(1).separator()
          .align('left')
          .bold(true).textLine('SALES SUMMARY').bold(false)
          .textLine(`Transactions: ${dailyTotals.count}`)
          .bold(true).textLine(`Total Sales: ${formatCurrency(dailyTotals.sales)}`).bold(false)
          .separator()
          .bold(true).textLine('TAX SUMMARY').bold(false)
          .textLine(`GST Collected: ${formatCurrency(dailyTotals.gstCollected)}`)
          .textLine(`GST Paid: ${formatCurrency(dailyTotals.gstPaid)}`)
          .feed(1)
          .bold(true).textLine(`Net GST: ${formatCurrency(dailyTotals.gstCollected - dailyTotals.gstPaid)}`).bold(false)
          .separator()
          .align('center')
          .textLine('End of Report')
          .textLine(new Date().toLocaleTimeString())
          .feed(3).cut();
        const success = await usbPrinter.print(encoder.encode());
        if (!success) throw new Error('USB print failed');
        toast.success('Printed daily report to thermal printer');
      } catch (error) {
        console.error('USB Daily Report Print Error:', error);
        toast.error('Printer error. Opening print dialog instead.');
        openDailyReportPopup();
      }
    } else {
      openDailyReportPopup();
    }
  };

  const openDailyReportPopup = () => {
    const width = 400, height = 600;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    window.open(
      `/#/print/daily-report?autoprint=true&printer=offline`,
      'DailyReportPrint',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-[hsl(145_70%_32%)] to-[hsl(40_98%_48%)] bg-clip-text text-transparent">
          Reports & Analytics
        </h2>
        <div className="flex gap-2">
          {/* USB Printer Status Badge */}
          {usbConnected ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-md text-xs font-medium">
                <Usb className="w-3 h-3" />
                USB Printer Connected
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={disconnectPrinter}
                className="text-xs h-7 px-2 border-red-200 text-red-600 hover:bg-red-50"
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={connectPrinter}
              className="flex items-center gap-2 text-xs border-dashed border-gray-400 hover:border-gray-600"
            >
              <Usb className="w-3 h-3" />
              Connect USB Printer
            </Button>
          )}

          <Button
            onClick={printDailyReport}
            className="bg-black text-white hover:bg-gray-800"
          >
            <Printer className="w-4 h-4 mr-2" />
            Daily Report (58mm)
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6 shadow-medium gradient-card hover-lift animate-scale-in" style={{ animationDelay: '0.1s' }}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-[hsl(145_70%_32%)] to-[hsl(145_75%_42%)] shadow-glow">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold">Profit & Loss Statement</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Comprehensive income and expense report with net profit/loss calculation
            </p>
            <Button
              onClick={() => exportPDF('pl')}
              className="w-full gradient-hero touch-friendly hover-glow hover-scale"
            >
              <Download className="w-4 h-4 mr-2" />
              Export P&L (PDF)
            </Button>
          </div>
        </Card>

        <Card className="p-6 shadow-medium gradient-card hover-lift animate-scale-in" style={{ animationDelay: '0.2s' }}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-[hsl(40_98%_48%)] to-[hsl(45_95%_50%)] shadow-accent">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold">GST Report</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Detailed GST collected, paid, and net liability for GST portal filing
            </p>
            <Button
              onClick={() => exportPDF('gst')}
              className="w-full gradient-hero touch-friendly hover-glow hover-scale"
            >
              <Download className="w-4 h-4 mr-2" />
              Export GST (PDF)
            </Button>
          </div>
        </Card>

        <Card className="p-6 shadow-medium gradient-card hover-lift animate-scale-in" style={{ animationDelay: '0.3s' }}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-[hsl(145_70%_32%)] to-[hsl(40_98%_48%)] shadow-glow">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold">Ledger Summary</h3>
            </div>

            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
              <p className="text-xs text-muted-foreground font-medium sticky top-0 bg-white/95 backdrop-blur z-10 pb-2 border-b">
                Recent Transactions
              </p>
              {loading && Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center p-2 animate-pulse">
                  <div className="space-y-1">
                    <div className="h-2.5 w-16 bg-muted rounded" />
                    <div className="h-2 w-24 bg-muted rounded" />
                  </div>
                  <div className="h-2.5 w-12 bg-muted rounded" />
                </div>
              ))}
              {!loading && entries.slice(0, 10).map((entry) => (
                <div key={entry.id} className="flex justify-between items-center text-sm p-2 hover:bg-muted/50 rounded-md group">
                  <div className="flex flex-col">
                    <span className="font-medium text-xs">{formatDate(entry.date)}</span>
                    <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{entry.description}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs">
                      {formatCurrency(entry.amount + entry.gstAmount)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => entry.id && printReceipt(entry.id)}
                      title="Print Thermal Receipt"
                    >
                      <Printer className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              onClick={() => exportPDF('ledger')}
              className="w-full gradient-hero touch-friendly hover-glow hover-scale mt-2"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Full Ledger (PDF)
            </Button>
          </div>
        </Card>

        <Card className="p-6 shadow-medium gradient-card hover-lift animate-scale-in" style={{ animationDelay: '0.4s' }}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-[hsl(145_75%_35%)] to-[hsl(145_70%_45%)] shadow-medium">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold">CSV Export</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Export all ledger entries to CSV format for Excel/Tally import
            </p>
            <Button
              onClick={exportCSV}
              variant="outline"
              className="w-full touch-friendly hover-lift hover:border-primary"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
