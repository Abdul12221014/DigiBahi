/**
 * InlinePenInput - Inline handwriting input that overlays directly on form fields
 * 
 * Features:
 * - Context-aware sizing (1.5x height, 1.8-2x width based on field type)
 * - Auto-recognize after 2s pause
 * - Smart auto-close (confidence-based)
 * - Visual feedback (border, shadow, grid)
 * - Real-time recognition preview
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Pen, X, Undo2, Redo2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeNumbers, applyHindiCorrections } from '@/features/pen-input/ocr/postprocess';

// Lazy-load OCR service
const loadOCR = async () => {
  const mod = await import('@/features/pen-input/services/ocrHybrid.service');
  return mod;
};

// OCR Result type
type OCRResult = {
  text: string;
  confidence: number;
  box?: { x: number; y: number; width: number; height: number };
};

export type InlineTargetField = 'description' | 'reference_no' | 'party_name';

interface InlinePenInputProps {
  /** Field being targeted for pen input */
  targetField: InlineTargetField;
  /** Current value of the field */
  value: string;
  /** Callback when text is recognized and accepted */
  onRecognized: (value: string) => void;
  /** Callback to close the inline input */
  onClose: () => void;
  /** Reference to the input element to position overlay */
  inputRef: React.RefObject<HTMLInputElement>;
  /** Whether input is full-width (description) or half-width (reference_no, party_name) */
  isFullWidth?: boolean;
}

