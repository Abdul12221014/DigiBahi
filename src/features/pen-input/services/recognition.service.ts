/**
 * Recognition Service (Legacy Shim)
 * 
 * This file maintains backward compatibility by forwarding recognition
 * requests to the new OCRHybridService.
 * 
 * @deprecated Use ocrHybrid.service.ts directly for new code
 */
import { getOCRHybridService, type OCRResult } from './ocrHybrid.service';

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

// Re-export OCRResult for convenience
export type { OCRResult } from './ocrHybrid.service';

// Enhanced word database for better recognition
const ACCOUNTING_WORDS = [
  // Common accounting terms
  'Sale', 'Sales', 'Purchase', 'Purchases', 'Expense', 'Expenses', 'Receipt', 'Receipts',
  'Invoice', 'Invoices', 'Payment', 'Payments', 'Cash', 'Credit', 'Debit', 'Balance',
  'Total', 'Amount', 'Price', 'Cost', 'Tax', 'GST', 'VAT', 'Discount', 'Refund',
  
  // Numbers and amounts
  '₹', 'Rs', 'Rupees', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '10', '20', '30', '40', '50', '60', '70', '80', '90', '100', '200', '500', '1000',
  
  // Dates and time
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  '2024', '2025', '2026',
  
  // Common business terms
  'Customer', 'Client', 'Vendor', 'Supplier', 'Company', 'Business', 'Office',
  'Rent', 'Salary', 'Wages', 'Commission', 'Profit', 'Loss', 'Revenue', 'Income'
];

// Pattern matching for better recognition
const PATTERNS = {
  AMOUNT: /₹?\s*\d+([.,]\d{2})?/g,
  DATE: /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/g,
  PHONE: /(\+91\s?)?[6-9]\d{9}/g,
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  GST: /\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}/g
};

export class EnhancedRecognitionService {
  /**
   * Enhanced OCR recognition with pattern matching
   * @deprecated Use getOCRHybridService().recognizeCanvas() instead
   */
  static async recognizeImageData(imageData: ImageData): Promise<OcrResult> {
    // Forward to new hybrid OCR service
    // This is a compatibility shim - new code should use ocrHybrid.service directly
    
    // Create temporary canvas to hold imageData
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    ctx.putImageData(imageData, 0, 0);
    
    // Use hybrid OCR service
    const hybridService = getOCRHybridService();
    const results = await hybridService.recognizeCanvas(canvas);
    
    // Convert to legacy format
    const fullText = results.map(r => r.text).join(' ');
    const avgConfidence = results.length > 0
      ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
      : 0;
    
    const box = new DOMRect(0, 0, imageData.width, imageData.height);
    
    return {
      text: fullText,
      confidence: avgConfidence,
      box,
      words: results.map(r => ({
        text: r.text,
        confidence: r.confidence,
        bbox: { x: r.box.x, y: r.box.y, width: r.box.width, height: r.box.height }
      }))
    };
  }

  /**
   * Legacy processing - kept for backward compatibility
   * @deprecated
   */
  private static async legacyRecognize(imageData: ImageData): Promise<OcrResult> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Convert ImageData to canvas for analysis
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');
    
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    ctx.putImageData(imageData, 0, 0);
    
    // Analyze image characteristics
    const analysis = this.analyzeImage(imageData);
    
    // Generate recognition result based on analysis
    const result = this.generateRecognitionResult(analysis, imageData);
    
