// Re-export all components from organized structure
export { default as ErrorBoundary } from './ErrorBoundary';
export { ConsentModal } from './ConsentModal';

// Layout components
export { default as Dashboard } from './layout/Dashboard';
export { default as LedgerTable } from './layout/LedgerTable';


// Form components
export { default as EntryForm } from './forms/EntryForm';

// Canvas components
export { default as PenCanvas } from '../features/pen-input/PenCanvas';

// Feature components
export { default as Reports } from '../features/reports/Reports';
export { default as UPIIntegration } from '../features/payments/UPIIntegration';
export { default as WhatsAppShare } from '../features/payments/WhatsAppShare';
