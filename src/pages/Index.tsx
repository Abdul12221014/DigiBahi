import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import React from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Dashboard } from '@/components/layout/Dashboard';
import { LedgerTable } from '@/components/layout/LedgerTable';
import { EntryForm } from '@/components/forms/EntryForm';
import { InsightsDashboard } from '@/features/ai-analytics';
import { LearningPanel, useLearningSync } from '@/features/ai-learning';
import ErrorBoundary from '@/components/ErrorBoundary';

// Lazy load entire pen input wrapper to prevent ANY module evaluation on app start
const PenInputWrapper = lazy(() => import('@/features/pen-input/PenInputWrapper'));

// Lazy load PDF-heavy components to reduce main bundle size
// These components contain jsPDF and html2canvas dependencies
const Reports = lazy(() =>
  import('@/features/reports/Reports').then(m => ({ default: m.Reports }))
);
const UPIIntegration = lazy(() =>
  import('@/features/payments/UPIIntegration').then(m => ({ default: m.UPIIntegration }))
);
const WhatsAppShare = lazy(() =>
  import('@/features/payments/WhatsAppShare').then(m => ({ default: m.WhatsAppShare }))
);
const Settings = lazy(() =>
  import('@/features/settings/Settings').then(m => ({ default: m.Settings }))
);

// Feature flags - define BEFORE lazy imports
const ENABLE_AI_FEATURES = false;
const ENABLE_DEV_TOOLS = import.meta.env.DEV;
const ENABLE_UPI = import.meta.env.VITE_ENABLE_UPI !== 'false';
const ENABLE_GST_REPORTS = import.meta.env.VITE_ENABLE_GST_REPORTS === 'true';
const ENABLE_INVENTORY = import.meta.env.VITE_ENABLE_INVENTORY === 'true';

// Lazy load GST Reports component - always available but conditionally rendered
const GSTReports = lazy(() => import('@/features/reports/gst/GSTReports'));

// Lazy load Inventory component - conditionally rendered
const InventoryPage = ENABLE_INVENTORY
  ? lazy(() => import('@/features/inventory/InventoryPage').then(m => ({ default: m.InventoryPage })))
  : null;

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { initializeDB, LedgerEntry } from '@/lib/db';
import { toast } from 'sonner';
import { LayoutDashboard, BookOpen, PenTool, FileText, CreditCard, MessageCircle, Book, Brain, Sparkles, Package, Settings as SettingsIcon } from 'lucide-react';
import { SimpleFormatPicker } from '@/features/ledger-formats';
import { LedgerFormatId } from '@/features/ledger-formats';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';
import Header from '@/components/layout/Header';
import { exportBackup, importBackup } from '@/services/backup.service';
import { flush } from '@/services/sync.service';
import useOnline from '@/hooks/useOnline';

