export type ShapeType = 'circle' | 'rectangle' | 'square' | 'arrow' | 'line' | 'triangle';

export interface ShapeDetection {
  type: ShapeType;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}


