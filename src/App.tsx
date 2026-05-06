import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PINOverlay } from "@/components/auth/PINOverlay";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { ReceiptView } from "@/features/reports/receipt/ReceiptView";
import { DailyReportView } from "@/features/reports/receipt/DailyReportView";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";

// FirstRunWizard is lazy — runs once ever, no bundle impact after setup
const FirstRunWizard = lazy(() =>
  import("@/components/auth/FirstRunWizard").then(m => ({ default: m.FirstRunWizard }))
);
const OCRTestDashboard = lazy(() =>
  import("@/features/pen-input/ocr").then(m => ({ default: m.OCRTestDashboard }))
);

const queryClient = new QueryClient();

const AppContent = () => {
  useGlobalShortcuts();
  const { isAuthenticated, isFirstRun } = useAuth();

  // Still detecting first-run state — render nothing to avoid flash
  if (isFirstRun === null) return null;

  return (
    <>
      {/* First-run wizard: shown before anything else on a fresh device */}
      {isFirstRun && (
        <Suspense fallback={null}>
          <FirstRunWizard />
        </Suspense>
      )}

      {/* PIN overlay: always on top when not authenticated (and not in first-run) */}
      {!isFirstRun && !isAuthenticated && <PINOverlay />}

      {/* Main app: always mounted so dashboard state is preserved through lock/unlock */}
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/print/receipt/:id" element={<ReceiptView />} />
        <Route path="/print/daily-report" element={<DailyReportView />} />
        <Route
          path="/test/ocr"
          element={
            <Suspense fallback={null}>
              <OCRTestDashboard />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ErrorBoundary>
        <HashRouter>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </HashRouter>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
