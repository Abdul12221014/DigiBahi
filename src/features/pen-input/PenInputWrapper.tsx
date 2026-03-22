/**
 * PenInputWrapper - Wraps PenCanvas with NotebookProvider
 * This component is lazy-loaded to prevent module evaluation on app start
 */

import React, { Suspense, lazy } from 'react';
import type { PenCanvasProps } from './types/pen.types';

// Import directly from files to avoid index.ts circular dependencies
import { NotebookProvider } from './context/NotebookContext';
import NotebookNav from './components/NotebookNav';
const PenCanvas = lazy(() => import('./PenCanvas'));

type PenInputWrapperProps = PenCanvasProps;

export default function PenInputWrapper({ onRecognized, onClose }: PenInputWrapperProps) {
  return (
    <NotebookProvider>
      <div className="space-y-4">
        <NotebookNav />
        <Suspense fallback={<div className="p-4 text-center">Loading canvas...</div>}>
          <PenCanvas
            onRecognized={onRecognized}
            onClose={onClose}
          />
        </Suspense>
      </div>
    </NotebookProvider>
  );
}


