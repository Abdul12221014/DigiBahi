export type GSTRate = 0 | 5 | 12 | 18 | 28;

export interface RawInventoryItem {
  id: number;
  name: string;
  name_key: string;
  sku?: string;
  hsn_code?: string;
  gst_rate: GSTRate;
  opening_qty: number;
  unit: string;
  min_qty?: number;
  mrp?: number;
  sale_price?: number;
  purchase_price?: number;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id?: number;
  name: string;
  nameKey: string; // normalized lowercased/trimmed
  sku?: string;
  hsnCode?: string;
  gstRate: GSTRate;
  openingQty: number;
  unit: string;
  minQty?: number;
  mrp?: number;
  salePrice?: number;
  purchasePrice?: number;
  createdAt: number;
  updatedAt: number;
}

export interface StockTxn {
  id?: number;
  itemId: number;
  date: string; // YYYY-MM-DD
  type: 'open' | 'purchase' | 'sale' | 'adjustment';
  qty: number; // +in / -out (sale is negative)
  refLedgerId?: number; // links to ledger entry if available
}