const Index = () => {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | undefined>(undefined);
  const [showPenCanvas, setShowPenCanvas] = useState(false);
  const [refreshLedger, setRefreshLedger] = useState(0);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedFormat, setSelectedFormat] = useState<LedgerFormatId>('traditional-khata');
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const learning = useLearningSync();

  // Keyboard Shortcuts
  useHotkeys('alt+n, f2', (e) => {
    e.preventDefault();
    setEditingEntry(undefined);
    setShowEntryForm(true);
  }, { enableOnFormTags: true });

  useHotkeys('esc', () => {
    if (showEntryForm) {
      setShowEntryForm(false);
      setEditingEntry(undefined);
    }
  }, { enableOnFormTags: true }, [showEntryForm]);

  useEffect(() => {
    initializeDB();

    // Load saved format preference
    const savedFormat = localStorage.getItem('digbahi_format') as LedgerFormatId;
    if (savedFormat) {
      setSelectedFormat(savedFormat);
    }

    // Developer Auto-Login: Ensure a user exists in session storage for local testing
    // This allows saving transactions when running locally without a separate login step
    import('@/lib/auth').then(({ getCurrentUser, setCurrentUser }) => {
      if (!getCurrentUser()) {
        setCurrentUser({
          id: 'dev-admin',
          username: 'admin',
          name: 'Administrator',
          role: 'admin',
          pinHash: '', // Not needed for dev session
          is_active: true
        });
        console.info('🛠️ Developer auto-login active');
      }
    });
  }, []);

  const handleEntrySuccess = () => {
    setShowEntryForm(false);
    setEditingEntry(undefined);
    setRefreshLedger(prev => prev + 1);
    setActiveTab('ledger');
  };

  const handleEditEntry = (entry: LedgerEntry) => {
    setEditingEntry(entry);
    setShowEntryForm(true);
    setActiveTab('ledger');
  };

  const handlePenRecognized = (text: string) => {
    toast.info('Recognized: ' + text);
    setShowEntryForm(true);
  };

  // Wire global Backup/Restore/Sync events
  useEffect(() => {
    const onBackup = async () => {
      try {
        const blob = await exportBackup();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `digbahi-backup-${Date.now()}.digbahi`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        toast.success('Backup created');
      } catch (e) {
        toast.error('Backup failed');
      }
    };
    const onRestore = async () => {
      restoreInputRef.current?.click();
    };
    const onSync = async () => {
      try {
        await flush({ onSyncStart: () => toast.message('Sync started'), onSyncComplete: (n) => toast.success(`Sync complete (${n})`) });
      } catch {
        toast.error('Sync failed');
      }
    };

    document.addEventListener('digbahi:backup', onBackup);
    document.addEventListener('digbahi:restore', onRestore);
    document.addEventListener('digbahi:sync', onSync);
    return () => {
      document.removeEventListener('digbahi:backup', onBackup);
      document.removeEventListener('digbahi:restore', onRestore);
      document.removeEventListener('digbahi:sync', onSync);
    };
  }, []);

  // Handle restore file selection
  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importBackup(file);
      toast.success('Restore complete');
    } catch (err) {
      toast.error('Restore failed');
    } finally {
      e.target.value = '';
    }
  };

  // Auto-sync when coming online
  useEffect(() => {
    if (online) {
      flush({ onSyncComplete: (n) => { if (n > 0) toast.success(`Auto-sync complete (${n})`); } });
    }
  }, [online]);

  return (
    <div className="min-h-screen bg-background">
      <Header onOpenPen={() => setShowPenCanvas(true)} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* hidden file input for restore */}
        <input ref={restoreInputRef} type="file" accept=".digbahi,application/octet-stream" className="hidden" onChange={handleRestoreFile} />
        {showPenCanvas ? (
          <ErrorBoundary fallback={<div className="p-6 border rounded-lg bg-card"><p className="text-destructive">⚠️ Pen input failed to load</p><Button onClick={() => setShowPenCanvas(false)} variant="outline">Back to Dashboard</Button></div>}>
            <Suspense fallback={<div className="p-6 text-center">🕓 Initializing pen input...</div>}>
              <PenInputWrapper
                onRecognized={handlePenRecognized}
                onClose={() => setShowPenCanvas(false)}
              />
            </Suspense>
          </ErrorBoundary>
        ) : showEntryForm ? (
          <EntryForm
            entry={editingEntry}
            onSuccess={handleEntrySuccess}
            onCancel={() => {
              setShowEntryForm(false);
              setEditingEntry(undefined);
            }}
          />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="animate-fade-in">
            {/* Navigation tabs - uniformly centered */}
            <div className="flex justify-center mb-6">
              <TabsList className="inline-flex items-center gap-1 p-1.5 bg-card shadow-medium rounded-lg">
                <TabsTrigger value="dashboard" className="touch-friendly px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-white transition-smooth rounded-md">
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  {t('dashboard')}
                </TabsTrigger>
                <TabsTrigger value="formats" className="touch-friendly px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-white transition-smooth rounded-md">
                  <Book className="w-4 h-4 mr-2" />
                  {t('formats', 'Formats')}
                </TabsTrigger>
                <TabsTrigger value="ledger" className="touch-friendly px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-white transition-smooth rounded-md">
                  <BookOpen className="w-4 h-4 mr-2" />
                  {t('ledger')}
                </TabsTrigger>
                <TabsTrigger value="reports" className="touch-friendly px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-white transition-smooth rounded-md">
                  <FileText className="w-4 h-4 mr-2" />
                  {t('reports')}
                </TabsTrigger>
                {ENABLE_AI_FEATURES && (
                  <>
                    <TabsTrigger value="ai-insights" className="touch-friendly px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-white transition-smooth rounded-md">
                      <Brain className="w-4 h-4 mr-2" />
                      AI Insights
                    </TabsTrigger>
                    <TabsTrigger value="ai-learning" className="touch-friendly px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-white transition-smooth rounded-md">
                      <Sparkles className="w-4 h-4 mr-2" />
                      AI Learning
                    </TabsTrigger>
                  </>
                )}
                {ENABLE_UPI && (
                  <TabsTrigger value="upi" className="touch-friendly px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-white transition-smooth rounded-md">
                    <CreditCard className="w-4 h-4 mr-2" />
                    UPI
                  </TabsTrigger>
                )}
                {ENABLE_GST_REPORTS && (
                  <TabsTrigger value="gst-reports" className="touch-friendly px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-white transition-smooth rounded-md">
                    <FileText className="w-4 h-4 mr-2" />
                    GST Reports
                  </TabsTrigger>
                )}
                {ENABLE_INVENTORY && (
                  <TabsTrigger value="inventory" className="touch-friendly px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-white transition-smooth rounded-md">
                    <Package className="w-4 h-4 mr-2" />
                    Inventory
                  </TabsTrigger>
                )}
                <TabsTrigger value="whatsapp" className="touch-friendly px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-white transition-smooth rounded-md">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  {t('whatsapp', 'WhatsApp')}
                </TabsTrigger>
                <TabsTrigger value="settings" className="touch-friendly px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-white transition-smooth rounded-md">
                  <SettingsIcon className="w-4 h-4 mr-2" />
                  {t('settings', 'Settings')}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="dashboard">
              <Dashboard />
            </TabsContent>

            <TabsContent value="formats">
              <SimpleFormatPicker
                currentFormat={selectedFormat}
                onFormatSelect={(formatId) => {
                  setSelectedFormat(formatId);
                  localStorage.setItem('digbahi_format', formatId);
                }}
              />
            </TabsContent>

            <TabsContent value="ledger">
              <LedgerTable
                onAddEntry={() => {
                  setEditingEntry(undefined);
                  setShowEntryForm(true);
                }}
                onQuickPenEntry={() => {
                  setEditingEntry(undefined);
                  setShowEntryForm(true);
                  // Trigger pen input modal after form opens
                  setTimeout(() => {
                    const event = new CustomEvent('digbahi:open-pen-input');
                    window.dispatchEvent(event);
                  }, 100);
                }}
                onEditEntry={handleEditEntry}
                refresh={refreshLedger}
              />
            </TabsContent>

            <TabsContent value="reports">
              <Suspense fallback={<div className="p-6 text-center animate-pulse">🔄 Loading Reports...</div>}>
                <Reports />
              </Suspense>
            </TabsContent>

            {ENABLE_AI_FEATURES && (
              <>
                <TabsContent value="ai-insights">
                  <InsightsDashboard />
                </TabsContent>

                <TabsContent value="ai-learning">
                  <LearningPanel
                    trainingProgress={learning.trainingProgress}
                    syncStatus={learning.syncStatus}
                    onTrainLocally={learning.trainLocally}
                    onSyncModel={learning.syncModel}
                  />
                </TabsContent>
              </>
            )}

            {ENABLE_UPI && (
              <TabsContent value="upi">
                <Suspense fallback={<div className="p-6 text-center animate-pulse">🔄 Loading UPI Integration...</div>}>
                  <UPIIntegration />
                </Suspense>
              </TabsContent>
            )}

            {ENABLE_GST_REPORTS && (
              <TabsContent value="gst-reports">
                <Suspense fallback={<div className="p-6 text-center animate-pulse">🔄 Loading GST Reports...</div>}>
                  <GSTReports />
                </Suspense>
              </TabsContent>
            )}

            {ENABLE_INVENTORY && InventoryPage && (
              <TabsContent value="inventory">
                <Suspense fallback={<div className="p-6 text-center animate-pulse">🔄 Loading Inventory...</div>}>
                  <InventoryPage />
                </Suspense>
              </TabsContent>
            )}

            <TabsContent value="whatsapp">
              <Suspense fallback={<div className="p-6 text-center animate-pulse">🔄 Loading WhatsApp Share...</div>}>
                <WhatsAppShare />
              </Suspense>
            </TabsContent>

            <TabsContent value="settings">
              <Suspense fallback={<div className="p-6 text-center animate-pulse">🔄 Loading Settings...</div>}>
                <Settings />
              </Suspense>
            </TabsContent>
          </Tabs>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-12 py-8 bg-card shadow-soft">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden">
                <img
                  src="/digbahi-logo.png"
                  alt="DigitalMuneem Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="text-lg font-bold bg-gradient-to-r from-[hsl(145_70%_32%)] to-[hsl(40_98%_48%)] bg-clip-text text-transparent">
                DigitalMuneem
              </span>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium">DigitalMuneem Accounting Solutions © 2025</p>
              <p>Professional accounting software for Indian SMEs</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
