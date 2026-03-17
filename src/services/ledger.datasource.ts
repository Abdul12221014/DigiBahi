/**
 * Ledger Data Source Adapter
 * Switches between API and local Dexie based on feature flag
 * IMPORTANT: Uses db.ledger from src/lib/db.ts (main DigBahiDB instance)
 */

import { db, LedgerEntry } from '@/lib/db';
import * as ledgerApi from './ledger.api';
import { toast } from 'sonner';
import { computeTotals, computeGSTTotals } from '@/lib/ledger.metrics';

const ENABLE_LEDGER_API = import.meta.env.VITE_ENABLE_LEDGER_API === 'true';

export interface LedgerListResult {
  items: LedgerEntry[];
  total?: number;
  hasNext: boolean;
}

export interface LedgerDataSource {
  list: (params?: ledgerApi.LedgerListParams, signal?: AbortSignal) => Promise<LedgerListResult>;
  create: (entry: Omit<LedgerEntry, 'id' | 'created_at' | 'updated_at' | 'is_active'>, options?: { idempotencyKey?: string }, signal?: AbortSignal) => Promise<LedgerEntry>;
  update: (id: number, patch: Partial<LedgerEntry>, signal?: AbortSignal) => Promise<LedgerEntry>;
  remove: (id: number, signal?: AbortSignal) => Promise<void>;
  // Analytics methods (Phase D)
  getSummary: (params?: ledgerApi.AnalyticsParams, signal?: AbortSignal) => Promise<ledgerApi.AnalyticsSummary>;
  getMonthlySummary: (year: number, type?: string, signal?: AbortSignal) => Promise<ledgerApi.MonthlySummary[]>;
  getPartySummary: (limit?: number, params?: { from?: string; to?: string }, signal?: AbortSignal) => Promise<ledgerApi.PartySummary[]>;
}

// Local Dexie implementation
const localDataSource: LedgerDataSource = {
  async list(params = {}) {
    let query = db.ledger.orderBy('date').reverse();
    
    if (params.type) {
      query = query.filter(entry => entry.type === params.type);
    }
    
    const all = await query.toArray();
    
    // Client-side search
    let filtered = all;
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filtered = filtered.filter(entry =>
        entry.description.toLowerCase().includes(searchLower) ||
        (entry.party_name && entry.party_name.toLowerCase().includes(searchLower)) ||
        (entry.reference_no && entry.reference_no.toLowerCase().includes(searchLower)) ||
        (entry.tags && entry.tags.toLowerCase().includes(searchLower))
      );
    }
    
    // Date range filter
    if (params.from && params.to) {
      filtered = filtered.filter(entry => entry.date >= params.from! && entry.date <= params.to!);
    }
    
    // Tags filter
    if (params.tags) {
      const tagList = params.tags.split(',').map(t => t.trim()).filter(Boolean);
      filtered = filtered.filter(entry => {
        if (!entry.tags) return false;
        return tagList.some(tag => entry.tags!.toLowerCase().includes(tag.toLowerCase()));
      });
    }
    
    // Pagination
    const skip = params.skip || 0;
    const limit = params.limit || 50;
    const total = filtered.length;
    const paginated = filtered.slice(skip, skip + limit + 1); // +1 for hasNext detection
    const hasNext = paginated.length === limit + 1;
    const items = hasNext ? paginated.slice(0, -1) : paginated;
    
    return {
      items,
      total,
      hasNext,
    };
  },
  
  async create(entry) {
    const newEntry: LedgerEntry = {
      ...entry,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: true,
    };
    const id = await db.ledger.add(newEntry);
    return { ...newEntry, id } as LedgerEntry;
  },
  
  async update(id, patch) {
    await db.ledger.update(id, {
      ...patch,
      updated_at: new Date().toISOString(),
    });
    return await db.ledger.get(id) as LedgerEntry;
  },
  
  async remove(id) {
    // Soft delete in local DB
    await db.ledger.update(id, {
      is_active: false,
      deleted_at: new Date().toISOString(),
    });
  },
  
  // Analytics methods (Phase D) - Using shared metrics helper
  async getSummary(params = {}) {
    let entries = await db.ledger.toArray();
    
    // Filter active entries only
    entries = entries.filter(e => e.is_active !== false);
    
    // Apply filters
    if (params.type) {
      entries = entries.filter(e => e.type === params.type);
    }
    // Date filter: inclusive range (matches backend behavior)
    // date >= from AND date <= to (both inclusive)
    if (params.from && params.to) {
      entries = entries.filter(e => e.date >= params.from! && e.date <= params.to!);
    }
    
    // Use shared metrics helper to ensure consistency with backend
    const totals = computeTotals(entries);
    const gstTotals = computeGSTTotals(entries);
    
    return {
      total_sales: totals.totalSales,
      total_purchases: totals.totalPurchases,
      total_expenses: totals.totalExpenses,
      total_receipts: totals.totalReceipts,
      net_profit: totals.netProfit,
      cash_flow: totals.cashFlow,
      gst_collected: gstTotals.gstCollected,
      gst_paid: gstTotals.gstPaid,
      net_gst: gstTotals.netGST,
    };
  },
  
  async getMonthlySummary(year, type) {
    let entries = await db.ledger.toArray();
    
    // Filter active entries and by year
    entries = entries.filter(e => {
      if (e.is_active === false) return false;
      if (!e.date) return false;
      const entryYear = parseInt(e.date.split('-')[0]);
      if (entryYear !== year) return false;
      if (type && e.type !== type) return false;
      return true;
    });
    
    // Group by month
    const monthlyData: { [key: number]: { month: number; sales: number; expenses: number; receipts: number; purchases: number } } = {};
    for (let i = 1; i <= 12; i++) {
      monthlyData[i] = { month: i, sales: 0, expenses: 0, receipts: 0, purchases: 0 };
    }
    
    entries.forEach(entry => {
      try {
        const month = parseInt(entry.date.split('-')[1]);
        if (month >= 1 && month <= 12) {
          const amount = entry.amount + (entry.gstAmount || 0);
          if (entry.type === 'sale') monthlyData[month].sales += amount;
          else if (entry.type === 'expense') monthlyData[month].expenses += amount;
          else if (entry.type === 'receipt') monthlyData[month].receipts += amount;
          else if (entry.type === 'purchase') monthlyData[month].purchases += amount;
        }
      } catch (e) {
        // Skip invalid dates
      }
    });
    
    return Object.values(monthlyData).map(data => ({
      month: data.month,
      sales: Math.round(data.sales * 100) / 100,
      expenses: Math.round(data.expenses * 100) / 100,
      receipts: Math.round(data.receipts * 100) / 100,
      purchases: Math.round(data.purchases * 100) / 100,
    }));
  },
  
  async getPartySummary(limit = 5, params = {}) {
    let entries = await db.ledger.toArray();
    
    // Filter active entries with party_name
    entries = entries.filter(e => {
      if (e.is_active === false) return false;
      return e.party_name && e.party_name.trim();
    });
    
    // Filter by date range if provided
    if (params.from && params.to) {
      entries = entries.filter(e => e.date >= params.from! && e.date <= params.to!);
    }
    
    // Group by party_name
    const partyData: { [key: string]: { party_name: string; total_sales: number; total_receipts: number; total_purchases: number; transaction_count: number; net_balance: number } } = {};
    
    entries.forEach(entry => {
      const partyName = entry.party_name!.trim();
      if (!partyData[partyName]) {
        partyData[partyName] = {
          party_name: partyName,
          total_sales: 0,
          total_receipts: 0,
          total_purchases: 0,
          transaction_count: 0,
          net_balance: 0,
        };
      }
      
      const amount = entry.amount + (entry.gstAmount || 0);
      partyData[partyName].transaction_count += 1;
      
      if (entry.type === 'sale') {
        partyData[partyName].total_sales += amount;
        partyData[partyName].net_balance += amount;
      } else if (entry.type === 'receipt') {
        partyData[partyName].total_receipts += amount;
        partyData[partyName].net_balance -= amount;
      } else if (entry.type === 'purchase') {
        partyData[partyName].total_purchases += amount;
        partyData[partyName].net_balance -= amount;
      }
    });
    
    // Sort by transaction count and return top N
    return Object.values(partyData)
      .sort((a, b) => b.transaction_count - a.transaction_count)
      .slice(0, limit)
      .map(party => ({
        party_name: party.party_name,
        total_sales: Math.round(party.total_sales * 100) / 100,
        total_receipts: Math.round(party.total_receipts * 100) / 100,
        total_purchases: Math.round(party.total_purchases * 100) / 100,
        transaction_count: party.transaction_count,
        net_balance: Math.round(party.net_balance * 100) / 100,
      }));
  },
};