    return result;
  }
  
  /**
   * Analyze image data for patterns and characteristics
   */
  private static analyzeImage(imageData: ImageData): { strokeDensity: number; hasVerticalLines: boolean; hasHorizontalLines: boolean; hasCircularShapes: boolean; width: number; height: number } {
    const { data, width, height } = imageData;
    let strokePixels = 0;
    const totalPixels = width * height;
    
    // Count non-transparent pixels (potential strokes)
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) strokePixels++;
    }
    
    const strokeDensity = strokePixels / totalPixels;
    const hasVerticalLines = this.detectVerticalLines(imageData);
    const hasHorizontalLines = this.detectHorizontalLines(imageData);
    const hasCircularShapes = this.detectCircularShapes(imageData);
    
      return {
      strokeDensity,
      hasVerticalLines,
      hasHorizontalLines,
      hasCircularShapes,
      width,
      height
    };
  }
  
  /**
   * Detect vertical lines in image
   */
  private static detectVerticalLines(imageData: ImageData): boolean {
    const { data, width, height } = imageData;
    let verticalLineCount = 0;
    
    for (let x = 0; x < width; x++) {
      let consecutivePixels = 0;
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        if (data[idx + 3] > 0) {
          consecutivePixels++;
        } else {
          consecutivePixels = 0;
        }
      }
      if (consecutivePixels > height * 0.3) verticalLineCount++;
    }
    
    return verticalLineCount > 0;
  }
  
  /**
   * Detect horizontal lines in image
   */
  private static detectHorizontalLines(imageData: ImageData): boolean {
    const { data, width, height } = imageData;
    let horizontalLineCount = 0;
    
    for (let y = 0; y < height; y++) {
      let consecutivePixels = 0;
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (data[idx + 3] > 0) {
          consecutivePixels++;
        } else {
          consecutivePixels = 0;
        }
      }
      if (consecutivePixels > width * 0.3) horizontalLineCount++;
    }
    
    return horizontalLineCount > 0;
  }
  
  /**
   * Detect circular shapes in image
   */
  private static detectCircularShapes(imageData: ImageData): boolean {
    const { data, width, height } = imageData;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2;
    
    let circularPixels = 0;
    let totalPixels = 0;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (data[idx + 3] > 0) {
          totalPixels++;
          const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
          if (Math.abs(distance - radius) < radius * 0.3) {
            circularPixels++;
          }
        }
      }
    }
    
    return totalPixels > 0 && (circularPixels / totalPixels) > 0.3;
  }
  
  /**
   * Generate recognition result based on analysis
   */
  private static generateRecognitionResult(analysis: ReturnType<typeof EnhancedRecognitionService.analyzeImage>, imageData: ImageData): OcrResult {
    let recognizedText = '';
    let confidence = 0.5;
    const words: OcrResult['words'] = [];
    
    // Pattern-based recognition
    if (analysis.hasVerticalLines && analysis.hasHorizontalLines) {
      // Likely a number or letter with both vertical and horizontal strokes
      const numbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
      recognizedText = numbers[Math.floor(Math.random() * numbers.length)];
      confidence = 0.8;
    } else if (analysis.hasVerticalLines) {
      // Likely a vertical line or number 1
      recognizedText = '1';
      confidence = 0.7;
    } else if (analysis.hasHorizontalLines) {
      // Likely a horizontal line or dash
      recognizedText = '-';
      confidence = 0.6;
    } else if (analysis.hasCircularShapes) {
      // Likely a circle or letter O
      recognizedText = 'O';
      confidence = 0.75;
    } else if (analysis.strokeDensity > 0.1) {
      // Complex shape, try to match accounting words
      const possibleWords = ACCOUNTING_WORDS.filter(word => 
        word.length <= 8 && Math.random() > 0.7
      );
      if (possibleWords.length > 0) {
        recognizedText = possibleWords[0];
        confidence = 0.6;
      }
    }
    
    // If no specific pattern detected, try random accounting word
    if (!recognizedText) {
      recognizedText = ACCOUNTING_WORDS[Math.floor(Math.random() * ACCOUNTING_WORDS.length)];
      confidence = 0.4;
    }
    
    // Add some randomness to confidence
    confidence += (Math.random() - 0.5) * 0.2;
    confidence = Math.max(0.1, Math.min(1.0, confidence));
    
    // Create word entry
    words.push({
      text: recognizedText,
      confidence,
      bbox: {
        x: 0,
        y: 0,
        width: imageData.width,
        height: imageData.height
      }
    });
    
    return {
      text: recognizedText,
      confidence,
      box: new DOMRect(0, 0, imageData.width, imageData.height),
      words
    };
  }
  
  /**
   * Extract structured data from recognized text
   */
  static extractStructuredData(text: string): {
    amounts: string[];
    dates: string[];
    phones: string[];
    emails: string[];
    gstNumbers: string[];
  } {
    return {
      amounts: text.match(PATTERNS.AMOUNT) || [],
      dates: text.match(PATTERNS.DATE) || [],
      phones: text.match(PATTERNS.PHONE) || [],
      emails: text.match(PATTERNS.EMAIL) || [],
      gstNumbers: text.match(PATTERNS.GST) || []
    };
  }
}

// Export the enhanced service
export const recognizeImageData = EnhancedRecognitionService.recognizeImageData;
export default recognizeImageData;