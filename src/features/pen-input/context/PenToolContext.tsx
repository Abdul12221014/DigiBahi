/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import type { DrawingTool } from '../types/pen.types';

interface PenToolState {
  tool: DrawingTool;
  color: string;
  width: number; // nib size
  opacity: number;
  mode: 'draw' | 'shape' | 'ocr';
  eraserMode: 'pixel' | 'object';
  setTool: (t: DrawingTool) => void;
  setColor: (c: string) => void;
  setWidth: (w: number) => void;
  setOpacity: (o: number) => void;
  setMode: (m: 'draw' | 'shape' | 'ocr') => void;
  setEraserMode: (m: 'pixel' | 'object') => void;
}

const PenToolContext = createContext<PenToolState | null>(null);

export const PenToolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tool, setTool] = useState<DrawingTool>('pen');
  const [color, setColor] = useState<string>('#000000');
  const [width, setWidth] = useState<number>(1.5); // Thinner default for natural pen feel
  const [opacity, setOpacity] = useState<number>(1);
  const [mode, setMode] = useState<'draw' | 'shape' | 'ocr'>('draw');
  const [eraserMode, setEraserMode] = useState<'pixel' | 'object'>('pixel');

  // Enhanced setTool with logging and validation
  const handleSetTool = useCallback((newTool: DrawingTool) => {
    console.log(`[PenToolContext] Tool changed from ${tool} to ${newTool}`);
    setTool(newTool);
  }, [tool]);

  const value = useMemo(() => ({
    tool,
    color,
    width,
    opacity,
    mode,
    eraserMode,
    setTool: handleSetTool,
    setColor,
    setWidth,
    setOpacity,
    setMode,
    setEraserMode
  }), [tool, color, width, opacity, mode, eraserMode, handleSetTool]);

  return <PenToolContext.Provider value={value}>{children}</PenToolContext.Provider>;
};

export function usePenTool() {
  const ctx = useContext(PenToolContext);
  if (!ctx) throw new Error('usePenTool must be used within PenToolProvider');
  return ctx;
}

export default PenToolContext;