// API implementation with fallback
const apiDataSource: LedgerDataSource = {
  async list(params, signal) {
    try {
      // Request total count for better pagination
      const response = await ledgerApi.fetchLedger({ ...params, include_total: true }, signal);
      
      // Handle both array (backward compat) and object responses
      if (Array.isArray(response)) {
        const limit = params.limit || 50;
        const hasNext = response.length === limit + 1;
        const items = hasNext ? response.slice(0, -1) : response;
        return { items, hasNext };
      }
      
      return response as LedgerListResult;
    } catch (error: any) {
      console.error('API list failed, falling back to Dexie:', error);
      toast.warning('Server unreachable. Switched to local-only mode.');
      return localDataSource.list(params, signal);
    }
  },
  
  async create(entry, options, signal) {
    try {
      return await ledgerApi.createLedger(entry, options, signal);
    } catch (error: any) {
      console.error('API create failed, falling back to Dexie:', error);
      toast.warning('Server unreachable. Switched to local-only mode.');
      return localDataSource.create(entry);
    }
  },
  
  async update(id, patch, signal) {
    try {
      return await ledgerApi.updateLedger(id, patch, signal);
    } catch (error: any) {
      console.error('API update failed, falling back to Dexie:', error);
      toast.warning('Server unreachable. Switched to local-only mode.');
      return localDataSource.update(id, patch, signal);
    }
  },
  
  async remove(id, signal) {
    try {
      await ledgerApi.softDeleteLedger(id, signal);
    } catch (error: any) {
      console.error('API delete failed, falling back to Dexie:', error);
      toast.warning('Server unreachable. Switched to local-only mode.');
      await localDataSource.remove(id);
    }
  },
  
  // Analytics methods (Phase D) with fallback
  async getSummary(params, signal) {
    try {
      return await ledgerApi.fetchAnalyticsSummary(params, signal);
    } catch (error: unknown) {
      console.error('API summary failed, falling back to Dexie:', error);
      return localDataSource.getSummary(params);
    }
  },
  
  async getMonthlySummary(year, type, signal) {
    try {
      return await ledgerApi.fetchMonthlySummary(year, type, signal);
    } catch (error: unknown) {
      console.error('API monthly summary failed, falling back to Dexie:', error);
      return localDataSource.getMonthlySummary(year, type);
    }
  },
  
  async getPartySummary(limit, params, signal) {
    try {
      return await ledgerApi.fetchPartySummary(limit, params, signal);
    } catch (error: unknown) {
      console.error('API party summary failed, falling back to Dexie:', error);
      return localDataSource.getPartySummary(limit, params);
    }
  },
};

export function getLedgerDataSource(): LedgerDataSource {
  return ENABLE_LEDGER_API ? apiDataSource : localDataSource;
}

