// Re-export all components from organized structure
export { default as ErrorBoundary } from './ErrorBoundary';
export { ConsentModal } from './ConsentModal';

// Layout components
export { Dashboard } from './layout/Dashboard';
export { LedgerTable } from './layout/LedgerTable';

// Form components
export { EntryForm } from './forms/EntryForm';

// Canvas components
export { default as PenCanvas } from '../features/pen-input/PenCanvas';

// Feature components
export { Reports } from '../features/reports/Reports';
export { UPIIntegration } from '../features/payments/UPIIntegration';
export { WhatsAppShare } from '../features/payments/WhatsAppShare';
