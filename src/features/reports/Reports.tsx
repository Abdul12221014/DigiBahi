import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { db, LedgerEntry } from '@/lib/db';
import { formatCurrency, formatDate } from '@/lib/gst';
import { toast } from 'sonner';
import { FileText, Download, Printer, Usb } from 'lucide-react';
import { saveAs } from 'file-saver';
import { printerService } from '@/services/PrinterService';

// Lazy-load jsPDF
const loadJsPDF = async () => {
  const { default: jsPDF } = await import(/* webpackChunkName: "jspdf" */ 'jspdf');
  return jsPDF;
};

export function Reports() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [printerStatus, setPrinterStatus] = useState<{ status: string, port: string }>({ status: 'checking', port: '' });

  useEffect(() => {
    loadEntries();
    checkPrinterStatus();
  }, []);

  const checkPrinterStatus = async () => {
    const status = await printerService.getStatus();
    setPrinterStatus(status);
  };

  async function loadEntries() {
    try {
      const allEntries = await db.ledger.orderBy('date').reverse().toArray();
      setEntries(allEntries);
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
    const receipts = entries.filter(e => e.type === 'receipt').reduce((sum, e) => sum + e.amount, 0);
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
    doc.text('DigBahi', 105, 20, { align: 'center' });
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
    doc.text('Generated by DigBahi Accounting Solutions', 105, 285, { align: 'center' });
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

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `ledger_${Date.now()}.csv`);
    toast.success('Ledger exported to CSV');
  };

  const printReceipt = (id: number) => {
    // Open in a small popup window for thermal printing
    const width = 400;
    const height = 600;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    window.open(
      `/#/print/receipt/${id}?autoprint=true&printer=${printerStatus.status}`,
      'ReceiptPrint',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
  };

  if (loading) {
    return <div className="text-center py-8">Loading reports...</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-[hsl(145_70%_32%)] to-[hsl(40_98%_48%)] bg-clip-text text-transparent">
          Reports & Analytics
        </h2>
        <div className="flex gap-2">
          {printerStatus.status === 'online' ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-md text-xs font-medium">
              <Printer className="w-3 h-3" />
              Printer Online ({printerStatus.port})
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 rounded-md text-xs font-medium">
              <Printer className="w-3 h-3" />
              Printer Offline
            </div>
          )}

          <Button
            onClick={() => {
              const width = 400;
              const height = 600;
              const left = (window.screen.width - width) / 2;
              const top = (window.screen.height - height) / 2;
              window.open(
                `/#/print/daily-report?autoprint=true&printer=${printerStatus.status}`,
                'DailyReportPrint',
                `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
              );
            }}
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
              {entries.slice(0, 10).map((entry) => (
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
