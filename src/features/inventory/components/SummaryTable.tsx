import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getSummary, getStockValue } from '../services/inventory-api.service';
import { useMemoryLeakPrevention } from '../utils/memory-leak-prevention';
import { useInventorySync } from '../hooks/useInventorySync';
import type { Item } from '../types/inventory.types';
import { Package, AlertCircle, Calculator } from 'lucide-react';
import { toast } from 'sonner';

type ItemSummary = Item & { currentStock: number };

export function SummaryTable() {
  const [summaries, setSummaries] = useState<ItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage] = useState(20);

  // MEMORY LEAK PREVENTION: Use custom hook
  const { isMounted, safeSetState, getAbortSignal } = useMemoryLeakPrevention('SummaryTable');

  // REAL-TIME SYNC: Listen for inventory events from other devices
  useInventorySync({
    onItemCreated: () => {
      // Reload summary when new item is created
      loadSummaries(page);
    },
    
    onItemUpdated: () => {
      // Reload summary when item is updated
      loadSummaries(page);
    },
    
    onItemDeleted: () => {
      // Reload summary when item is deleted
      loadSummaries(page);
    },
    
    onStockChanged: () => {
      // Reload summary when stock changes
      loadSummaries(page);
    }
  });

  const loadSummaries = useCallback(async (pageNum: number = 0, retries = 3) => {
    try {
      safeSetState(setLoading, true);
      
      // Call backend API
      const result = await getSummary();
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      if (!result.data) {
        throw new Error('No data received from server');
      }
      
      // Convert API response to frontend format
      const apiSummaries = result.data;
      
      // For now, we'll show all summaries (backend doesn't have pagination in summary)
      // In a real implementation, we'd implement client-side pagination or add backend pagination
      const startIndex = pageNum * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const paginatedSummaries = apiSummaries.slice(startIndex, endIndex);
      
      // Convert to ItemSummary format
      const summariesData: ItemSummary[] = paginatedSummaries.map(summary => ({
        id: summary.item_id,
        name: summary.name,
        nameKey: summary.name.toLowerCase().replace(/\s+/g, ' '),
        gstRate: summary.gst_rate as ItemSummary['gstRate'],
        openingQty: summary.stock,
        unit: 'pieces', // Default unit since API doesn't provide it
        createdAt: Date.now(),
        updatedAt: Date.now(),
        currentStock: summary.stock
      }));
      
      // SAFE: Only update state if component is still mounted
      safeSetState(setSummaries, summariesData);
      safeSetState(setTotalItems, apiSummaries.length);
      
    } catch (error) {
      if (retries > 0) {
        console.warn(`Retrying loadSummaries... (${retries} retries left)`);
        setTimeout(() => loadSummaries(pageNum, retries - 1), 1000);
        return;
      }
      
      if (error instanceof Error && error.message !== 'Request aborted') {
        console.error('Failed to load summaries:', error);
        toast.error('Failed to load inventory summary. Please check your connection.');
      }
    } finally {
      safeSetState(setLoading, false);
    }
  }, [itemsPerPage, safeSetState]);

  useEffect(() => {
    loadSummaries(page);
  }, [page, loadSummaries]);

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  if (loading) {
    return (
      <Card className="p-6 shadow-medium gradient-card">
        <div className="text-center py-8 animate-pulse">
          <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading inventory summary...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 shadow-medium gradient-card animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-gradient-to-br from-[hsl(145_70%_32%)] to-[hsl(145_75%_42%)] shadow-glow">
          <Package className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-xl font-bold bg-gradient-to-r from-[hsl(145_70%_32%)] to-[hsl(40_98%_48%)] bg-clip-text text-transparent">
          Inventory Summary
        </h3>
      </div>
      
      {summaries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No items in inventory</p>
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden shadow-soft">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ItemName</TableHead>
                  <TableHead>CurrentStock</TableHead>
                  <TableHead>GST%</TableHead>
                  <TableHead>StockValue</TableHead>
                  <TableHead>LinkedLedgers</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((item) => {
                  const isLowStock = item.minQty !== undefined && item.currentStock <= item.minQty;
                  
                  // Calculate StockValue (using salePrice if available, otherwise purchasePrice)
                  const unitPrice = item.salePrice || item.purchasePrice || 0;
                  const stockValue = item.currentStock * unitPrice;
                  
                  // For now, LinkedLedgers will show placeholder (in real implementation, this would query ledger entries)
                  // Since refLedgerId is in StockTxn, we'll show a placeholder for now
                  const linkedLedgers: number[] = []; // This would be populated by querying StockTxn table
                  
                  return (
                    <TableRow key={item.id} className="hover:bg-accent/50 transition-colors">
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>
                        <Badge variant={isLowStock ? 'destructive' : 'default'}>
                          {item.currentStock.toFixed(2)} {item.unit}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.gstRate}%</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Calculator className="w-3 h-3 text-muted-foreground" />
                          <span className="font-medium">₹{stockValue.toFixed(2)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {linkedLedgers.length > 0 ? (
                          <Badge variant="outline" className="flex items-center gap-1 w-fit">
                            {linkedLedgers.length} ledger{linkedLedgers.length > 1 ? 's' : ''}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">No links</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isLowStock ? (
                          <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                            <AlertCircle className="w-3 h-3" />
                            Low Stock
                          </Badge>
                        ) : (
                          <Badge variant="outline">In Stock</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          
          {/* Total Summary */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-blue-600 font-medium">Total Items</p>
                  <p className="text-2xl font-bold text-blue-800">{totalItems}</p>
                </div>
              </div>
            </Card>
            
            <Card className="p-4 bg-gradient-to-r from-green-50 to-green-100 border-green-200">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500">
                  <Calculator className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-green-600 font-medium">Total Stock Value</p>
                  <p className="text-2xl font-bold text-green-800">
                    ₹{summaries.reduce((total, item) => {
                      const unitPrice = item.salePrice || item.purchasePrice || 0;
                      return total + (item.currentStock * unitPrice);
                    }, 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </Card>
          </div>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {page * itemsPerPage + 1}-{Math.min((page + 1) * itemsPerPage, totalItems)} of {totalItems} items
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-4 py-2 rounded-md border hover:bg-accent disabled:opacity-50 touch-friendly"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-4 py-2 rounded-md border hover:bg-accent disabled:opacity-50 touch-friendly"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