export function InlinePenInput({
  targetField,
  value,
  onRecognized,
  onClose,
  inputRef,
  isFullWidth = false,
}: InlinePenInputProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState<{
    text: string;
    confidence: number;
  } | null>(null);
  
  // Drawing state
  const pathsRef = useRef<Array<{ x: number; y: number }[]>>([]);
  const currentPathRef = useRef<{ x: number; y: number }[]>([]);
  const undoStackRef = useRef<Array<{ x: number; y: number }[]>>([]);
  
  // Auto-recognize timer
  const autoTimerRef = useRef<number | null>(null);
  const [autoRecognizePending, setAutoRecognizePending] = useState(false);
  
  // Recognition timeout ref (to prevent hanging)
  const recognitionTimeoutRef = useRef<number | null>(null);
  
  // Input safety & intent
  const inkEnableAtRef = useRef<number>(0);
  const pendingStartRef = useRef<{ x: number; y: number } | null>(null);
  const MOVEMENT_THRESHOLD_PX = 8;
  const EDGE_DEADZONE_PX = 12;
  const stylusOnlyRef = useRef<boolean>(false); // Allow finger/mouse input by default
  
  // Canvas dimensions (context-aware)
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });
  
  // Update position function
  const updatePosition = useCallback(() => {
    if (!inputRef.current || !containerRef.current) return;
    
    const input = inputRef.current;
    const container = containerRef.current;
    const inputRect = input.getBoundingClientRect();
    
    container.style.position = 'fixed';
    container.style.top = `${inputRect.bottom + 4}px`; // 4px gap below input
    container.style.left = `${inputRect.left}px`;
    container.style.zIndex = '1000';
  }, [inputRef]);
  
  // Calculate canvas size based on input field
  useEffect(() => {
    if (!inputRef.current) return;
    
    const input = inputRef.current;
    const rect = input.getBoundingClientRect();
    const inputHeight = rect.height;
    const inputWidth = rect.width;
    
    // Context-aware sizing
    const height = Math.max(60, Math.floor(inputHeight * 1.5)); // 1.5x height, min 60px
    const width = isFullWidth 
      ? Math.floor(inputWidth * 2) // 2x width for full-width fields (description)
      : Math.floor(inputWidth * 1.8); // 1.8x width for half-width fields
    
    setCanvasDimensions({ width, height });
    
    // Set initial position
    updatePosition();
    
    // Update position on scroll/resize
    const handleScroll = () => updatePosition();
    const handleResize = () => updatePosition();
    
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [inputRef, isFullWidth, updatePosition]);
  
  // Draw grid lines - defined early so it can be used in canvas initialization
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const spacing = 20;
    
    // Grid lines
    ctx.strokeStyle = '#e2e8f0'; // slate-200
    ctx.lineWidth = 0.6;
    
    for (let x = 0; x < width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    for (let y = 0; y < height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Baseline at mid-height
    ctx.save();
    ctx.strokeStyle = '#cbd5e1'; // slate-300
    ctx.lineWidth = 0.8;
    const midY = Math.floor(height / 2);
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();
    ctx.restore();
  }, []);
  
  // Warmup OCR service when component opens (for faster recognition)
  useEffect(() => {
    let mounted = true;
    const warmupOCR = async () => {
      try {
        console.log('[OCR Debug] Warming up OCR service...');
        const { getOCRHybridService } = await loadOCR();
        const ocrService = getOCRHybridService();
        await ocrService.warmup();
        if (mounted) {
          console.log('[OCR Debug] OCR service warmed up successfully');
        }
      } catch (error) {
        console.warn('[OCR Debug] Warmup failed (will initialize on first use):', error);
      }
    };
    warmupOCR();
    return () => { mounted = false; };
  }, []);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasDimensions.width === 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasDimensions.width * dpr;
    canvas.height = canvasDimensions.height * dpr;
    ctx.scale(dpr, dpr);
    
    // Disable gestures and enable pointer events
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.webkitUserSelect = 'none';
    
    // Set drawing style
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5; // Slightly thicker for better visibility
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw grid
    drawGrid(ctx, canvasDimensions.width, canvasDimensions.height);
    
    // Reset state
    pathsRef.current = [];
    currentPathRef.current = [];
    undoStackRef.current = [];
    setHasDrawing(false);
    setRecognitionResult(null);
    inkEnableAtRef.current = Date.now() + 100; // Reduced safety delay
    pendingStartRef.current = null;
  }, [canvasDimensions, drawGrid]);
  
  // Redraw all paths
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear and redraw grid
    ctx.clearRect(0, 0, canvasDimensions.width, canvasDimensions.height);
    drawGrid(ctx, canvasDimensions.width, canvasDimensions.height);
    
    // Set drawing style
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw all paths
    pathsRef.current.forEach(path => {
      if (path.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
      }
      ctx.stroke();
    });
    
    // Draw current path
    if (currentPathRef.current.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(currentPathRef.current[0].x, currentPathRef.current[0].y);
      for (let i = 1; i < currentPathRef.current.length; i++) {
        ctx.lineTo(currentPathRef.current[i].x, currentPathRef.current[i].y);
      }
      ctx.stroke();
    }
  }, [canvasDimensions, drawGrid]);
  
  // Auto-recognize scheduler - defined early
  const cancelAutoRecognize = useCallback(() => {
    if (autoTimerRef.current) {
      window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setAutoRecognizePending(false);
  }, []);
  
  const getPathsBoundingBox = useCallback(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    pathsRef.current.forEach(path => {
      path.forEach(point => {
        if (point.x < minX) minX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.x > maxX) maxX = point.x;
        if (point.y > maxY) maxY = point.y;
      });
    });

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return null;
    }

    const padding = 16; // add breathing room so strokes aren't clipped
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(canvasDimensions.width, maxX + padding);
    maxY = Math.min(canvasDimensions.height, maxY + padding);

    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  }, [canvasDimensions]);

  // Extract clean image from canvas (removes grid, enhances strokes)
  // Based on research: 200+ DPI equivalent, binary image, noise reduction, tight crop
  const extractCleanImage = useCallback((sourceCanvas: HTMLCanvasElement): HTMLCanvasElement => {
    const processedCanvas = document.createElement('canvas');
    const ctx = processedCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return sourceCanvas;
    
    // Use tight bounding box of strokes to reduce image size dramatically
    const boundingBox = getPathsBoundingBox();
    let logicalWidth = canvasDimensions.width;
    let logicalHeight = canvasDimensions.height;

    if (boundingBox) {
      logicalWidth = Math.max(32, boundingBox.width);  // ensure minimum size
      logicalHeight = Math.max(32, boundingBox.height);
    }
    
    // Debug: Check if we have paths
    console.log('[OCR Debug] Paths count:', pathsRef.current.length);
    console.log('[OCR Debug] Canvas dimensions (cropped):', logicalWidth, logicalHeight);
    
    if (pathsRef.current.length === 0) {
      console.warn('[OCR Debug] No paths to extract!');
      // Return a minimal canvas to avoid errors
      processedCanvas.width = 100;
      processedCanvas.height = 100;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 100, 100);
      return processedCanvas;
    }
    
    // Create high-resolution canvas (200 DPI equivalent = 2x scaling)
    const scale = 2;
    processedCanvas.width = Math.ceil(logicalWidth * scale);
    processedCanvas.height = Math.ceil(logicalHeight * scale);
    
    // Fill with pure white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, processedCanvas.width, processedCanvas.height);
    
    // Redraw only the strokes (not grid) on clean background
    // Paths are stored in logical coordinates, scale them up
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6 * scale; // Thicker strokes for better OCR visibility
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.imageSmoothingEnabled = false; // Sharp edges (better for OCR)
    
    // Draw all saved paths (scaled to high-res canvas, cropped if bounding box exists)
    let totalPoints = 0;
    pathsRef.current.forEach(path => {
      if (path.length < 2) return;
      totalPoints += path.length;
      ctx.beginPath();
      const startX = boundingBox ? path[0].x - boundingBox.x : path[0].x;
      const startY = boundingBox ? path[0].y - boundingBox.y : path[0].y;

      ctx.moveTo(startX * scale, startY * scale);
      for (let i = 1; i < path.length; i++) {
        const x = boundingBox ? path[i].x - boundingBox.x : path[i].x;
        const y = boundingBox ? path[i].y - boundingBox.y : path[i].y;
        ctx.lineTo(x * scale, y * scale);
      }
      ctx.stroke();
    });
    
    console.log('[OCR Debug] Total points drawn:', totalPoints);
    
    // Get image data for binary thresholding
    const imageData = ctx.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
    const data = imageData.data;
    
    // Adaptive thresholding: compute mean brightness to avoid losing faint strokes
    let blackPixels = 0;
    let totalGray = 0;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      totalGray += gray;
    }
    const averageGray = totalGray / (data.length / 4);
    const adaptiveThreshold = Math.max(120, Math.min(200, averageGray - 20));

    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (gray < adaptiveThreshold) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        blackPixels++;
      } else {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      }
    }
    
      console.log('[OCR Debug] Black pixels after threshold:', blackPixels);
      
      // Safety check: if we have no black pixels, something went wrong
      // Fallback: use the actual canvas directly (with grid, but at least we have strokes)
      if (blackPixels < 10 && pathsRef.current.length > 0) {
        console.warn('[OCR Debug] Very few black pixels detected, using source canvas directly');
        // Create a scaled version of the source canvas
        const fallbackCanvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        const sourceWidth = canvasDimensions.width;
        const sourceHeight = canvasDimensions.height;
        const fallbackScale = 3;
        fallbackCanvas.width = sourceWidth * fallbackScale;
        fallbackCanvas.height = sourceHeight * fallbackScale;
        const fallbackCtx = fallbackCanvas.getContext('2d', { willReadFrequently: true });
        if (fallbackCtx) {
          fallbackCtx.imageSmoothingEnabled = false;
          // Draw the source canvas scaled up
          fallbackCtx.drawImage(sourceCanvas, 0, 0, fallbackCanvas.width, fallbackCanvas.height);
          return fallbackCanvas;
        }
      }
      
      // Put processed image data back
      ctx.putImageData(imageData, 0, 0);
      
      return processedCanvas;
  }, [canvasDimensions, getPathsBoundingBox]);
  
  // Recognize text with single attempt and optimized preprocessing
  const recognizeWithRetry = useCallback(async (
    canvas: HTMLCanvasElement,
    attempt: number = 1,
    maxAttempts: number = 1  // Single attempt for speed (better preprocessing instead)
  ): Promise<OCRResult[]> => {
    const { getOCRHybridService } = await loadOCR();
    const ocrService = getOCRHybridService();
    
    try {
      console.log(`[OCR Debug] Attempt ${attempt}/${maxAttempts}`);
      
      // Extract clean image (removes grid, enhances strokes, scales up)
      const cleanCanvas = extractCleanImage(canvas);
      
      console.log('[OCR Debug] Clean canvas size:', cleanCanvas.width, 'x', cleanCanvas.height);
      
      // Ensure minimum size for OCR (research shows 300+ DPI equivalent works best)
      const minWidth = 300;
      const minHeight = 100;
      let finalCanvas = cleanCanvas;
      
      if (cleanCanvas.width < minWidth || cleanCanvas.height < minHeight) {
        const scaleX = Math.max(1, minWidth / cleanCanvas.width);
        const scaleY = Math.max(1, minHeight / cleanCanvas.height);
        const scale = Math.max(scaleX, scaleY);
        
        console.log('[OCR Debug] Scaling up by:', scale);
        
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = Math.ceil(cleanCanvas.width * scale);
        scaledCanvas.height = Math.ceil(cleanCanvas.height * scale);
        const scaledCtx = scaledCanvas.getContext('2d', { willReadFrequently: true });
        
        if (scaledCtx) {
          scaledCtx.imageSmoothingEnabled = false; // Sharp scaling
          scaledCtx.drawImage(cleanCanvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
          finalCanvas = scaledCanvas;
          console.log('[OCR Debug] Final canvas size:', finalCanvas.width, 'x', finalCanvas.height);
        }
      }
      
      // Try recognition with optimized settings (English only for speed)
      console.log('[OCR Debug] Calling OCR service...');
      const startTime = Date.now();
      const results = await ocrService.recognizeCanvas(finalCanvas, { 
        mode: 'auto',
        language: 'eng' // English only for faster recognition
      });
      const duration = Date.now() - startTime;
      console.log(`[OCR Debug] OCR service returned: ${results.length} results in ${duration}ms`);
      
      // Calculate average confidence
      const avgConfidence = results.length > 0 
        ? results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length 
        : 0;
      
      return results;
    } catch (error) {
      console.error('[OCR Debug] Recognition error:', error);
      throw error;
    }
  }, [extractCleanImage]);
  
  // Recognize text - defined early so it can be used in scheduleAutoRecognize
  const handleRecognize = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.error('[OCR Debug] Canvas ref is null');
      return;
    }
    
    if (!hasDrawing) {
      toast.info('Please write something first');
      return;
    }
    
    // Debug: Check paths before recognition
    console.log('[OCR Debug] Starting recognition, paths:', pathsRef.current.length);
    if (pathsRef.current.length === 0) {
      toast.error('No drawing detected. Please write something first.');
      return;
    }
    
    setIsRecognizing(true);
    cancelAutoRecognize();
    
    // Clear any existing timeout
    if (recognitionTimeoutRef.current) {
      clearTimeout(recognitionTimeoutRef.current);
      recognitionTimeoutRef.current = null;
    }
    
    // Add timeout to prevent infinite hanging (15 seconds max)
    recognitionTimeoutRef.current = window.setTimeout(() => {
      console.error('[OCR Debug] Recognition timeout after 15 seconds');
      setIsRecognizing(false);
      recognitionTimeoutRef.current = null;
      toast.error('Recognition is taking too long. Please try again or write more clearly.');
    }, 15000);
    
    try {
      // Try recognition with retry logic
      const results = await recognizeWithRetry(canvas);
      
      // Clear timeout if recognition completes
      if (recognitionTimeoutRef.current) {
        clearTimeout(recognitionTimeoutRef.current);
        recognitionTimeoutRef.current = null;
      }
      
      console.log('[OCR Debug] Recognition results:', results.length, results);
      
      if (results.length === 0) {
        // Provide helpful guidance
        toast.error('No text detected. Try: Write larger, use block letters, avoid touching edges.', {
          duration: 5000,
        });
        // Clear timeout before early return
        if (recognitionTimeoutRef.current) {
          clearTimeout(recognitionTimeoutRef.current);
          recognitionTimeoutRef.current = null;
        }
        setIsRecognizing(false);
        return;
      }
      
      const fullText = results
        .map(r => r.text)
        .join(' ')
        .trim()
        .replace(/\s+/g, ' '); // Normalize whitespace
      
      if (!fullText || fullText.length === 0) {
        toast.error('Text appears empty. Tips: Write larger numbers/letters, use clear strokes.', {
          duration: 5000,
        });
        // Clear timeout before early return
        if (recognitionTimeoutRef.current) {
          clearTimeout(recognitionTimeoutRef.current);
          recognitionTimeoutRef.current = null;
        }
        setIsRecognizing(false);
        return;
      }
      
      const avgConfidence = results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length;
      
      // Process text based on target field
      // Apply Hindi numeral conversion + OCR correction for all text fields
      const cleanedText = normalizeNumbers(applyHindiCorrections(fullText));
      let processedText = cleanedText;
      if (targetField === 'reference_no') {
        // Keep alphanumeric and - _
        processedText = cleanedText.replace(/[^A-Za-z0-9-_]/g, '').slice(0, 32);
        if (!processedText) {
          toast.warning('Reference appears empty. Please write clearly (letters/numbers only).');
          // Clear timeout before early return
          if (recognitionTimeoutRef.current) {
            clearTimeout(recognitionTimeoutRef.current);
            recognitionTimeoutRef.current = null;
          }
          setIsRecognizing(false);
          return;
        }
      }
      
      setRecognitionResult({
        text: processedText,
        confidence: avgConfidence,
      });
      
      // Debug: Log before calling onRecognized
      console.log('[OCR Debug] About to call onRecognized with text:', processedText);
      console.log('[OCR Debug] Confidence:', avgConfidence);
      console.log('[OCR Debug] Target field:', targetField);
      
      // Always show preview and let user accept (more reliable than auto-fill)
      // This ensures text always fills when user clicks Accept
      console.log('[OCR Debug] Showing preview with confidence:', (avgConfidence * 100).toFixed(0) + '%');
      if (avgConfidence < 0.5) {
        toast.warning(`Low confidence (${(avgConfidence * 100).toFixed(0)}%). Review and click Accept if correct.`);
      } else if (avgConfidence < 0.7) {
        toast.info(`Medium confidence (${(avgConfidence * 100).toFixed(0)}%). Review and click Accept if correct.`);
      } else {
        toast.success(`High confidence (${(avgConfidence * 100).toFixed(0)}%). Click Accept to fill.`);
      }
    } catch (error: unknown) {
      // Clear timeout on error
      if (recognitionTimeoutRef.current) {
        clearTimeout(recognitionTimeoutRef.current);
        recognitionTimeoutRef.current = null;
      }

      console.error('[OCR Debug] OCR Error:', error);

      // Provide helpful, actionable error messages
      const errorMessage = error instanceof Error ? error.message : '';

      if (errorMessage.includes('timeout') || errorMessage.includes('OCR request timeout')) {
        toast.error('Recognition timed out. Try: Write larger, use block letters, wait 2 seconds after writing.', {
          duration: 6000,
        });
      } else if (errorMessage.includes('Worker') || errorMessage.includes('initialized')) {
        toast.error('OCR service is loading. Please wait a moment and try again.', {
          duration: 5000,
        });
        // Try to warmup the service
        try {
          const { getOCRHybridService } = await loadOCR();
          const ocrService = getOCRHybridService();
          await ocrService.warmup();
        } catch (warmupError) {
          console.error('[OCR Debug] Warmup failed:', warmupError);
        }
      } else if (errorMessage.includes('No results')) {
        toast.error('No text detected. Tips: Write larger numbers/letters, use clear strokes, avoid grid edges.', {
          duration: 6000,
        });
      } else {
        // Generic error with helpful tips
        toast.error(`Recognition failed: ${errorMessage || 'Unknown error'}. Try: Write larger, use block letters.`, {
          duration: 6000,
        });
      }
    } finally {
      // Always clear timeout and reset recognizing state
      if (recognitionTimeoutRef.current) {
        clearTimeout(recognitionTimeoutRef.current);
        recognitionTimeoutRef.current = null;
      }
      setIsRecognizing(false);
      console.log('[OCR Debug] Recognition process completed, isRecognizing set to false');
    }
  }, [hasDrawing, targetField, cancelAutoRecognize, recognizeWithRetry]);
  
  const scheduleAutoRecognize = useCallback(() => {
    if (!hasDrawing || isRecognizing) return;
    cancelAutoRecognize();
    setAutoRecognizePending(true);
    autoTimerRef.current = window.setTimeout(() => {
      autoTimerRef.current = null;
      setAutoRecognizePending(false);
      if (!isRecognizing && hasDrawing) {
        handleRecognize();
      }
    }, 2000); // 2 second pause
  }, [hasDrawing, isRecognizing, handleRecognize, cancelAutoRecognize]);
  
  // Pointer event handlers
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    cancelAutoRecognize();
    
    // Allow finger/mouse input (stylusOnlyRef is false by default)
    if (stylusOnlyRef.current && e.pointerType !== 'pen') {
      return;
    }
    
    // Reduced safety delay check
    if (Date.now() < inkEnableAtRef.current) {
      return;
    }
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Reduced edge dead zones for better usability
    const deadZone = 8; // Reduced from 12
    if (x < deadZone || y < deadZone || 
        x > rect.width - deadZone || y > rect.height - deadZone) {
      return;
    }
    
    // Require pressure for stylus only (not for finger/mouse)
    if (e.pointerType === 'pen' && typeof e.pressure === 'number' && e.pressure <= 0) {
      return;
    }
    
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignore capture errors
    }
    
    setIsDrawing(true);
    pendingStartRef.current = { x, y };
    currentPathRef.current = [];
  }, [cancelAutoRecognize]);
  
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    e.stopPropagation();
    cancelAutoRecognize();
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Reduced movement threshold for better responsiveness
    if (pendingStartRef.current && currentPathRef.current.length === 0) {
      const dx = x - pendingStartRef.current.x;
      const dy = y - pendingStartRef.current.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 3) { // Reduced from 8px for better sensitivity
        return;
      }
      currentPathRef.current.push(pendingStartRef.current);
      pendingStartRef.current = null;
    }
    
    currentPathRef.current.push({ x, y });
    redraw();
  }, [isDrawing, redraw, cancelAutoRecognize]);
  
  const handlePointerUp = useCallback((e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (currentPathRef.current.length > 0) {
      pathsRef.current.push([...currentPathRef.current]);
      setHasDrawing(true);
      undoStackRef.current = [];
    }
    
    currentPathRef.current = [];
    pendingStartRef.current = null;
    setIsDrawing(false);
    
    // Release pointer capture
    const canvas = canvasRef.current;
    if (canvas && e) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore release errors
      }
    }
    
    scheduleAutoRecognize();
  }, [isDrawing, scheduleAutoRecognize]);
  
  // Undo/Redo
  const handleUndo = useCallback(() => {
    if (pathsRef.current.length === 0) return;
    const lastPath = pathsRef.current.pop();
    if (lastPath) {
      undoStackRef.current.push(lastPath);
      setHasDrawing(pathsRef.current.length > 0);
      redraw();
    }
  }, [redraw]);
  
  const handleRedo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const lastUndone = undoStackRef.current.pop();
    if (lastUndone) {
      pathsRef.current.push(lastUndone);
      setHasDrawing(true);
      redraw();
    }
  }, [redraw]);
  
  // Clear canvas
  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvasDimensions.width, canvasDimensions.height);
    drawGrid(ctx, canvasDimensions.width, canvasDimensions.height);
    
    pathsRef.current = [];
    currentPathRef.current = [];
    undoStackRef.current = [];
    setHasDrawing(false);
    setRecognitionResult(null);
    cancelAutoRecognize();
  }, [canvasDimensions, drawGrid, cancelAutoRecognize]);
  
  
  // Accept recognized text - CRITICAL FIX: Ensure it always works
  const handleAccept = useCallback(() => {
    if (!recognitionResult) {
      console.error('[OCR Debug] Accept clicked but no recognition result!');
      toast.error('No text to accept. Please recognize first.');
      return;
    }
    
    const textToFill = recognitionResult.text;
    console.log('[OCR Debug] Accept button clicked');
    console.log('[OCR Debug] Text to fill:', textToFill);
    console.log('[OCR Debug] Target field:', targetField);
    
    // Force callback execution with error handling
    try {
      console.log('[OCR Debug] Calling onRecognized callback...');
      onRecognized(textToFill);
      console.log('[OCR Debug] onRecognized callback executed successfully');
      
      // Small delay to ensure state update propagates
      setTimeout(() => {
        console.log('[OCR Debug] Closing inline pen input');
        onClose();
      }, 50);
      
      toast.success(`Text "${textToFill}" filled successfully!`);
    } catch (error) {
      console.error('[OCR Debug] Error in onRecognized callback:', error);
      toast.error('Failed to fill text. Please try again.');
    }
  }, [recognitionResult, onRecognized, onClose, targetField]);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      cancelAutoRecognize();
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
      if (e.key === 'Enter' && hasDrawing && !isRecognizing) {
        e.preventDefault();
        handleRecognize();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cancelAutoRecognize();
    };
  }, [hasDrawing, isRecognizing, handleUndo, handleRedo, handleRecognize, onClose, cancelAutoRecognize, targetField]);
  
  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // Don't close if clicking on the input field itself
        if (inputRef.current && inputRef.current.contains(e.target as Node)) {
          return;
        }
        if (!isRecognizing && !recognitionResult) {
          onClose();
        }
      }
    };
    
    // Small delay to prevent immediate close when opening
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isRecognizing, recognitionResult, onClose, inputRef]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAutoRecognize();
    };
  }, [cancelAutoRecognize]);
  
  if (canvasDimensions.width === 0) return null;
  
  return (
    <div
      ref={containerRef}
      className="bg-background border-2 border-primary shadow-lg rounded-md p-3 animate-in fade-in slide-in-from-top-2"
      style={{ width: `${canvasDimensions.width}px` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Pen className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">
            {targetField === 'description' ? 'Description' : 
             targetField === 'reference_no' ? 'Reference No.' : 
             'Party Name'}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-6 w-6 p-0"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      
      {/* Canvas */}
      <div className="relative border border-dashed border-primary/20 rounded-md bg-gradient-to-br from-white to-gray-50/30 overflow-hidden mb-2">
        <canvas
          ref={canvasRef}
          className="w-full touch-none cursor-crosshair bg-transparent"
          style={{ 
            height: `${canvasDimensions.height}px`,
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        {!hasDrawing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <Pen className="w-5 h-5 text-muted-foreground/30 mb-1" />
            <p className="text-xs text-muted-foreground/60">
              Write here with your pen or finger
            </p>
          </div>
        )}
      </div>
      
      {/* Recognition Preview */}
      {recognitionResult && (
        <div className={`mb-2 p-2 rounded-md border text-xs ${
          recognitionResult.confidence > 0.8
            ? 'bg-emerald-50/70 border-emerald-200'
            : recognitionResult.confidence > 0.5
            ? 'bg-amber-50/70 border-amber-200'
            : 'bg-orange-50/70 border-orange-200'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">Recognized:</span>
            <span className="font-semibold">
              {(recognitionResult.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-sm font-mono break-words">{recognitionResult.text}</p>
        </div>
      )}
      
      {/* Auto-recognize indicator */}
      {!recognitionResult && autoRecognizePending && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
          <div className="w-3 h-3 border-2 border-muted-foreground/60 border-t-transparent rounded-full animate-spin" />
          <span>Recognizing in 2s…</span>
        </div>
      )}
      
      {/* Actions */}
      <div className="flex gap-2 items-center">
        <Button
          variant="outline"
          size="sm"
          onClick={handleUndo}
          disabled={!hasDrawing || isRecognizing || pathsRef.current.length === 0}
          className="h-8 w-8 p-0"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRedo}
          disabled={!hasDrawing || isRecognizing || undoStackRef.current.length === 0}
          className="h-8 w-8 p-0"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={!hasDrawing || isRecognizing}
          className="h-8 flex-1 text-xs"
        >
          Clear
        </Button>
        {recognitionResult ? (
          <Button
            onClick={handleAccept}
            className="h-8 flex-1 text-xs gradient-hero"
          >
            <Check className="w-3.5 h-3.5 mr-1" />
            Accept
          </Button>
        ) : (
          <Button
            onClick={handleRecognize}
            disabled={!hasDrawing || isRecognizing}
            className="h-8 flex-1 text-xs gradient-hero"
          >
            {isRecognizing ? (
              <>
                <div className="w-3 h-3 mr-1 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Recognizing...
              </>
            ) : (
              'Recognize'
            )}
          </Button>
        )}
      </div>
      
      {/* Manual Entry Fallback */}
      {!recognitionResult && !isRecognizing && (
        <div className="text-center pt-1">
          <button
            type="button"
            onClick={() => {
              // Close and allow manual typing
              onClose();
              // Focus the input field after a brief delay
              setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
              }, 100);
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Or type manually
          </button>
        </div>
      )}
    </div>
  );
}

