import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Eraser, Pen, Highlighter, Scissors, Undo2, Redo2, BarChart3, Brain, Upload, ScanText, Loader2 } from 'lucide-react';
import { usePenTool } from '../context/PenToolContext';
import { toast } from 'sonner';

const COLORS = ['#000000', '#2E7D32', '#1976D2', '#D32F2F', '#9C27B0', '#FBC02D'];

interface Props {
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onRecognize?: () => void; // NEW: Trigger OCR recognition
  isRecognizing?: boolean; // NEW: Show loading state
}

const ToolPalette: React.FC<Props> = ({ onUndo, onRedo, onClear, onRecognize, isRecognizing }) => {
  const { tool, setTool, color, setColor, width, setWidth, opacity, setOpacity, mode, setMode, eraserMode, setEraserMode } = usePenTool();
  const toolbarRef = useRef<HTMLDivElement>(null);

  // NEW: Toggle for auto-showing correction overlay
  const [showCorrectionsOnRecognize, setShowCorrectionsOnRecognize] = useState(() => {
    const saved = localStorage.getItem('digbahi_show_corrections_overlay');
    return saved !== null ? saved === 'true' : true; // Default: true
  });

  // Auto-scroll to show Pen/Pencil/Eraser buttons on mount - CRITICAL for iPad visibility
  useEffect(() => {
    const scrollToStart = () => {
      if (toolbarRef.current) {
        toolbarRef.current.scrollLeft = 0;
      }
    };
    // Immediate scroll
    scrollToStart();
    // Also try after a short delay (in case of layout shifts)
    setTimeout(scrollToStart, 100);
    setTimeout(scrollToStart, 500);
  }, []);

  const handleToggleCorrections = (checked: boolean) => {
    setShowCorrectionsOnRecognize(checked);
    localStorage.setItem('digbahi_show_corrections_overlay', checked.toString());
    toast.info(checked ? 'Corrections overlay enabled' : 'Corrections overlay disabled');
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 md:top-auto md:bottom-4 md:left-auto md:right-4 md:w-auto bg-white dark:bg-gray-900 border-t-2 md:border-2 border-primary shadow-2xl z-[9999] flex"
      style={{
        display: 'flex',
        visibility: 'visible',
        opacity: 1,
        position: 'fixed',
        paddingBottom: 'env(safe-area-inset-bottom, 1rem)',
        zIndex: 9999,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        overflow: 'visible'
      }}
    >
      {/* FIXED LEFT SECTION - Pen/Pencil/Eraser - NEVER SCROLLS, ALWAYS VISIBLE */}
      {/* CRITICAL: These are the PRIMARY drawing tools - MUST be visible at all times */}
      <div
        className="flex-shrink-0 p-2 border-r-4 border-green-500 shadow-xl"
        style={{
          backgroundColor: '#22c55e',
          minWidth: '320px',
          display: 'flex',
          visibility: 'visible',
          opacity: 1,
          position: 'relative',
          zIndex: 10000,
          flexShrink: 0
        }}
      >
        <div className="flex gap-1.5" style={{ display: 'flex', visibility: 'visible', width: '100%' }}>
          <Button
            size="lg"
            variant={tool === 'pen' ? 'default' : 'secondary'}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTool('pen');
              console.log('[ToolPalette] Pen tool selected');
            }}
            title="Pen Tool - Smooth variable width strokes"
            className="touch-manipulation font-bold flex-col gap-1 bg-white hover:bg-gray-100 text-gray-900 border-2 active:scale-95 transition-transform"
            style={{
              minWidth: '70px',
              minHeight: '60px',
              display: 'flex',
              visibility: 'visible',
              opacity: 1,
              flex: 1,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent'
            }}
          >
            <Pen className="w-7 h-7" style={{ display: 'block', visibility: 'visible', color: tool === 'pen' ? '#22c55e' : '#374151' }} />
            <span className="text-xs font-bold" style={{ display: 'block', visibility: 'visible', color: tool === 'pen' ? '#22c55e' : '#374151' }}>Pen</span>
          </Button>
          <Button
            size="lg"
            variant={tool === 'pencil' ? 'default' : 'secondary'}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTool('pencil');
              console.log('[ToolPalette] Pencil tool selected');
            }}
            title="Pencil Tool - Textured strokes like real pencil"
            className="touch-manipulation font-bold flex-col gap-1 bg-white hover:bg-gray-100 text-gray-900 border-2 active:scale-95 transition-transform"
            style={{
              minWidth: '70px',
              minHeight: '60px',
              display: 'flex',
              visibility: 'visible',
              opacity: 1,
              flex: 1,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent'
            }}
          >
            <Pen className="w-7 h-7 rotate-12" style={{ display: 'block', visibility: 'visible', color: tool === 'pencil' ? '#22c55e' : '#374151' }} />
            <span className="text-xs font-bold" style={{ display: 'block', visibility: 'visible', color: tool === 'pencil' ? '#22c55e' : '#374151' }}>Pencil</span>
          </Button>
          <Button
            size="lg"
            variant={tool === 'eraser' ? 'default' : 'secondary'}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (tool === 'eraser') {
                // Toggle mode if already selected
                setEraserMode(eraserMode === 'pixel' ? 'object' : 'pixel');
                toast.info(`Eraser: ${eraserMode === 'pixel' ? 'Object (Magic)' : 'Pixel (Standard)'} Mode`);
              } else {
                setTool('eraser');
                console.log('[ToolPalette] Eraser tool selected');
              }
            }}
            title="Eraser Tool - Tap again to toggle Object/Pixel mode"
            className="touch-manipulation font-bold flex-col gap-1 bg-white hover:bg-gray-100 text-gray-900 border-2 active:scale-95 transition-transform"
            style={{
              minWidth: '70px',
              minHeight: '60px',
              display: 'flex',
              visibility: 'visible',
              opacity: 1,
              flex: 1,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent'
            }}
          >
            {eraserMode === 'object' ? (
              <div className="relative">
                <Eraser className="w-7 h-7 text-purple-600" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                </span>
              </div>
            ) : (
              <Eraser className="w-7 h-7" style={{ display: 'block', visibility: 'visible', color: tool === 'eraser' ? '#22c55e' : '#374151' }} />
            )}
            <span className="text-[10px] font-bold leading-tight text-center" style={{ display: 'block', visibility: 'visible', color: tool === 'eraser' ? (eraserMode === 'object' ? '#9333ea' : '#22c55e') : '#374151' }}>
              {eraserMode === 'object' ? 'Magic' : 'Eraser'}
            </span>
          </Button>
        </div>
      </div>

      {/* SCROLLABLE RIGHT SECTION - All other tools */}
      <div
        className="flex-1 overflow-x-auto overflow-y-hidden p-4"
        style={{ WebkitOverflowScrolling: 'touch' }}
        ref={toolbarRef}
      >
        <div className="flex items-center gap-3 min-w-max touch-pan-x">
          <div className="h-6 w-px bg-border mx-1 flex-shrink-0" />

          {/* Modes: Draw / Shape / OCR */}
          <div className="flex gap-2 flex-shrink-0">
            <Button size="default" variant={mode === 'draw' ? 'default' : 'outline'} onClick={() => setMode('draw')} title="Draw" className="touch-manipulation min-w-[44px] min-h-[44px] text-lg">✏️</Button>
            <Button size="default" variant={mode === 'shape' ? 'default' : 'outline'} onClick={() => setMode('shape')} title="Shape Snap" className="touch-manipulation min-w-[44px] min-h-[44px] text-lg">📐</Button>
            <Button size="default" variant={mode === 'ocr' ? 'default' : 'outline'} onClick={() => setMode('ocr')} title="OCR" className="touch-manipulation min-w-[44px] min-h-[44px] text-lg">🔠</Button>
          </div>

          <div className="flex gap-2 flex-shrink-0 items-center">
            {COLORS.map(c => (
              <button key={c} aria-label={`color-${c}`} onClick={() => setColor(c)} className={`w-8 h-8 rounded-full border-2 touch-manipulation ${color === c ? 'ring-2 ring-primary ring-offset-2' : ''}`} style={{ backgroundColor: c }} />
            ))}
          </div>

          <div className="h-8 w-px bg-border mx-1 flex-shrink-0" />

          <div className="flex items-center gap-2 min-w-[160px] flex-shrink-0">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Nib</span>
            <Slider value={[width]} min={1} max={12} step={1} onValueChange={([v]) => setWidth(v)} className="w-32 touch-manipulation" />
          </div>

          <div className="flex items-center gap-2 min-w-[160px] flex-shrink-0">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Opacity</span>
            <Slider value={[opacity]} min={0.1} max={1} step={0.05} onValueChange={([v]) => setOpacity(v)} className="w-32 touch-manipulation" />
          </div>

          <div className="h-8 w-px bg-border mx-1 flex-shrink-0" />

          <div className="flex gap-2 flex-shrink-0">
            <Button size="default" variant="outline" onClick={onUndo} title="Undo" className="touch-manipulation min-w-[44px] min-h-[44px]"><Undo2 className="w-5 h-5" /></Button>
            <Button size="default" variant="outline" onClick={onRedo} title="Redo" className="touch-manipulation min-w-[44px] min-h-[44px]"><Redo2 className="w-5 h-5" /></Button>
            <Button size="default" variant="outline" onClick={onClear} title="Clear" className="touch-manipulation min-h-[44px] px-4">Clear</Button>
          </div>

          <div className="h-8 w-px bg-border mx-1 flex-shrink-0" />

          {/* NEW: Recognize Button (Hybrid OCR) */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            <Button
              size="default"
              variant={isRecognizing ? "default" : "outline"}
              onClick={onRecognize}
              disabled={isRecognizing || !onRecognize}
              title="Recognize Handwriting"
              className="gap-2 touch-manipulation min-h-[44px] px-4"
            >
              {isRecognizing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Recognizing...
                </>
              ) : (
                <>
                  <ScanText className="w-5 h-5" />
                  Recognize
                </>
              )}
            </Button>

            {/* Toggle for correction overlay */}
            <div className="flex items-center gap-2 px-1">
              <Switch
                id="show-corrections"
                checked={showCorrectionsOnRecognize}
                onCheckedChange={handleToggleCorrections}
                className="scale-100"
              />
              <Label htmlFor="show-corrections" className="text-sm cursor-pointer whitespace-nowrap touch-manipulation">
                Show corrections
              </Label>
            </div>
          </div>

          <div className="h-8 w-px bg-border mx-1 flex-shrink-0" />

          {/* Backup / Restore / Sync / AI Learning - Always visible on tablet+ */}
          <div className="flex gap-2 flex-shrink-0">
            <Button size="default" variant="outline" title="Backup" onClick={() => document.dispatchEvent(new CustomEvent('digbahi:backup'))} className="touch-manipulation min-h-[44px] px-3">Backup</Button>
            <Button size="default" variant="outline" title="Restore" onClick={() => document.dispatchEvent(new CustomEvent('digbahi:restore'))} className="touch-manipulation min-h-[44px] px-3">Restore</Button>
            <Button size="default" variant="outline" title="Sync" onClick={() => document.dispatchEvent(new CustomEvent('digbahi:sync'))} className="touch-manipulation min-h-[44px] px-3">Sync</Button>
            <Button size="default" variant="outline" title="Run AI Analysis" onClick={() => document.dispatchEvent(new CustomEvent('digbahi:ai-refresh'))} className="touch-manipulation min-w-[44px] min-h-[44px]">
              <BarChart3 className="w-5 h-5" />
            </Button>
            <Button size="default" variant="outline" title="Train AI Model" onClick={() => document.dispatchEvent(new CustomEvent('digbahi:ai-train'))} className="touch-manipulation min-w-[44px] min-h-[44px]">
              <Brain className="w-5 h-5" />
            </Button>
            <Button size="default" variant="outline" title="Sync AI Model" onClick={() => document.dispatchEvent(new CustomEvent('digbahi:ai-sync'))} className="touch-manipulation min-w-[44px] min-h-[44px]">
              <Upload className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolPalette;
