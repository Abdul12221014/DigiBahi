/**
 * OCR Hybrid Service
 * 
 * Service layer for hybrid OCR (Tesseract.js + TFLite).
 * Handles worker lifecycle, result merging, and post-processing.
 * 
 * Key Features:
 * - Lazy loads worker on first use
 * - Merges results from multiple OCR engines
 * - Normalizes output for downstream processing
 * - Applies merge rules (prefer TFLite for numbers, Tesseract for text)
 */

import type { OCRResult } from '../ocr/worker/tesseractWorker';
import { isLinuxTablet, getRecommendedOCRMode } from '@/lib/platform';
import { getApiBaseUrl } from '@/lib/api-config';

export type { OCRResult };

interface RecognizeOptions {
  mode?: 'auto' | 'tesseract' | 'tflite' | 'backend';
  language?: string;
  rois?: Array<{ x: number; y: number; width: number; height: number }>;
  boundingBox?: { x: number; y: number; width: number; height: number }; // NEW: For smart cropping
}

interface WorkerResult {
  tesseract: Array<{ text: string; confidence: number; box: { x: number; y: number; width: number; height: number } }>;
  tflite: Array<{ text: string; confidence: number; box: { x: number; y: number; width: number; height: number } }>;
}

interface WorkerResponse {
  type: 'success' | 'error' | 'progress';
  id: string;
  result?: WorkerResult;
  error?: string;
  progress?: number;
}

/**
 * Check if two bounding boxes overlap
 */
function boxesOverlap(
  box1: { x: number; y: number; width: number; height: number },
  box2: { x: number; y: number; width: number; height: number },
  threshold: number = 0.5
): boolean {
  const x1 = Math.max(box1.x, box2.x);
  const y1 = Math.max(box1.y, box2.y);
  const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
  const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

  if (x2 < x1 || y2 < y1) return false;

  const intersectionArea = (x2 - x1) * (y2 - y1);
  const box1Area = box1.width * box1.height;
  const box2Area = box2.width * box2.height;
  const unionArea = box1Area + box2Area - intersectionArea;

  return intersectionArea / unionArea > threshold;
}

/**
 * Check if text is numeric or digit-heavy
 */
function isNumeric(text: string): boolean {
  const digits = text.replace(/[^0-9]/g, '');
  return digits.length / text.length > 0.6;
}

/**
 * Check if text contains currency symbols
 */
function isCurrency(text: string): boolean {
  return /[₹$€£¥]/.test(text) || /rs\.?|inr/i.test(text);
}

/**
 * Normalize currency text
 */
function normalizeCurrency(text: string): string {
  // Convert various currency formats to canonical ₹
  return text
    .replace(/rs\.?|inr/gi, '₹')
    .replace(/[$€£¥]/g, '₹')
    .trim();
}

/**
 * Normalize number text
 */
function normalizeNumber(text: string): string {
  // Remove non-digit chars except decimal point and comma
  return text.replace(/[^\d.,]/g, '').trim();
}

/**
 * Merge OCR results from multiple engines
 * 
 * Rules:
 * 1. Prefer TFLite for numeric/currency tokens (high confidence)
 * 2. Use Tesseract for text and Devanagari
 * 3. Merge overlapping boxes intelligently
 */
