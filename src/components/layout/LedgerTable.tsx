import { useState, useEffect } from 'react';
import { LedgerEntry } from '@/lib/db';
import { formatCurrency, formatDate } from '@/lib/gst';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MessageCircle, Edit, Trash2, Plus, Download, Printer, PenTool } from 'lucide-react';
import { toast } from 'sonner';
import { LedgerFormatId, getFormatById } from '@/features/ledger-formats';
import { getLedgerDataSource } from '@/services/ledger.datasource';
import { useLedgerSync } from '@/hooks/useLedgerSync';
import { FilterBar, FilterState } from './FilterBar';
import { PaginationControls } from './PaginationControls';
import { saveAs } from 'file-saver';
import { useInvoiceShare } from '@/features/payments/hooks/useInvoiceShare';
import { WhatsAppPhoneModal } from '@/components/modals/WhatsAppPhoneModal';
import { findBestContact, upsertContact } from '@/lib/customerMatch';
import '@/styles/print.css';

interface LedgerTableProps {
  onAddEntry: () => void;
  onEditEntry?: (entry: LedgerEntry) => void; // Optional callback for edit
  onQuickPenEntry?: () => void; // Optional callback for quick pen entry
  refresh: number;
}

export function LedgerTable({ onAddEntry, onEditEntry, onQuickPenEntry, refresh }: LedgerTableProps) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [hasNext, setHasNext] = useState(false);

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    type: undefined,
    from: '',
    to: '',
    tags: '',
  });

  const [refreshLedger, setRefreshLedger] = useState(0);

  // WhatsApp Share State
  const { shareInvoice, isSharing } = useInvoiceShare();
  const [shareEntry, setShareEntry] = useState<LedgerEntry | null>(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  // Get selected format from localStorage
  const selectedFormatId = (localStorage.getItem('digbahi_format') || 'traditional-khata') as LedgerFormatId;
  const format = getFormatById(selectedFormatId);

  // Real-time sync: Listen for ledger events from other devices
  useLedgerSync({
    onEntryCreated: () => {
      setRefreshLedger(prev => prev + 1);
    },
    onEntryUpdated: (updatedEntry) => {
      // Update entry in list if present
      setEntries(prev => prev.map(e => e.id === updatedEntry.id ? { ...e, ...updatedEntry } : e));
    },
    onEntryDeleted: (deletedId) => {
      // Remove entry from list
      setEntries(prev => prev.filter(e => e.id !== deletedId));
    },
  });

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filters.search, filters.type, filters.from, filters.to, filters.tags]);

  useEffect(() => {
    const ctrl = new AbortController();
    loadEntries(ctrl.signal);
    return () => ctrl.abort(); // ✅ Cleanup on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, refreshLedger, page, pageSize, filters]);

  async function loadEntries(signal?: AbortSignal) {
    setLoading(true);
    setError(null);
    try {
      const datasource = getLedgerDataSource();
      const result = await datasource.list(
        {
          skip: page * pageSize,
          limit: pageSize,
          search: filters.search || undefined,
          type: filters.type || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          tags: filters.tags || undefined,
        },
        signal
      );
      setEntries(result.items);
      setTotal(result.total);
      setHasNext(result.hasNext);
    } catch (err: unknown) {
      if (signal?.aborted) return; // Ignore abort errors
      setError(err instanceof Error ? err.message : 'Failed to load ledger entries');
      toast.error('Failed to load ledger entries');
    } finally {
      setLoading(false);
    }
  }

  const handleShareClick = async (entry: LedgerEntry) => {
    if (!entry.party_name) {
      toast.error('Cannot share bill: No party name specified.');
      return;
    }
    
    setShareEntry(entry);

    // Smart Contact System matching (Phase 3: Fuzzy)
    try {
      const { contact } = await findBestContact(entry.party_name);

      // We ONLY auto-share if we got a confident match that has a phone number
      if (contact && contact.phone) {
        shareInvoice(entry, contact.phone);
      } else {
        // Unknown or uncertain number, show modal
        setShowPhoneModal(true);
      }
    } catch (err) {
      console.error('Contact lookup failed:', err);
      // Fallback to modal if DB errors
      setShowPhoneModal(true);
    }
  };

  const handlePhoneSubmit = async (phone: string, saveForFuture: boolean) => {
    setShowPhoneModal(false);
    if (!shareEntry) return;

    if (saveForFuture && shareEntry.party_name) {
      try {
        await upsertContact(shareEntry.party_name, phone);
        toast.success(`Number saved for ${shareEntry.party_name}`);
      } catch (err) {
        console.error('Failed to save contact:', err);
      }
    }

    shareInvoice(shareEntry, phone);
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      type: undefined,
      from: '',
      to: '',
      tags: '',
    });
    setPage(0);
  };

  const hasActiveFilters =
    filters.search ||
    filters.type ||
    filters.from ||
    filters.to ||
    filters.tags;

  /**
   * Calculate running balance for entries
   * Balance increases for sales/receipts (credit), decreases for purchases/expenses (debit)
   */
  const calculateRunningBalance = (entries: LedgerEntry[], openingBalance: number = 0): number[] => {
    let balance = openingBalance;
    return entries.map(entry => {
      const amount = entry.amount + entry.gstAmount;
      if (entry.type === 'sale' || entry.type === 'receipt') {
        balance += amount; // Credit (money coming in)
      } else {
        balance -= amount; // Debit (money going out)
      }
      return balance;
    });
  };

  /**
   * Calculate totals for filtered entries
   */
  const calculateTotals = () => {
    const totalDebit = entries
      .filter(e => e.type === 'purchase' || e.type === 'expense')
      .reduce((sum, e) => sum + e.amount + e.gstAmount, 0);

    const totalCredit = entries
      .filter(e => e.type === 'sale' || e.type === 'receipt')
      .reduce((sum, e) => sum + e.amount + e.gstAmount, 0);

    const net = totalCredit - totalDebit;

    return { totalDebit, totalCredit, net };
  };

  const handlePartyClick = (partyName: string) => {
    if (partyName && partyName.trim()) {
      setFilters({
        ...filters,
        search: partyName.trim(), // Use search to filter by party name
      });
      setPage(0);
    }
  };

  /**
   * Generate CSV content from current filtered entries
   */
  const generateCSV = (entries: LedgerEntry[], runningBalances: number[]): string => {
    // CSV header
    const headers = [
      'Date',
      'Type',
      'Description',
      'Party Name',
      'Reference No.',
      'Amount',
      'GST Rate (%)',
      'GST Amount',
      'Total Amount',
      'Tags',
      'Balance'
    ];

    // Escape CSV values (handle commas, quotes, newlines)
    const escapeCSV = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Build CSV rows
    const rows = entries.map((entry, idx) => {
      const totalAmount = entry.amount + (entry.gstAmount || 0);
      return [
        entry.date,
        entry.type,
        entry.description || '',
        entry.party_name || '',
        entry.reference_no || '',
        entry.amount,
        entry.gstRate || 0,
        entry.gstAmount || 0,
        totalAmount,
        entry.tags || '',
        runningBalances[idx] || 0
      ].map(escapeCSV).join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  };

  /**
   * Handle CSV export
   */
  const handleExportCSV = () => {
    try {
      if (entries.length === 0) {
        toast.error('No entries to export');
        return;
      }

      const runningBalances = calculateRunningBalance(entries);
      const csvContent = generateCSV(entries, runningBalances);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

      // Generate filename
      const fromStr = filters.from || 'all';
      const toStr = filters.to || 'all';
      const filename = `ledger_${fromStr}_${toStr}_${Date.now()}.csv`;

      saveAs(blob, filename);
      toast.success('CSV exported successfully');
    } catch (error: unknown) {
      console.error('CSV export failed:', error);
      toast.error('Failed to export CSV: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  /**
   * Handle Print
   */
  const handlePrint = () => {
    window.print();
  };

  /**
   * Get filter summary for print header
   */
  const getFilterSummary = (): string => {
    const parts: string[] = [];
    if (filters.search) parts.push(`Search: ${filters.search}`);
    if (filters.type) parts.push(`Type: ${filters.type}`);
    if (filters.from) parts.push(`From: ${filters.from}`);
    if (filters.to) parts.push(`To: ${filters.to}`);
    if (filters.tags) parts.push(`Tags: ${filters.tags}`);
    return parts.length > 0 ? parts.join(', ') : 'All entries';
  };

  async function handleDelete(id: number | undefined) {
    if (!id) return;

    if (confirm('Delete this entry?')) {
      try {
        const datasource = getLedgerDataSource();
        await datasource.remove(id);
        await loadEntries();
        toast.success('Entry deleted');
      } catch (error) {
        toast.error('Failed to delete entry');
      }
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading ledger...</div>;
  }

  // Render table based on format
  const renderFormatTable = () => {
    if (!format) return renderDefaultTable();

    switch (format.id) {
      case 'cash-book':
        return renderCashBookTable();
      case 'double-entry':
        return renderDoubleEntryTable();
      case 'party-ledger':
        return renderPartyLedgerTable();
      default:
        return renderTraditionalTable();
    }
  };

  const renderTraditionalTable = () => {
    const runningBalances = calculateRunningBalance(entries);
    const totals = calculateTotals();

    return (
      <div className="border rounded-lg shadow-md overflow-hidden bg-[#fefce8]" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <Table>
          <TableHeader>
            <TableRow className="bg-gradient-to-r from-amber-50 to-yellow-50 border-b-2 border-amber-200">
              <TableHead className="font-bold text-gray-800">Date</TableHead>
              <TableHead className="font-bold text-gray-800">Party Name</TableHead>
              <TableHead className="font-bold text-gray-800">Details</TableHead>
              <TableHead className="text-right font-bold text-gray-800">Amount</TableHead>
              <TableHead className="text-right font-bold text-gray-800">Balance</TableHead>
              <TableHead className="text-right font-bold text-gray-800">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry, idx) => {
              const balance = runningBalances[idx];
              const isPositive = balance >= 0;

              return (
                <TableRow key={entry.id} className="border-b border-amber-100 hover:bg-amber-50/50">
                  <TableCell className="font-mono">{formatDate(entry.date)}</TableCell>
                  <TableCell className="font-medium">
                    {entry.party_name ? (
                      <button
                        onClick={() => handlePartyClick(entry.party_name || '')}
                        className="hover:underline text-primary cursor-pointer"
                        title="Filter by this party"
                      >
                        {entry.party_name}
                      </button>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>{entry.description}</TableCell>
                  <TableCell className="text-right font-semibold" style={{ color: entry.type === 'sale' || entry.type === 'receipt' ? '#059669' : '#dc2626' }}>
                    {formatCurrency(entry.amount + entry.gstAmount)}
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(Math.abs(balance))} {balance < 0 && '(Due)'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end items-center">
                      {(entry.type === 'sale' || entry.type === 'receipt') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => handleShareClick(entry)}
                          disabled={isSharing && shareEntry?.id === entry.id}
                          title="Share via WhatsApp"
                        >
                          {isSharing && shareEntry?.id === entry.id ? (
                            <span className="animate-spin text-xs">⏳</span>
                          ) : (
                            <MessageCircle className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => onEditEntry?.(entry)}
                        title="Edit entry"
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(entry.id)}
                        className="h-7 w-7 p-0 text-destructive"
                        title="Delete entry"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {/* Totals Row */}
            <TableRow className="bg-amber-100 font-bold border-t-2 border-amber-300">
              <TableCell colSpan={3} className="text-right">
                Totals:
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(totals.totalCredit - totals.totalDebit)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(Math.abs(totals.net))}
                {totals.net < 0 && ' (Due)'}
              </TableCell>
              <TableCell className="text-right">
                <div className="text-xs text-muted-foreground">
                  <div>Debit: {formatCurrency(totals.totalDebit)}</div>
                  <div>Credit: {formatCurrency(totals.totalCredit)}</div>
                  <div>Net: {formatCurrency(totals.net)}</div>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderCashBookTable = () => {
    const totalIn = entries.filter(e => e.type === 'sale' || e.type === 'receipt').reduce((sum, e) => sum + e.amount + e.gstAmount, 0);
    const totalOut = entries.filter(e => e.type === 'purchase' || e.type === 'expense').reduce((sum, e) => sum + e.amount + e.gstAmount, 0);
    const runningBalances = calculateRunningBalance(entries);

    // Group entries by date
    const groupedByDate = entries.reduce((acc, entry, idx) => {
      const date = entry.date;
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push({ entry, balance: runningBalances[idx] });
      return acc;
    }, {} as Record<string, Array<{ entry: LedgerEntry; balance: number }>>);

    const sortedDates = Object.keys(groupedByDate).sort();

    return (
      <div className="border rounded-lg shadow-md overflow-hidden bg-[#fffbeb]">
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 p-4 border-b-2 border-orange-200">
          <div className="flex justify-between text-sm font-semibold">
            <span>Opening Balance: {formatCurrency(0)}</span>
            <span>Closing Balance: {formatCurrency(totalIn - totalOut)}</span>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-gradient-to-r from-orange-50 to-amber-50">
              <TableHead className="font-bold text-gray-800 w-1/5">Date</TableHead>
              <TableHead className="font-bold text-gray-800 w-2/5">Cash In (Receipt)</TableHead>
              <TableHead className="font-bold text-gray-800 w-2/5">Cash Out (Payment)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedDates.map(date => {
              const dayEntries = groupedByDate[date];
              const dayTotalIn = dayEntries
                .filter(e => e.entry.type === 'sale' || e.entry.type === 'receipt')
                .reduce((sum, e) => sum + e.entry.amount + e.entry.gstAmount, 0);
              const dayTotalOut = dayEntries
                .filter(e => e.entry.type === 'purchase' || e.entry.type === 'expense')
                .reduce((sum, e) => sum + e.entry.amount + e.entry.gstAmount, 0);

              return (
                <>
                  {dayEntries.map(({ entry }) => (
                    <TableRow key={entry.id} className="border-b border-orange-100">
                      <TableCell className="font-mono">{formatDate(entry.date)}</TableCell>
                      <TableCell className="text-green-700 font-semibold">
                        {(entry.type === 'sale' || entry.type === 'receipt') ? formatCurrency(entry.amount + entry.gstAmount) : '-'}
                      </TableCell>
                      <TableCell className="text-red-700 font-semibold">
                        {(entry.type === 'purchase' || entry.type === 'expense') ? formatCurrency(entry.amount + entry.gstAmount) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Per-day subtotal */}
                  <TableRow className="bg-orange-50 font-semibold border-t border-orange-200">
                    <TableCell className="text-xs text-muted-foreground">{formatDate(date)} Subtotal:</TableCell>
                    <TableCell className="text-green-700">{formatCurrency(dayTotalIn)}</TableCell>
                    <TableCell className="text-red-700">{formatCurrency(dayTotalOut)}</TableCell>
                  </TableRow>
                </>
              );
            })}
            {/* Final totals */}
            <TableRow className="bg-orange-100 font-bold border-t-2 border-orange-300">
              <TableCell>Total:</TableCell>
              <TableCell className="text-green-700">{formatCurrency(totalIn)}</TableCell>
              <TableCell className="text-red-700">{formatCurrency(totalOut)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderDoubleEntryTable = () => {
    const totals = calculateTotals();

    return (
      <div className="border rounded-lg shadow-md overflow-hidden bg-[#f0fdf4]">
        <Table>
          <TableHeader>
            <TableRow className="bg-gradient-to-r from-green-50 to-emerald-50 border-b-2 border-green-200">
              <TableHead className="font-bold text-gray-800">Date</TableHead>
              <TableHead className="font-bold text-gray-800 text-right">Jama (Credit)</TableHead>
              <TableHead className="font-bold text-gray-800 text-right">Kharcha (Debit)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(entry => (
              <TableRow key={entry.id} className="border-b border-green-100">
                <TableCell className="font-mono">{formatDate(entry.date)}<br /><span className="text-xs text-gray-500">{entry.description}</span></TableCell>
                <TableCell className="text-right text-green-700 font-semibold">
                  {(entry.type === 'sale' || entry.type === 'receipt') ? formatCurrency(entry.amount + entry.gstAmount) : '-'}
                </TableCell>
                <TableCell className="text-right text-red-700 font-semibold">
                  {(entry.type === 'purchase' || entry.type === 'expense') ? formatCurrency(entry.amount + entry.gstAmount) : '-'}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-green-100 font-bold border-t-2 border-green-300">
              <TableCell>Total:</TableCell>
              <TableCell className="text-right text-green-700">{formatCurrency(totals.totalCredit)}</TableCell>
              <TableCell className="text-right text-red-700">{formatCurrency(totals.totalDebit)}</TableCell>
            </TableRow>
            <TableRow className="bg-green-200 font-bold">
              <TableCell colSpan={2} className="text-right">Net:</TableCell>
              <TableCell className={`text-right font-bold ${totals.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatCurrency(totals.net)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderPartyLedgerTable = () => {
    // Filter entries to only show sale/receipt types for party ledger
    const partyEntries = entries.filter(e => e.type === 'sale' || e.type === 'receipt');
    const runningBalances = calculateRunningBalance(partyEntries);

    // Calculate opening balance if date filter is active
    let openingBalance = 0;
    let showOpeningBalance = false;
    if (filters.from) {
      // Note: This is a simplified calculation. For true opening balance,
      // we would need to fetch all entries before 'from' date.
      // For now, we show a partial balance note.
      openingBalance = 0; // Would need to fetch pre-filter entries
      showOpeningBalance = true;
    }

    // Calculate totals for party ledger
    const totalGiven = partyEntries
      .filter(e => e.type === 'sale')
      .reduce((sum, e) => sum + e.amount + e.gstAmount, 0);
    const totalReceived = partyEntries
      .filter(e => e.type === 'receipt')
      .reduce((sum, e) => sum + e.amount + e.gstAmount, 0);
    const finalBalance = runningBalances[runningBalances.length - 1] || 0;

    return (
      <div className="space-y-2">
        {/* Opening Balance Display */}
        {showOpeningBalance ? (
          <div className="p-2 bg-blue-50 border border-blue-200 rounded">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">Opening Balance:</span>
              <span className="text-primary font-bold">{formatCurrency(openingBalance)}</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground p-2 bg-yellow-50 border border-yellow-200 rounded">
            ⚠️ Partial balance (page scope only)
          </div>
        )}

        <div className="border rounded-lg shadow-md overflow-hidden bg-[#f0f9ff]">
          <Table>
            <TableHeader>
              <TableRow className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b-2 border-blue-200">
                <TableHead className="font-bold text-gray-800">Date</TableHead>
                <TableHead className="font-bold text-gray-800">Party Name</TableHead>
                <TableHead className="font-bold text-gray-800 text-right">Given (Sale)</TableHead>
                <TableHead className="font-bold text-gray-800 text-right">Received (Payment)</TableHead>
                <TableHead className="font-bold text-gray-800 text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partyEntries.map((entry, idx) => {
                const balance = runningBalances[idx];
                const isDue = balance > 0;

                return (
                  <TableRow key={entry.id} className="border-b border-blue-100">
                    <TableCell className="font-mono">{formatDate(entry.date)}</TableCell>
                    <TableCell className="font-medium">
                      {entry.party_name ? (
                        <button
                          onClick={() => handlePartyClick(entry.party_name || '')}
                          className="hover:underline text-primary cursor-pointer"
                          title="Filter by this party"
                        >
                          {entry.party_name}
                        </button>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-right text-orange-600 font-semibold">
                      {entry.type === 'sale' ? formatCurrency(entry.amount + entry.gstAmount) : '-'}
                    </TableCell>
                    <TableCell className="text-right text-green-600 font-semibold">
                      {entry.type === 'receipt' ? formatCurrency(entry.amount + entry.gstAmount) : '-'}
                    </TableCell>
                    <TableCell className={`text-right font-bold ${isDue ? 'text-orange-600' : 'text-green-600'}`}>
                      {formatCurrency(Math.abs(balance))} {isDue ? '(Due)' : '(Advance)'}
                    </TableCell>
                  </TableRow>
                );
              })}
              {/* Totals Row */}
              <TableRow className="bg-blue-100 font-bold border-t-2 border-blue-300">
                <TableCell colSpan={2} className="text-right">Totals:</TableCell>
                <TableCell className="text-right text-orange-600">{formatCurrency(totalGiven)}</TableCell>
                <TableCell className="text-right text-green-600">{formatCurrency(totalReceived)}</TableCell>
                <TableCell className={`text-right font-bold ${finalBalance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {formatCurrency(Math.abs(finalBalance))} {finalBalance > 0 ? '(Due)' : '(Advance)'}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  const renderDefaultTable = () => renderTraditionalTable();

  const totals = calculateTotals();
  const runningBalances = calculateRunningBalance(entries);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-[hsl(145_70%_32%)] to-[hsl(40_98%_48%)] bg-clip-text text-transparent">
            Ledger Entries
          </h2>
          {format && (
            <p className="text-sm text-muted-foreground mt-1">
              {format.icon} {format.name} Format
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleExportCSV}
            variant="outline"
            disabled={loading || entries.length === 0}
            className="touch-friendly"
            title="Export current filtered entries to CSV"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button
            onClick={handlePrint}
            variant="outline"
            disabled={loading || entries.length === 0}
            className="touch-friendly"
            title="Print current filtered entries"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
          {onQuickPenEntry && (
            <Button
              onClick={onQuickPenEntry}
              className="gradient-hero touch-friendly hover-glow hover-scale"
              title="Quick entry using pen input (recommended)"
            >
              <PenTool className="w-4 h-4 mr-2" />
              Quick Pen Entry
            </Button>
          )}
          <Button onClick={onAddEntry} className="gradient-hero touch-friendly hover-glow hover-scale">
            <Plus className="w-4 h-4 mr-2" />
            New Entry
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        filters={filters}
        onFiltersChange={setFilters}
        onReset={handleResetFilters}
      />

      {/* Loading State */}
      {loading && (
        <Card className="p-8 text-center">
          <div className="space-y-2">
            <div className="h-4 bg-muted animate-pulse rounded w-3/4 mx-auto"></div>
            <div className="h-4 bg-muted animate-pulse rounded w-1/2 mx-auto"></div>
            <div className="h-4 bg-muted animate-pulse rounded w-2/3 mx-auto"></div>
          </div>
        </Card>
      )}

      {/* Error State */}
      {error && !loading && (
        <Card className="p-4 border-destructive">
          <p className="text-destructive text-sm">{error}</p>
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && entries.length === 0 && (
        <Card className="p-8 text-center gradient-card shadow-medium animate-scale-in">
          <p className="text-muted-foreground mb-4">
            {hasActiveFilters ? 'No entries match your filters' : 'No entries yet. Create your first transaction!'}
          </p>
          {hasActiveFilters ? (
            <Button onClick={handleResetFilters} variant="outline" className="hover-lift">
              Clear Filters
            </Button>
          ) : (
            <div className="flex gap-2 justify-center">
              {onQuickPenEntry && (
                <Button onClick={onQuickPenEntry} className="gradient-hero hover-lift">
                  <PenTool className="w-4 h-4 mr-2" />
                  Quick Pen Entry
                </Button>
              )}
              <Button onClick={onAddEntry} variant="outline" className="hover-lift">
                <Plus className="w-4 h-4 mr-2" />
                Form Entry
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Table */}
      {!loading && !error && entries.length > 0 && (
        <>
          {renderFormatTable()}

          {/* Pagination Controls */}
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={total}
            hasNext={hasNext}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      )}

      {/* Print Container (Hidden by default via CSS, shown only when printing) */}
      <div className="print-container">
        <div className="print-header">
          <h1 className="print-title">Ledger Report</h1>
          <div className="print-meta">
            <p>Date: {new Date().toLocaleDateString()}</p>
            <p>Filters: {getFilterSummary()}</p>
            <p>Total Entries: {entries.length}</p>
          </div>
          <div className="print-totals">
            <p>Total Debit: {formatCurrency(totals.totalDebit)}</p>
            <p>Total Credit: {formatCurrency(totals.totalCredit)}</p>
            <p>Net: {formatCurrency(totals.net)}</p>
          </div>
        </div>
        <table className="print-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Party Name</th>
              <th>Details</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => {
              const balance = runningBalances[idx];
              return (
                <tr key={entry.id}>
                  <td>{formatDate(entry.date)}</td>
                  <td>{entry.party_name || '-'}</td>
                  <td>{entry.description}</td>
                  <td className="text-right">
                    {formatCurrency(entry.amount + (entry.gstAmount || 0))}
                  </td>
                  <td className="text-right">{formatCurrency(balance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {shareEntry && (
        <WhatsAppPhoneModal
          open={showPhoneModal}
          partyName={shareEntry.party_name || 'Customer'}
          onClose={() => setShowPhoneModal(false)}
          onSubmit={handlePhoneSubmit}
        />
      )}
    </div>
  );
}
