import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LoginPage } from "@/components/auth/LoginPage";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { ReceiptView } from "@/features/reports/receipt/ReceiptView";
import { DailyReportView } from "@/features/reports/receipt/DailyReportView";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import useSession from "@/hooks/useSession";

const OCRTestDashboard = lazy(() =>
  import("@/features/pen-input/ocr").then(m => ({ default: m.OCRTestDashboard }))
);

const queryClient = new QueryClient();

const AppContent = () => {
  useGlobalShortcuts();
  useSession();
  const { isAuthenticated, isFirstRun } = useAuth();

  // Still detecting first-run state — render nothing to avoid flash
  if (isFirstRun === null) return null;

  return (
    <>
      {/* Auth page: shown when not authenticated.
          LoginPage internally handles both Sign In and Sign Up modes,
          defaulting to Sign Up on a fresh install (isFirstRun=true). */}
      {!isAuthenticated && <LoginPage />}

      {/* Main app: only mounted when authenticated */}
      {isAuthenticated && (
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
      )}
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
