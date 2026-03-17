import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/gst';
import { TrendingUp, TrendingDown, Wallet, Calendar, Filter, ChevronDown, ChevronUp, BookOpen, Plus } from 'lucide-react';
import { getLedgerDataSource } from '@/services/ledger.datasource';
import { useLedgerSync } from '@/hooks/useLedgerSync';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { Charts } from '@/components/dashboard/Charts';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import * as ledgerApi from '@/services/ledger.api';

export function Dashboard() {
  const [summary, setSummary] = useState<ledgerApi.AnalyticsSummary>({
    total_sales: 0,
    total_purchases: 0,
    total_expenses: 0,
    total_receipts: 0,
    net_profit: 0,
    cash_flow: 0,
    gst_collected: 0,
    gst_paid: 0,
    net_gst: 0,
  });
  const [monthlyData, setMonthlyData] = useState<ledgerApi.MonthlySummary[]>([]);
  const [partyData, setPartyData] = useState<ledgerApi.PartySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  
  // Filters
  const [filters, setFilters] = useState<{ from?: string; to?: string; type?: string }>({});
  const abortControllerRef = useRef<AbortController | null>(null);

  // Real-time sync: Listen for ledger events
  useLedgerSync({
    onEntryCreated: () => {
      loadAnalytics();
    },
    onEntryUpdated: () => {
      loadAnalytics();
    },
    onEntryDeleted: () => {
      loadAnalytics();
    },
  });

  useEffect(() => {
    loadAnalytics();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.from, filters.to, filters.type, currentYear]);

  async function loadAnalytics() {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setLoading(true);
    try {
      const datasource = getLedgerDataSource();
      
      // Load summary, monthly, and party data in parallel
      const [summaryResult, monthlyResult, partyResult] = await Promise.all([
        datasource.getSummary(filters, signal),
        datasource.getMonthlySummary(currentYear, filters.type, signal),
        datasource.getPartySummary(5, filters, signal),
      ]);

      if (!signal.aborted) {
        setSummary(summaryResult);
        setMonthlyData(monthlyResult);
        setPartyData(partyResult);
      }
    } catch (error: unknown) {
      if (signal.aborted) return;
      console.error('Failed to load analytics:', error);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }

  const netProfit = summary.net_profit;
  const netGST = summary.net_gst;
  const [showFilters, setShowFilters] = useState(false);

  // Calculate key metrics for Indian SMEs
  const totalRevenue = summary.total_sales + summary.total_receipts;
  const totalOutgoings = summary.total_purchases + summary.total_expenses;

  return (
    <div className="space-y-6">
      {/* Simple Header - Traditional Ledger Style */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Ledger Summary</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your business at a glance
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const event = new CustomEvent('digbahi:navigate', { detail: { tab: 'ledger' } });
              window.dispatchEvent(event);
            }}
            className="touch-friendly"
          >
            <BookOpen className="w-4 h-4 mr-2" />
            View Ledger
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="touch-friendly"
          >
            <Filter className="w-4 h-4 mr-2" />
            {showFilters ? 'Hide' : 'Filter'}
          </Button>
        </div>
      </div>

      {/* Collapsible Filters - Simple */}
      {showFilters && (
        <Card className="p-4 bg-card border">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label htmlFor="from" className="text-xs">From Date</Label>
              <Input
                id="from"
                type="date"
                value={filters.from || ''}
                onChange={(e) => setFilters({ ...filters, from: e.target.value || undefined })}
                className="touch-friendly h-10"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to" className="text-xs">To Date</Label>
              <Input
                id="to"
                type="date"
                value={filters.to || ''}
                onChange={(e) => setFilters({ ...filters, to: e.target.value || undefined })}
                className="touch-friendly h-10"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="type" className="text-xs">Transaction Type</Label>
              <Select
                value={filters.type || 'all'}
                onValueChange={(value) => setFilters({ ...filters, type: value === 'all' ? undefined : value })}
              >
                <SelectTrigger className="touch-friendly h-10">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="sale">Sale</SelectItem>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="receipt">Receipt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="year" className="text-xs">Year</Label>
              <Input
                id="year"
                type="number"
                value={currentYear}
                onChange={(e) => setCurrentYear(parseInt(e.target.value) || new Date().getFullYear())}
                min={2000}
                max={2100}
                className="touch-friendly h-10"
              />
            </div>
          </div>
        </Card>
      )}

      {/* Key Metrics - Tally-inspired color scheme */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Profit - Tally Sky Blue */}
        <Card className="p-4 md:p-5 bg-white border-2 border-primary/30 hover:border-primary shadow-medium">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-primary uppercase">Net Profit</p>
            {netProfit >= 0 ? (
              <TrendingUp className="w-4 h-4 text-primary" />
            ) : (
              <TrendingDown className="w-4 h-4 text-destructive" />
            )}
          </div>
          <p className={`text-2xl md:text-3xl font-bold ${netProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
            {formatCurrency(Math.abs(netProfit))}
          </p>
          {netProfit < 0 && <p className="text-xs text-destructive mt-1">Loss</p>}
        </Card>

        {/* Total Revenue - Tally Sky Blue */}
        <Card className="p-4 md:p-5 bg-white border-2 border-primary/30 hover:border-primary shadow-medium">
          <p className="text-xs font-medium text-primary uppercase mb-2">Total Revenue</p>
          <p className="text-2xl md:text-3xl font-bold text-primary">
            {formatCurrency(totalRevenue)}
          </p>
        </Card>

        {/* GST Liability - Tally Yellow (selection color) */}
        <Card className="p-4 md:p-5 bg-white border-2 border-secondary/30 hover:border-secondary shadow-medium">
          <p className="text-xs font-medium text-secondary uppercase mb-2">GST Liability</p>
          <p className="text-2xl md:text-3xl font-bold text-secondary">
            {formatCurrency(netGST)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">For filing</p>
        </Card>

        {/* Cash Flow - Tally Sky Blue */}
        <Card className="p-4 md:p-5 bg-white border-2 border-primary/30 hover:border-primary shadow-medium">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-primary uppercase">Cash Flow</p>
            {summary.cash_flow >= 0 ? (
              <TrendingUp className="w-4 h-4 text-primary" />
            ) : (
              <TrendingDown className="w-4 h-4 text-destructive" />
            )}
          </div>
          <p className={`text-2xl md:text-3xl font-bold ${summary.cash_flow >= 0 ? 'text-primary' : 'text-destructive'}`}>
            {formatCurrency(Math.abs(summary.cash_flow))}
          </p>
        </Card>
      </div>

      {/* Simple Breakdown - Tally-style ledger */}
      <Card className="p-6 bg-white border shadow-medium">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-primary">
          <Wallet className="w-5 h-5" />
          Financial Summary
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Total Sales</span>
              <span className="font-semibold text-primary">{formatCurrency(summary.total_sales)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Receipts</span>
              <span className="font-semibold text-primary">{formatCurrency(summary.total_receipts)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b-2 border-primary">
              <span className="font-medium text-foreground">Total Income</span>
              <span className="font-bold text-lg text-primary">{formatCurrency(totalRevenue)}</span>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Purchases</span>
              <span className="font-semibold text-destructive">{formatCurrency(summary.total_purchases)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Expenses</span>
              <span className="font-semibold text-destructive">{formatCurrency(summary.total_expenses)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b-2 border-destructive">
              <span className="font-medium text-foreground">Total Outgoings</span>
              <span className="font-bold text-lg text-destructive">{formatCurrency(totalOutgoings)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Monthly Chart - Simple View */}
      <Charts monthlyData={monthlyData} partyData={partyData} loading={loading} currentYear={currentYear} />
    </div>
  );
}