function mergeResults(results: OCRResult[]): OCRResult[] {
  if (results.length === 0) return [];

  const tesseractResults = results.filter(r => r.type === 'tesseract');
  const tfliteResults = results.filter(r => r.type === 'tflite');

  // If only one engine ran, return as-is
  if (tesseractResults.length === 0) return tfliteResults;
  if (tfliteResults.length === 0) return tesseractResults;

  const merged: OCRResult[] = [];
  const usedTesseract = new Set<string>();
  const usedTFLite = new Set<string>();

  // First pass: find overlaps and apply merge rules
  for (const tfResult of tfliteResults) {
    let bestMatch: OCRResult | null = null;
    let bestOverlap = 0;

    // Find overlapping Tesseract result
    for (const tesResult of tesseractResults) {
      if (usedTesseract.has(tesResult.id)) continue;

      if (boxesOverlap(tfResult.box, tesResult.box, 0.3)) {
        const overlapScore = 0.5; // Could calculate actual IoU
        if (overlapScore > bestOverlap) {
          bestOverlap = overlapScore;
          bestMatch = tesResult;
        }
      }
    }

    if (bestMatch) {
      // Overlap found - apply merge rules
      const tesseractText = bestMatch.text;
      const tfliteText = tfResult.text;

      // Rule 1: Prefer TFLite for numeric tokens
      if (
        (isNumeric(tfliteText) || isCurrency(tfliteText)) &&
        tfResult.confidence > 0.6
      ) {
        // Use TFLite result
        merged.push({
          ...tfResult,
          text: isCurrency(tfliteText)
            ? normalizeCurrency(tfliteText)
            : normalizeNumber(tfliteText),
          type: 'merged'
        });
        usedTFLite.add(tfResult.id);
        usedTesseract.add(bestMatch.id);
      } else {
        // Use Tesseract result (better for text)
        merged.push({
          ...bestMatch,
          type: 'merged'
        });
        usedTesseract.add(bestMatch.id);
        usedTFLite.add(tfResult.id);
      }
    } else {
      // No overlap - keep TFLite result if it's numeric/currency
      if (
        (isNumeric(tfResult.text) || isCurrency(tfResult.text)) &&
        tfResult.confidence > 0.5
      ) {
        merged.push({
          ...tfResult,
          text: isCurrency(tfResult.text)
            ? normalizeCurrency(tfResult.text)
            : normalizeNumber(tfResult.text)
        });
        usedTFLite.add(tfResult.id);
      }
    }
  }

  // Second pass: add remaining Tesseract results (text/Devanagari)
  for (const tesResult of tesseractResults) {
    if (!usedTesseract.has(tesResult.id)) {
      merged.push(tesResult);
    }
  }

  // Sort by position (top to bottom, left to right)
  merged.sort((a, b) => {
    const rowDiff = a.box.y - b.box.y;
    if (Math.abs(rowDiff) > 20) return rowDiff;
    return a.box.x - b.box.x;
  });

  return merged;
}

/**
 * OCR Hybrid Service
 */
export default class OCRHybridService {
  private worker: Worker | null = null;
  private messageId = 0;
  private pendingRequests = new Map<string, {
    resolve: (value: WorkerResult | undefined) => void;
    reject: (error: Error) => void;
  }>();

  private remoteEndpoint = import.meta.env?.VITE_REMOTE_OCR_URL || import.meta.env?.VITE_OCR_SERVICE_URL as string | undefined;

  /**
   * Lazy load worker
   */
  private async ensureWorker(): Promise<Worker> {
    if (this.worker) return this.worker;

    // Create worker from worker file
    this.worker = new Worker(
      new URL('../ocr/worker/tesseractWorker.ts', import.meta.url),
      { type: 'module' }
    );

    // Set up message handler
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { type, id, result, error, progress } = event.data;

      if (type === 'progress' && progress !== undefined) {
        // Emit progress event (could hook into UI loading indicator)
        this.onProgress?.(progress);
        return;
      }

      const pending = this.pendingRequests.get(id);
      if (!pending) return;

      this.pendingRequests.delete(id);

      if (type === 'success') {
        pending.resolve(result);
      } else if (type === 'error') {
        pending.reject(new Error(error || 'OCR worker error'));
      }
    };

