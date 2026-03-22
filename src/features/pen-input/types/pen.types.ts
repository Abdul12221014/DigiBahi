// Enhanced pen input types
export interface PenCanvasProps {
  onRecognized: (text: string) => void;
  onClose: () => void;
}

export interface RecognitionResult {
  text: string;
  confidence: number;
  structuredData: {
    amounts: string[];
    dates: string[];
    phones: string[];
    emails: string[];
    gstNumbers: string[];
  };
}

export interface OcrResult {
  text: string;
  confidence: number;
  box: DOMRect;
  words: Array<{
    text: string;
    confidence: number;
    bbox: { x: number; y: number; width: number; height: number };
  }>;
}

export interface ShapeDetection {
  type: 'circle' | 'rectangle' | 'square' | 'arrow' | 'line' | 'triangle';
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  points: Array<{ x: number; y: number; pressure: number; timestamp: number }>;
}

export interface Stroke {
  id: string;
  points: Array<{ x: number; y: number; pressure: number; timestamp: number }>;
  color: string;
  width: number;
  opacity: number;
  tool: DrawingTool;
  timestamp: number;
}

export interface CanvasConfig {
  zoom: number;
  pan: { x: number; y: number };
  width: number;
  height: number;
}

export interface PenToolState {
  tool: 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'lasso';
  color: string;
  width: number;
  opacity: number;
  mode: 'draw' | 'shape' | 'ocr';
}

export interface RecognizedData {
  type: 'date' | 'phone' | 'email' | 'amount' | 'gst';
  value: string;
  confidence: number;
}

export interface ShapeSnapOverlayProps {
  shape: ShapeDetection | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface LassoOverlayProps {
  rect: DOMRect | null;
}

export interface ToolPaletteProps {
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}

// Canvas drawing utilities
export interface DrawingContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  config: CanvasConfig;
}

export interface PointerEvent {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
}

// Recognition patterns
export const RECOGNITION_PATTERNS = {
  DATE: [
    /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/g,
    /\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4}/gi,
    /\d{1,2}\s+\d{1,2}\s+\d{2,4}/g
  ],
  PHONE: /(\+91\s?)?[6-9]\d{9}/g,
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  AMOUNT: /₹?\s*\d+([.,]\d{2})?/g,
  GST: /\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}/g
};

export const SHAPE_THRESHOLDS = {
  MIN_POINTS_FOR_SHAPE: 5,
  CIRCLE_CONFIDENCE: 0.6,
  RECTANGLE_CONFIDENCE: 0.7,
  ARROW_ANGLE_THRESHOLD: Math.PI / 4,
  LINE_STRAIGHTNESS: 0.8,
  TRIANGLE_CONFIDENCE: 0.6,
  RECTANGLE_ASPECT_RATIO_MIN: 0.8,
  RECTANGLE_ASPECT_RATIO_MAX: 1.2
};

// Additional types for pen input components
export type DrawingTool = 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'lasso';

export type StrokePoint = {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
};

export type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
