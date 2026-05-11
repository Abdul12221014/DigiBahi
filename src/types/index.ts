// Core application types
export interface User {
  id: string;
  name: string;
  role: 'owner' | 'accountant' | 'employee';
  createdAt: Date;
}

export interface Transaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  gstRate: number;
  gstAmount: number;
  netAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerEntry {
  id: string;
  transaction: Transaction;
  balance: number;
}

export interface DashboardStats {
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  gstCollected: number;
  gstPaid: number;
  netGstLiability: number;
}

// Pen input and canvas types
export interface Stroke {
  id: string;
  points: StrokePoint[];
  tool: DrawingTool;
  color: string;
  width: number;
  opacity: number;
  timestamp: number;
}

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
}

export type DrawingTool = 'pen' | 'eraser' | 'highlighter' | 'lasso' | 'text' | 'shape';
export type GridType = 'none' | 'lined' | 'squared';
export type SelectionMode = 'none' | 'selecting' | 'selected';

// Recognition types
export interface RecognizedData {
  type: 'date' | 'phone' | 'email' | 'amount' | 'text';
  value: string;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ShapeDetection {
  type: 'circle' | 'square' | 'rectangle' | 'arrow';
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// Component prop types
export interface PenCanvasProps {
  onRecognized: (text: string) => void;
  onClose: () => void;
}

export interface DashboardProps {
  stats: DashboardStats;
  recentTransactions: Transaction[];
}

export interface LedgerTableProps {
  transactions: Transaction[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
  refreshTrigger: number;
}

// API types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Configuration types
export interface AppConfig {
  defaultGstRates: number[];
  currency: string;
  language: 'en' | 'hi';
  theme: 'light' | 'dark' | 'system';
}

// Export all types
export * from './canvas';