    this.worker.onerror = (error) => {
      console.error('OCR Worker error:', error);
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        pending.reject(new Error('Worker crashed'));
      }
      this.pendingRequests.clear();
      this.worker = null;
    };

    return this.worker;
  }

  /**
   * Send message to worker
   */
  private async sendMessage(type: string, payload?: unknown): Promise<WorkerResult | undefined> {
    const worker = await this.ensureWorker();
    const id = `msg_${++this.messageId}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      worker.postMessage({ type, payload, id });

      // Timeout after 30 seconds — Tesseract on Raspberry Pi can take 20-25s on first run
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('OCR request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Progress callback (optional)
   */
  public onProgress?: (progress: number) => void;

  /**
   * Warmup: preload models in background
   */
  async warmup(): Promise<void> {
    await this.sendMessage('warmup');
  }

  /**
   * Recognize text from canvas.
   * Primary: Google Cloud Vision via backend (only when VITE_OCR_SERVICE_URL is set).
   * Fallback: Tesseract.js web worker (local, offline-capable).
   *
   * We only attempt the backend when VITE_OCR_SERVICE_URL is explicitly configured.
   * Deriving a URL from the hostname (getApiBaseUrl default) always produces a valid
   * URL even when no backend is running, which would cause every OCR call to silently
   * fail through a network timeout before reaching Tesseract.
   */
  async recognizeCanvas(
    canvasEl: HTMLCanvasElement,
    options: RecognizeOptions = {}
  ): Promise<OCRResult[]> {
    const hasExplicitBackend = Boolean(import.meta.env?.VITE_OCR_SERVICE_URL);

    if (hasExplicitBackend) {
      try {
        console.log('[OCRHybridService] Attempting backend OCR (Cloud Vision)');
        return await this.recognizeWithBackend(canvasEl, options);
      } catch (backendError) {
        console.warn('[OCRHybridService] Backend OCR failed, falling back to Tesseract.js worker:', backendError);
      }
    }

    return await this.recognizeWithWorker(canvasEl, options);
  }

  /**
   * Recognize text using the Tesseract.js web worker.
   * Used as local fallback when the backend is unreachable.
   */
  private async recognizeWithWorker(
    canvasEl: HTMLCanvasElement,
    options: RecognizeOptions = {}
  ): Promise<OCRResult[]> {
    try {
      // Convert canvas to blob (avoids ImageData cross-thread cloning issues)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvasEl.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/png');
      });

      const result = await this.sendMessage('recognize', { blob, options });
      if (!result) return [];

      const allResults: OCRResult[] = [
        ...result.tesseract.map(r => ({ ...r, id: `tes_${Date.now()}_${Math.random()}`, type: 'tesseract' as const })),
        ...result.tflite.map(r => ({ ...r, id: `tfl_${Date.now()}_${Math.random()}`, type: 'tflite' as const })),
      ];

      console.log('[OCRHybridService] Tesseract worker result count:', allResults.length);
      return allResults;
    } catch (workerError) {
      console.error('[OCRHybridService] Tesseract worker also failed:', workerError);
      throw new Error('Both backend OCR and local fallback failed. Please try again.');
    }
  }

  /**
   * Recognize text using backend OCR service (Tesseract native)
   * This is the preferred method for Linux tablets (Raspberry Pi)
   * 
   * NEW: Supports smart cropping via options.boundingBox parameter
   */
  private async recognizeWithBackend(
    canvasEl: HTMLCanvasElement,
    options: RecognizeOptions = {}
  ): Promise<OCRResult[]> {
    // Use standard Backend API Base URL now that OCR is merged into the central backend app
    const ocrBase = import.meta.env?.VITE_OCR_SERVICE_URL || getApiBaseUrl();
    
    // Call the new Google Cloud Vision endpoint
    const ocrEndpoint = `${ocrBase}/recognize-cloud`;

    // NEW: Smart cropping - create temporary canvas if bounding box provided
    let targetCanvas = canvasEl;

    if (options.boundingBox) {
      const { x, y, width, height } = options.boundingBox;

      console.log(`[OCRHybridService] Backend OCR with smart cropping: ${width}x${height}px (from ${canvasEl.width}x${canvasEl.height}px)`);

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;

      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(
          canvasEl,
          x, y, width, height,
          0, 0, width, height
        );
        targetCanvas = tempCanvas;

        console.log(`[OCRHybridService] Cropped canvas for backend OCR created successfully`);
      } else {
        console.warn('[OCRHybridService] Failed to create cropped canvas for backend, using full canvas');
      }
    }

    // Convert canvas to base64 with a white background to prevent transparent pixel corruption!
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetCanvas.width;
    finalCanvas.height = targetCanvas.height;
    const finalCtx = finalCanvas.getContext('2d');
    if (finalCtx) {
      finalCtx.fillStyle = '#ffffff';
      finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
      finalCtx.drawImage(targetCanvas, 0, 0);
    }
    const dataUrl = (finalCtx ? finalCanvas : targetCanvas).toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];

    try {
      this.onProgress?.(0.3); // Indicate processing started

      const response = await fetch(ocrEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64 })
      });

      this.onProgress?.(0.7);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Backend OCR error: ${response.status} ${text}`);
      }

      const { text, confidence } = await response.json() as { text: string; confidence: number };

      this.onProgress?.(1.0);

      if (!text || text.trim().length === 0) {
        return [];
      }

      // Convert backend response to OCRResult format
      const result: OCRResult = {
        id: `backend_ocr_${Date.now()}`,
        text: text.trim(),
        confidence: typeof confidence === 'number' ? confidence : 0.8,
        box: { x: 0, y: 0, width: canvasEl.width, height: canvasEl.height },
        type: 'merged'
      };

      console.log('[OCRHybridService] Backend OCR result:', result);
      return [result];
    } catch (error) {
      throw error instanceof Error ? error : new Error('Backend OCR request failed');
    }
  }

  /**
   * Recognize specific region from canvas
   */
  async recognizeCanvasRegion(
    canvasEl: HTMLCanvasElement,
    options: RecognizeOptions & {
      region?: { x: number; y: number; width: number; height: number };
    } = {}
  ): Promise<OCRResult[]> {
    if (options.region) {
      // Use ROI
      return this.recognizeCanvas(canvasEl, {
        ...options,
        rois: [options.region]
      });
    }

    return this.recognizeCanvas(canvasEl, options);
  }

  /**
   * Recognize text using external Remote OCR service
   */
  async recognizeWithRemote(canvasEl: HTMLCanvasElement): Promise<OCRResult[]> {
    if (!this.remoteEndpoint) {
      console.warn('[OCRHybridService] Remote OCR endpoint not configured');
      return [];
    }

    const dataUrl = canvasEl.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];

    try {
      const response = await fetch(this.remoteEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64 })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Remote OCR error: ${response.status} ${text}`);
      }

      const { text, confidence } = await response.json() as { text: string; confidence: number };

      if (!text) {
        return [];
      }

      const fallbackResult: OCRResult = {
        id: `remote_${Date.now()}`,
        text,
        confidence: typeof confidence === 'number' ? confidence : 0.7,
        box: { x: 0, y: 0, width: canvasEl.width, height: canvasEl.height },
        type: 'merged'
      };

      console.log('[OCRHybridService] Remote OCR result:', fallbackResult);
      return [fallbackResult];
    } catch (error) {
      console.error('[OCRHybridService] Remote OCR request failed:', error);
      throw error instanceof Error ? error : new Error('Remote OCR request failed');
    }
  }

  hasRemoteFallback(): boolean {
    return Boolean(this.remoteEndpoint);
  }

  /**
   * Clean up worker
   */
  async destroy(): Promise<void> {
    if (this.worker) {
      await this.sendMessage('destroy');
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
  }
}

// Singleton instance
let instance: OCRHybridService | null = null;

/**
 * Get singleton instance
 */
export function getOCRHybridService(): OCRHybridService {
  if (!instance) {
    instance = new OCRHybridService();
  }
  return instance;
}

