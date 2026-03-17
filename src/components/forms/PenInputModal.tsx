/**
 * PenInputModal - Compact pen input for form fields
 * 
 * Lightweight modal with small canvas for handwriting recognition.
 * Designed for quick entry in forms (ledger entries, etc.)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Pen, RotateCcw, Check, X, Undo2, Redo2 } from 'lucide-react';
import { toast } from 'sonner';
import { parseLedgerText, type ParsedLedgerFields } from './parseLedgerText';

// Lazy-load OCR service
const loadOCR = async () => {
  const mod = await import('@/features/pen-input/services/ocrHybrid.service');
  return mod;
};

type TargetField = 'description' | 'reference_no';

interface PenInputModalProps {
  open: boolean;
  onClose: () => void;
  onRecognized: (fields: ParsedLedgerFields, autoSave?: boolean) => void;
  targetField?: TargetField;
  onRecognizedTargeted?: (field: TargetField, value: string) => void;
}

export function PenInputModal({ open, onClose, onRecognized, targetField, onRecognizedTargeted }: PenInputModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [canvasHeight, setCanvasHeight] = useState<number>(260);
  const autoTimerRef = useRef<number | null>(null);
  const [autoRecognizePending, setAutoRecognizePending] = useState(false);
  // Input safety & intent
  const inkEnableAtRef = useRef<number>(0);
  const pendingStartRef = useRef<{ x: number; y: number } | null>(null);
  const MOVEMENT_THRESHOLD_PX = 8;
  const EDGE_DEADZONE_PX = 12;
  const stylusOnlyRef = useRef<boolean>(true);
  const pathsRef = useRef<Array<{ x: number; y: number }[]>>([]);
  const currentPathRef = useRef<{ x: number; y: number }[]>([]);
  const undoStackRef = useRef<Array<{ x: number; y: number }[]>>([]);
  const [recognitionResult, setRecognitionResult] = useState<{
    confidence: number;
    parsedFields: ParsedLedgerFields;
  } | null>(null);
  const [continuousMode, setContinuousMode] = useState(false);
  const [showFirstTimeTooltip, setShowFirstTimeTooltip] = useState(false);

  // Responsive canvas height (tablet vs desktop)
  useEffect(() => {
    const computeHeight = () => {
      const width = window.innerWidth;
      // Tablets and small laptops: slightly taller for comfortable writing
      if (width < 1024) return 300;
      // Large desktops: compact height to avoid covering content
      if (width >= 1440) return 240;
      return 260;
    };
    const update = () => setCanvasHeight(computeHeight());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Utilities: auto-recognize scheduler
  const cancelAutoRecognize = useCallback(() => {
    if (autoTimerRef.current) {
      window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setAutoRecognizePending(false);
  }, []);

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
    }, 2000);
  }, [hasDrawing, isRecognizing]);

  // Canvas setup
  useEffect(() => {
    if (!open) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    // Disable gestures inside canvas
    (canvas.style as any).touchAction = 'none';
    
    // Set drawing style
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw grid lines
    const drawGrid = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const spacing = 20;
      
      // Slightly stronger grid for better contrast
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

      // Baseline at mid-height to guide writing alignment
      ctx.save();
      ctx.strokeStyle = '#cbd5e1'; // slate-300
      ctx.lineWidth = 0.8;
      const midY = Math.floor(height / 2);
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();
      ctx.restore();
    };
    
    // Clear canvas and draw grid
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    drawGrid();
    pathsRef.current = [];
    currentPathRef.current = [];
    undoStackRef.current = [];
    setHasDrawing(false);
    setRecognitionResult(null);
    setContinuousMode(false);
    setShowFirstTimeTooltip(false);
    // Safety delay before enabling ink
    inkEnableAtRef.current = Date.now() + 250;
    pendingStartRef.current = null;
    
    // Check if first time using pen input
    const hasUsedBefore = localStorage.getItem('digbahi_pen_input_used');
    if (!hasUsedBefore && open) {
      setTimeout(() => setShowFirstTimeTooltip(true), 500);
      localStorage.setItem('digbahi_pen_input_used', 'true');
    }
  }, [open]);

  // Draw all paths
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw grid lines
    const spacing = 20;
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < rect.width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
    for (let y = 0; y < rect.height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }

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
  }, []);

  // Handle pointer events
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    // cancel auto-recognize when user resumes writing
    if (autoTimerRef.current) {
      window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setAutoRecognizePending(false);
    // Stylus-first
    if (stylusOnlyRef.current && e.pointerType !== 'pen') return;
    // Safety delay
    if (Date.now() < inkEnableAtRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Edge dead zones
    if (x < EDGE_DEADZONE_PX || y < EDGE_DEADZONE_PX || x > rect.width - EDGE_DEADZONE_PX || y > rect.height - EDGE_DEADZONE_PX) {
      return;
    }
    // Require pressure if available for stylus
    if (e.pointerType === 'pen' && typeof e.pressure === 'number' && e.pressure <= 0) {
      return;
    }
    try {
      (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    } catch {}

    setIsDrawing(true);
    pendingStartRef.current = { x, y };
    currentPathRef.current = [];
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    if (autoTimerRef.current) {
      window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setAutoRecognizePending(false);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (pendingStartRef.current && currentPathRef.current.length === 0) {
      const dx = x - pendingStartRef.current.x;
      const dy = y - pendingStartRef.current.y;
      if (Math.hypot(dx, dy) < MOVEMENT_THRESHOLD_PX) {
        return;
      }
      currentPathRef.current.push(pendingStartRef.current);
      pendingStartRef.current = null;
    }
    currentPathRef.current.push({ x, y });
    redraw();
  }, [isDrawing, redraw]);

  const handlePointerUp = useCallback(() => {
    if (!isDrawing) return;
    
    // Save current path
    if (currentPathRef.current.length > 0) {
      pathsRef.current.push([...currentPathRef.current]);
      setHasDrawing(true);
      // Clear undo stack when new stroke is added
      undoStackRef.current = [];
    }
    
    currentPathRef.current = [];
    pendingStartRef.current = null;
    setIsDrawing(false);
    // schedule auto-recognize after idle
    scheduleAutoRecognize();
  }, [isDrawing, scheduleAutoRecognize]);
  
  // Undo last stroke
  const handleUndo = useCallback(() => {
    if (pathsRef.current.length === 0) return;
    const lastPath = pathsRef.current.pop();
    if (lastPath) {
      undoStackRef.current.push(lastPath);
      setHasDrawing(pathsRef.current.length > 0);
      redraw();
    }
  }, [redraw]);
  
  // Redo last undone stroke
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

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    // Redraw grid
    const spacing = 20;
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < rect.width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
    for (let y = 0; y < rect.height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }
    
    pathsRef.current = [];
    currentPathRef.current = [];
    undoStackRef.current = [];
    setHasDrawing(false);
    setRecognitionResult(null);
    // cancel pending auto-recognition
    if (autoTimerRef.current) {
      window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setAutoRecognizePending(false);
  }, []);
  
  // Recognize text
  const handleRecognize = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!hasDrawing) {
      toast.info('Please write something first');
      return;
    }

    setIsRecognizing(true);

    try {
      // Lazy-load OCR service
      const { getOCRHybridService } = await loadOCR();
      const ocrService = getOCRHybridService();

      // Recognize canvas
      const results = await ocrService.recognizeCanvas(canvas, { mode: 'auto' });

      if (results.length === 0) {
        toast.error('No text detected. Try writing larger and clearer with your pen or finger.');
        setIsRecognizing(false);
        return;
      }

      // Combine all recognized text
      const fullText = results
        .map(r => r.text)
        .join(' ')
        .trim();

      if (!fullText) {
        toast.error('No text detected. Write more clearly and include amount (₹), date, and party name.');
        setIsRecognizing(false);
        return;
      }

      // Calculate average confidence
      const avgConfidence = results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length;

      // Targeted mode: fill a specific field only
      if (targetField && onRecognizedTargeted) {
        let value = fullText;
        if (targetField === 'reference_no') {
          // Keep alphanumeric and - _
          value = value.replace(/[^A-Za-z0-9-_]/g, '').slice(0, 32);
          if (!value) {
            toast.warning('Reference appears empty. Please write clearly (letters/numbers only).');
            setIsRecognizing(false);
            return;
          }
        }
        onRecognizedTargeted(targetField, value);
        toast.success(`Filled ${targetField === 'description' ? 'Description' : 'Reference No.'}`);
        if (!continuousMode) {
          onClose();
        } else {
          handleClear();
          setRecognitionResult(null);
        }
        setIsRecognizing(false);
        return;
      }

      // Parse ledger fields from text
      const parsedFields = parseLedgerText(fullText);

      // Store recognition result for visual feedback
      setRecognitionResult({
        confidence: avgConfidence,
        parsedFields,
      });

      // Check if we can offer direct save (high confidence + required fields)
      const hasRequiredFields = parsedFields.amount !== undefined && parsedFields.date;
      const isHighConfidence = avgConfidence > 0.9;

      // Provide helpful feedback based on confidence
      if (avgConfidence < 0.5) {
        toast.warning(`Low confidence (${(avgConfidence * 100).toFixed(0)}%). Write numbers and text more clearly.`);
      } else if (avgConfidence < 0.7) {
        toast.warning(`Medium confidence (${(avgConfidence * 100).toFixed(0)}%). Review the recognized fields below.`);
      }

      // Check for missing required fields
      if (!parsedFields.amount && !parsedFields.date) {
        toast.warning('Amount or date not detected. Include ₹ symbol and date (DD/MM/YYYY).');
      } else if (!parsedFields.amount) {
        toast.warning('Amount not found. Include ₹ symbol: ₹5000');
      } else if (!parsedFields.date) {
        toast.warning('Date not found. Include date in format: 15/01/2025');
      }

      if (isHighConfidence && hasRequiredFields) {
        // Don't auto-close, show options instead
        // User will see "Save Directly" or "Review & Edit" buttons
      } else {
        // Lower confidence or missing fields - show in form for review
        onRecognized(parsedFields);
        toast.success('Text recognized and fields filled!');
        if (!continuousMode) {
          onClose();
        } else {
          // Continuous mode: clear and ready for next entry
          handleClear();
          setRecognitionResult(null);
        }
      }
    } catch (error) {
      console.error('OCR Error:', error);
      toast.error('Recognition failed. Check your handwriting is clear and try again.');
    } finally {
      setIsRecognizing(false);
    }
  }, [hasDrawing, onRecognized, onClose, continuousMode, handleClear]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Any keypress cancels pending auto recognition
      if (autoTimerRef.current) {
        window.clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
      setAutoRecognizePending(false);
      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Ctrl+Shift+Z or Cmd+Shift+Z for redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
      // Enter to recognize (if has drawing)
      if (e.key === 'Enter' && hasDrawing && !isRecognizing) {
        e.preventDefault();
        handleRecognize();
      }
      // Escape to close
      if (e.key === 'Escape' && !isRecognizing) {
        e.preventDefault();
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (autoTimerRef.current) {
        window.clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
  }, [open, hasDrawing, isRecognizing, handleUndo, handleRedo, handleRecognize, onClose]);

  return (
    <Drawer open={open} onOpenChange={onClose} shouldScaleBackground={false}>
      <DrawerContent className="max-h-[55vh] !fixed !bottom-0 !inset-x-0">
        <DrawerHeader className="text-left pb-2 px-4 pt-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Pen className="w-4 h-4 text-primary" />
              <DrawerTitle className="text-sm font-semibold">
                {targetField
                  ? `Pen Input — ${targetField === 'description' ? 'Description' : 'Reference No.'}`
                  : 'Pen Input'}
              </DrawerTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-7 w-7 p-0"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </DrawerHeader>

        <div className="space-y-2.5 px-4 pb-3 overflow-y-auto flex-1 min-h-0">
          {/* Canvas */}
          <div className="relative border border-dashed border-primary/20 rounded-md bg-gradient-to-br from-white to-gray-50/30 overflow-hidden">
            <canvas
              ref={canvasRef}
              className="w-full touch-none cursor-crosshair bg-transparent"
              style={{ height: `${canvasHeight}px`, minHeight: '220px' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
            {!hasDrawing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <Pen className="w-6 h-6 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground/60 mb-1">
                  Write here with your pen or finger
                </p>
                <div className="text-xs text-muted-foreground/40 text-center px-4">
                  <p>Sale ₹5000 to Customer A on 15/01/2025</p>
                </div>
              </div>
            )}
            
            {/* First-time tooltip */}
            {showFirstTimeTooltip && !hasDrawing && (
              <div className="absolute top-2 left-2 right-2 bg-blue-50/95 backdrop-blur-sm border border-blue-200/50 rounded-md p-2.5 shadow-md pointer-events-auto z-10">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-blue-900 mb-1">💡 Quick Tips:</p>
                    <ul className="text-xs text-blue-800 space-y-0.5">
                      <li>• Write naturally like on paper</li>
                      <li>• Include amount (₹), date, party name</li>
                      <li>• High confidence saves directly</li>
                    </ul>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFirstTimeTooltip(false)}
                    className="h-6 w-6 p-0 text-blue-600 hover:bg-blue-100"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
          
          {/* Quick Amount Buttons */}
          {!hasDrawing && !recognitionResult && (
            <div className="flex gap-2 flex-wrap justify-center">
              {[100, 500, 1000, 5000].map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => toast.info(`Write: ₹${amount}`, { duration: 2000 })}
                  className="text-xs h-8 px-3"
                >
                  ₹{amount}
                </Button>
              ))}
            </div>
          )}

          {/* Visual Feedback - Compact Summary Bar */}
          {recognitionResult && (
            <div className={`flex items-center justify-between rounded-md px-3 py-2 border ${
              recognitionResult.confidence > 0.9
                ? 'bg-emerald-50/70 border-emerald-200'
                : recognitionResult.confidence > 0.7
                ? 'bg-amber-50/70 border-amber-200'
                : 'bg-orange-50/70 border-orange-200'
            }`}>
              <div className="text-xs text-foreground flex-1 min-w-0">
                <span className="font-medium">Parsed:</span>{' '}
                <span className="truncate">
                  {[
                    recognitionResult.parsedFields.amount !== undefined ? `₹${recognitionResult.parsedFields.amount.toLocaleString()}` : null,
                    recognitionResult.parsedFields.date ?? null,
                    recognitionResult.parsedFields.type ?? null,
                    recognitionResult.parsedFields.party_name ?? null,
                  ].filter(Boolean).join(' • ')}
                </span>
              </div>
              <div className="ml-3 shrink-0 text-[11px] font-semibold">
                {(recognitionResult.confidence * 100).toFixed(0)}%
              </div>
            </div>
          )}
          {!recognitionResult && autoRecognizePending && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <div className="w-3 h-3 border-2 border-muted-foreground/60 border-t-transparent rounded-full animate-spin" />
              <span>Recognizing in 2s…</span>
            </div>
          )}

          {/* Actions - Optimized Layout */}
          <div className="space-y-2">
            {/* Toolbar Row */}
            <div className="flex gap-2 items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleUndo}
                disabled={!hasDrawing || isRecognizing || pathsRef.current.length === 0}
                title="Undo (Ctrl+Z)"
                className="h-10 w-10 p-0"
              >
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRedo}
                disabled={!hasDrawing || isRecognizing || undoStackRef.current.length === 0}
                title="Redo (Ctrl+Shift+Z)"
                className="h-10 w-10 p-0"
              >
                <Redo2 className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={!hasDrawing || isRecognizing}
                className="flex-1 h-10"
              >
                <RotateCcw className="w-4 h-4 mr-1.5" />
                Clear
              </Button>
            </div>
            
            {/* Main Action Row */}
            {(!targetField && recognitionResult && recognitionResult.confidence > 0.9 && recognitionResult.parsedFields.amount && recognitionResult.parsedFields.date) ? (
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    onRecognized(recognitionResult.parsedFields, true);
                    if (!continuousMode) {
                      onClose();
                    } else {
                      handleClear();
                      setRecognitionResult(null);
                    }
                  }}
                  className="flex-1 gradient-hero h-11 text-sm font-medium"
                >
                  <Check className="w-4 h-4 mr-1.5" />
                  Save Directly
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    onRecognized(recognitionResult.parsedFields);
                    if (!continuousMode) {
                      onClose();
                    } else {
                      handleClear();
                      setRecognitionResult(null);
                    }
                  }}
                  className="flex-1 h-11 text-sm"
                >
                  Review & Edit
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleRecognize}
                disabled={!hasDrawing || isRecognizing}
                className="w-full gradient-hero h-11 text-sm font-medium"
              >
                {isRecognizing ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Recognizing...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    {targetField
                      ? (targetField === 'description' ? 'Fill Description' : 'Fill Reference No.')
                      : 'Recognize'}
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Continuous Mode Toggle & Hint */}
          <div className="flex items-center justify-between pt-1.5 border-t">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={continuousMode}
                onChange={(e) => setContinuousMode(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              <span className="text-muted-foreground">Continuous mode</span>
            </label>
            <p className="text-xs text-muted-foreground/60">
              Enter: Recognize
            </p>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

