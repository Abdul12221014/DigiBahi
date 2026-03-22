// Enhanced shape detection service
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
  points: Array<{ x: number; y: number; pressure: number; timestamp: number }>;
  color: string;
  width: number;
  opacity: number;
}

const SHAPE_THRESHOLDS = {
  MIN_POINTS_FOR_SHAPE: 5,
  CIRCLE_CONFIDENCE: 0.6,
  RECTANGLE_CONFIDENCE: 0.7,
  ARROW_ANGLE_THRESHOLD: Math.PI / 4, // 45 degrees
  LINE_STRAIGHTNESS: 0.8,
  TRIANGLE_CONFIDENCE: 0.6
};

export class ShapeDetectionService {
  /**
   * Detect shape from stroke points
   */
  static detectShape(points: Array<{ x: number; y: number; pressure: number; timestamp: number }>): ShapeDetection | null {
    if (points.length < SHAPE_THRESHOLDS.MIN_POINTS_FOR_SHAPE) return null;
    
    // Calculate bounding box
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y));
    const maxY = Math.max(...points.map(p => p.y));
    
    const width = maxX - minX;
    const height = maxY - minY;
    const aspectRatio = width / height;
    
    // Try different shape detections
    const detections = [
      this.detectCircle(points, minX, maxX, minY, maxY, width, height),
      this.detectRectangle(points, minX, maxX, minY, maxY, width, height, aspectRatio),
      this.detectArrow(points, minX, maxX, minY, maxY, width, height),
      this.detectLine(points, minX, maxX, minY, maxY, width, height),
      this.detectTriangle(points, minX, maxX, minY, maxY, width, height)
    ].filter(Boolean) as ShapeDetection[];
    
    // Return the detection with highest confidence
    if (detections.length === 0) return null;
    
    return detections.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
  }
  
  /**
   * Detect circular shapes
   */
  private static detectCircle(
    points: Array<{ x: number; y: number; pressure: number; timestamp: number }>,
    minX: number, maxX: number, minY: number, maxY: number, width: number, height: number
  ): ShapeDetection | null {
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const radius = Math.min(width, height) / 2;
    
    if (radius < 10) return null; // Too small
    
    let circularScore = 0;
    let totalPoints = 0;
    
    for (const point of points) {
      const distance = Math.sqrt((point.x - centerX) ** 2 + (point.y - centerY) ** 2);
      const expectedDistance = radius;
      const tolerance = radius * 0.3; // 30% tolerance
      
      if (Math.abs(distance - expectedDistance) < tolerance) {
        circularScore++;
      }
      totalPoints++;
    }
    
    const confidence = circularScore / totalPoints;
    if (confidence > SHAPE_THRESHOLDS.CIRCLE_CONFIDENCE) {
      return {
        type: 'circle',
        confidence,
        boundingBox: { x: minX, y: minY, width, height },
        points
      };
    }
    
    return null;
  }
  
  /**
   * Detect rectangular shapes
   */
  private static detectRectangle(
    points: Array<{ x: number; y: number; pressure: number; timestamp: number }>,
    minX: number, maxX: number, minY: number, maxY: number, width: number, height: number, aspectRatio: number
  ): ShapeDetection | null {
    if (width < 20 || height < 20) return null; // Too small
    
    const isSquare = aspectRatio > 0.8 && aspectRatio < 1.2;
    const isRectangle = aspectRatio > 1.5 || aspectRatio < 0.67;
    
    if (!isSquare && !isRectangle) return null;
    
    // Check if points follow rectangular pattern
    let edgePoints = 0;
    const tolerance = Math.min(width, height) * 0.2;
    
    for (const point of points) {
      const isOnEdge = 
        Math.abs(point.x - minX) < tolerance || 
        Math.abs(point.x - maxX) < tolerance ||
        Math.abs(point.y - minY) < tolerance || 
        Math.abs(point.y - maxY) < tolerance;
      
      if (isOnEdge) edgePoints++;
    }
    
    const confidence = edgePoints / points.length;
    if (confidence > SHAPE_THRESHOLDS.RECTANGLE_CONFIDENCE) {
      return {
        type: isSquare ? 'square' : 'rectangle',
        confidence,
        boundingBox: { x: minX, y: minY, width, height },
        points
      };
    }
    
    return null;
  }
  
  /**
   * Detect arrow shapes
   */
  private static detectArrow(
    points: Array<{ x: number; y: number; pressure: number; timestamp: number }>,
    minX: number, maxX: number, minY: number, maxY: number, width: number, height: number
  ): ShapeDetection | null {
    if (points.length < 10) return null;
    
    // Analyze stroke direction changes
    const directionChanges = this.analyzeDirectionChanges(points);
    
    if (directionChanges < 2) return null; // Not enough direction changes for arrow
    
    // Check for arrow-like pattern (shaft + head)
    const firstThird = points.slice(0, Math.floor(points.length / 3));
    const lastThird = points.slice(-Math.floor(points.length / 3));
    
    if (firstThird.length < 3 || lastThird.length < 3) return null;
    
    const shaftAngle = this.calculateAngle(firstThird);
    const headAngle = this.calculateAngle(lastThird);
    const angleDiff = Math.abs(headAngle - shaftAngle);
    
    if (angleDiff > SHAPE_THRESHOLDS.ARROW_ANGLE_THRESHOLD) {
      return {
        type: 'arrow',
        confidence: Math.min(0.9, angleDiff / Math.PI),
        boundingBox: { x: minX, y: minY, width, height },
        points
      };
  }

  return null;
}

  /**
   * Detect straight lines
   */
  private static detectLine(
    points: Array<{ x: number; y: number; pressure: number; timestamp: number }>,
    minX: number, maxX: number, minY: number, maxY: number, width: number, height: number
  ): ShapeDetection | null {
    if (points.length < 5) return null;
    
    // Calculate line straightness
    const straightness = this.calculateStraightness(points);
    
    if (straightness > SHAPE_THRESHOLDS.LINE_STRAIGHTNESS) {
      return {
        type: 'line',
        confidence: straightness,
        boundingBox: { x: minX, y: minY, width, height },
        points
      };
    }
    
    return null;
  }
  
  /**
   * Detect triangular shapes
   */
  private static detectTriangle(
    points: Array<{ x: number; y: number; pressure: number; timestamp: number }>,
    minX: number, maxX: number, minY: number, maxY: number, width: number, height: number
  ): ShapeDetection | null {
    if (points.length < 8) return null;
    
    // Look for three distinct corners
    const corners = this.findCorners(points);
    
    if (corners.length >= 3) {
      const confidence = Math.min(0.9, corners.length / 3);
      return {
        type: 'triangle',
        confidence,
        boundingBox: { x: minX, y: minY, width, height },
        points
      };
    }
    
    return null;
  }
  
  /**
   * Analyze direction changes in stroke
   */
  private static analyzeDirectionChanges(points: Array<{ x: number; y: number; pressure: number; timestamp: number }>): number {
    if (points.length < 3) return 0;
    
    let changes = 0;
    const _lastDirection = 0; // direction tracking (unused but reserved)
    
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      
      const dir1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
      const dir2 = Math.atan2(next.y - curr.y, next.x - curr.x);
      
      const angleDiff = Math.abs(dir2 - dir1);
      if (angleDiff > Math.PI / 6) { // 30 degrees
        changes++;
      }
    }
    
    return changes;
  }
  
  /**
   * Calculate angle of a point sequence
   */
  private static calculateAngle(points: Array<{ x: number; y: number; pressure: number; timestamp: number }>): number {
    if (points.length < 2) return 0;
    
    const first = points[0];
    const last = points[points.length - 1];
    
    return Math.atan2(last.y - first.y, last.x - first.x);
  }
  
  /**
   * Calculate straightness of a line
   */
  private static calculateStraightness(points: Array<{ x: number; y: number; pressure: number; timestamp: number }>): number {
    if (points.length < 3) return 0;
    
    const first = points[0];
    const last = points[points.length - 1];
    const expectedAngle = Math.atan2(last.y - first.y, last.x - first.x);
    
    let totalDeviation = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const curr = points[i];
      const expectedY = first.y + (curr.x - first.x) * Math.tan(expectedAngle);
      const deviation = Math.abs(curr.y - expectedY);
      totalDeviation += deviation;
    }
    
    const avgDeviation = totalDeviation / (points.length - 2);
    const maxDeviation = Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2);
    
    return Math.max(0, 1 - (avgDeviation / maxDeviation));
  }
  
  /**
   * Find corner points in stroke
   */
  private static findCorners(points: Array<{ x: number; y: number; pressure: number; timestamp: number }>): Array<{ x: number; y: number }> {
    const corners: Array<{ x: number; y: number }> = [];
    const threshold = 0.3; // Angle threshold for corner detection
    
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      
      const angle1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
      const angle2 = Math.atan2(next.y - curr.y, next.x - curr.x);
      
      const angleDiff = Math.abs(angle2 - angle1);
      if (angleDiff > threshold) {
        corners.push({ x: curr.x, y: curr.y });
      }
    }
    
    return corners;
  }
}

// Export the main detection function
export const detectShape = ShapeDetectionService.detectShape;
export default detectShape;