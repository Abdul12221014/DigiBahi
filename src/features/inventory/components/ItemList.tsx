import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { getItems, getSummary } from '../services/inventory-api.service';
import { useMemoryLeakPrevention } from '../utils/memory-leak-prevention';
import { useInventorySync } from '../hooks/useInventorySync';
import type { Item } from '../types/inventory.types';
import { Search, Edit, Package } from 'lucide-react';
import { toast } from 'sonner';

interface ItemListProps {
  onEdit?: (item: Item) => void;
}

export function ItemList({ onEdit }: ItemListProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stocks, setStocks] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage] = useState(50);

  // MEMORY LEAK PREVENTION: Use custom hook
  const { isMounted, safeSetState, getAbortSignal } = useMemoryLeakPrevention('ItemList');

  // REAL-TIME SYNC: Listen for inventory events from other devices
  useInventorySync({
    onItemCreated: (newItem) => {
      // Convert API response format to frontend Item type
      const item: Item = {
        id: newItem.id,
        name: newItem.name,
        nameKey: newItem.name_key,
        sku: newItem.sku,
        hsnCode: newItem.hsn_code,
        gstRate: newItem.gst_rate,
        openingQty: newItem.opening_qty,
        unit: newItem.unit,
        minQty: newItem.min_qty,
        mrp: newItem.mrp,
        salePrice: newItem.sale_price,
        purchasePrice: newItem.purchase_price,
        createdAt: new Date(newItem.created_at).getTime(),
        updatedAt: new Date(newItem.updated_at).getTime()
      };
      
      // Add to items list if not already present and matches current search
      setItems(prev => {
        const exists = prev.find(i => i.id === item.id);
        if (!exists && !searchQuery) {
          return [item, ...prev];
        }
        return prev;
      });
      
      // Reload stocks
      getSummary().then(result => {
        if (!result.error && result.data) {
          const stockMap: Record<number, number> = {};
          result.data.forEach(summary => {
            stockMap[summary.item_id] = summary.stock;
          });
          setStocks(prev => ({ ...prev, ...stockMap }));
        }
      });
    },
    
    onItemUpdated: (updatedItem) => {
      // Update item in list
      const item: Item = {
        id: updatedItem.id,
        name: updatedItem.name,
        nameKey: updatedItem.name_key,
        sku: updatedItem.sku,
        hsnCode: updatedItem.hsn_code,
        gstRate: updatedItem.gst_rate,
        openingQty: updatedItem.opening_qty,
        unit: updatedItem.unit,
        minQty: updatedItem.min_qty,
        mrp: updatedItem.mrp,
        salePrice: updatedItem.sale_price,
        purchasePrice: updatedItem.purchase_price,
        createdAt: new Date(updatedItem.created_at).getTime(),
        updatedAt: new Date(updatedItem.updated_at).getTime()
      };
      
      setItems(prev => prev.map(i => i.id === item.id ? item : i));
      
      // Reload stocks if stock may have changed
      getSummary().then(result => {
        if (!result.error && result.data) {
          const stockMap: Record<number, number> = {};
          result.data.forEach(summary => {
            stockMap[summary.item_id] = summary.stock;
          });
          setStocks(stockMap);
        }
      });
    },
    
    onItemDeleted: (deletedId) => {
      // Remove item from list
      setItems(prev => prev.filter(i => i.id !== deletedId));
    },
    
    onStockChanged: () => {
      // Reload stock values when stock changes
      getSummary().then(result => {
        if (!result.error && result.data) {
          const stockMap: Record<number, number> = {};
          result.data.forEach(summary => {
            stockMap[summary.item_id] = summary.stock;
          });
          setStocks(stockMap);
        }
      });
    }
  });

  const loadItems = useCallback(async (pageNum: number = 0, search: string = '', retries = 3) => {
    try {
      safeSetState(setLoading, true);
      
      // For search, limit to top 5 matches for performance (as per prompt requirement)
      const limit = search.trim() ? 5 : itemsPerPage;
      const skip = pageNum * limit;
      
      // Call backend API
      const result = await getItems(skip, limit, search);
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      if (!result.data) {
        throw new Error('No data received from server');
      }
      
      const apiItems = result.data;
      
      // Convert API response to frontend Item type
      const items: Item[] = apiItems.map(item => ({
        id: item.id,
        name: item.name,
        nameKey: item.name_key,
        sku: item.sku,
        hsnCode: item.hsn_code,
        gstRate: item.gst_rate as Item['gstRate'],
        openingQty: item.opening_qty,
        unit: item.unit,
        minQty: item.min_qty,
        mrp: item.mrp,
        salePrice: item.sale_price,
        purchasePrice: item.purchase_price,
        createdAt: new Date(item.created_at).getTime(),
        updatedAt: new Date(item.updated_at).getTime()
      }));
      
      // SAFE: Only update state if component is still mounted
      safeSetState(setItems, items);
      
      // Calculate stocks from summary
      const summaryResult = await getSummary();
      if (!summaryResult.error && summaryResult.data) {
        const stockMap: Record<number, number> = {};
        summaryResult.data.forEach(summary => {
          stockMap[summary.item_id] = summary.stock;
        });
        safeSetState(setStocks, stockMap);
      }
      
      // Estimate total for pagination
      safeSetState(setTotalItems, items.length);
      
    } catch (error) {
      if (retries > 0) {
        console.warn(`Retrying loadItems... (${retries} retries left)`);
        setTimeout(() => loadItems(pageNum, search, retries - 1), 1000);
        return;
      }
      
      if (error instanceof Error && error.message !== 'Request aborted') {
        console.error('Failed to load items:', error);
        toast.error('Failed to load items. Please check your connection.');
      }
    } finally {
      safeSetState(setLoading, false);
    }
  }, [itemsPerPage, safeSetState]);

  useEffect(() => {
    loadItems(page, searchQuery);
  }, [page, searchQuery, loadItems]);

  if (loading) {
    return (
      <Card className="p-6 shadow-medium gradient-card">
        <div className="text-center py-8 animate-pulse">
          <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading items...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 shadow-medium gradient-card animate-slide-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-gradient-to-br from-[hsl(145_70%_32%)] to-[hsl(145_75%_42%)] shadow-glow">
          <Package className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-xl font-bold bg-gradient-to-r from-[hsl(145_70%_32%)] to-[hsl(40_98%_48%)] bg-clip-text text-transparent">
          Item List
        </h3>
      </div>
      
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, SKU, or HSN code... (shows top 5 matches)"
            className="pl-10 touch-friendly"
          />
        </div>
      </div>
      
      {items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>{searchQuery ? 'No items found' : 'No items added yet'}</p>
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden shadow-soft">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>GST</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className="hover:bg-accent/50 transition-colors">
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">{item.sku || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                    <TableCell>
                      <Badge variant={stocks[item.id!] && stocks[item.id!] <= (item.minQty || 0) ? 'destructive' : 'default'}>
                        {stocks[item.id!] || 0} {item.unit}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.gstRate}%</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEdit?.(item)}
                        className="touch-friendly hover-scale"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {totalItems > itemsPerPage && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {page * itemsPerPage + 1}-{Math.min((page + 1) * itemsPerPage, totalItems)} of {totalItems} items
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="touch-friendly"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.min(Math.ceil(totalItems / itemsPerPage) - 1, page + 1))}
                  disabled={page >= Math.ceil(totalItems / itemsPerPage) - 1}
                  className="touch-friendly"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

