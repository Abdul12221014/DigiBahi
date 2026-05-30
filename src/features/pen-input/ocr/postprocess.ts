/**
 * OCR Post-Processing Pipeline
 * 
 * Idempotent and deterministic functions for cleaning and parsing OCR results.
 * Applied before showing OCRConfirm dialog to provide better suggestions.
 */

import { parse, isValid, format } from 'date-fns';
import { enIN } from 'date-fns/locale';

/**
 * Normalize numbers: Convert Devanagari numerals to Western, remove stray characters
 */
export function normalizeNumbers(text: string): string {
  if (!text) return text;
  
  // Devanagari to Western numeral mapping
  const devanagariMap: Record<string, string> = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
  };
  
  let normalized = text;

  // Convert Devanagari numerals to Western digits — safe for all text
  Object.entries(devanagariMap).forEach(([dev, west]) => {
    normalized = normalized.replace(new RegExp(dev, 'g'), west);
  });

  // NOTE: ASCII letter-to-digit substitutions (O→0, l→1, S→5) were removed.
  // They corrupted common accounting words ("Sale"→"5ale", "Invoice"→"Inv0ice").
  // Digit confusion fixes are applied narrowly inside parseCurrency() only.

  return normalized;
}

/**
 * Parse currency from text
 */
export function parseCurrency(text: string): { amount: number | null; raw: string } {
  if (!text) return { amount: null, raw: text };

  // Normalize Devanagari digits, then apply digit-confusion fixes narrowly
  // (O\u21920 and l\u21921 are only safe in the context of numeric strings)
  const normalized = normalizeNumbers(text)
    .replace(/[oO]/g, '0')
    .replace(/[lI]/g, '1');

  // Remove currency symbols and common prefixes
  const cleaned = normalized
    .replace(/[\u20b9Rs.]/gi, '')
    .replace(/INR/gi, '')
    .trim();
  
  // Extract number with optional decimal and thousands separators
  const match = cleaned.match(/(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  
  if (match) {
    const numStr = match[1].replace(/,/g, '');
    const amount = parseFloat(numStr);
    
    if (!isNaN(amount) && amount >= 0) {
      return { amount, raw: text };
    }
  }
  
  return { amount: null, raw: text };
}

/**
 * Parse date from text using en-IN locale
 * Returns ISO date string or null
 */
export function parseDate(text: string): string | null {
  if (!text) return null;
  
  const normalized = normalizeNumbers(text);
  
  // Common date formats in India
  const formats = [
    'dd/MM/yyyy',
    'dd-MM-yyyy',
    'dd.MM.yyyy',
    'dd/MM/yy',
    'dd-MM-yy',
    'dd.MM.yy',
    'yyyy-MM-dd',
    'd/M/yyyy',
    'd-M-yyyy',
    'd.M.yyyy'
  ];
  
  for (const fmt of formats) {
    try {
      const parsed = parse(normalized, fmt, new Date(), { locale: enIN });
      if (isValid(parsed)) {
        return format(parsed, 'yyyy-MM-dd');
      }
    } catch {
      // Try next format
    }
  }
  
  return null;
}

/**
 * Detect and validate GST number
 * Format: 2 digits (state) + 10 digits (PAN) + 1 digit (entity) + 1 letter (Z) + 1 check digit
 */
export function detectGST(text: string): string | null {
  if (!text) return null;
  
  const normalized = normalizeNumbers(text).toUpperCase();
  
  // GST regex: 15 characters total
  // Format: \d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}
  const gstRegex = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/;
  
  const match = normalized.match(gstRegex);
  
  if (match) {
    const gstNumber = match[0];
    
    // Basic validation: length should be exactly 15
    if (gstNumber.length === 15) {
      return gstNumber;
    }
  }
  
  return null;
}

/**
 * Apply Hindi-specific OCR corrections
 * Maps common OCR confusions in Hindi/Devanagari
 */
export function applyHindiCorrections(text: string): string {
  if (!text) return text;
  
  // Common OCR confusions in Devanagari
  const corrections: Record<string, string> = {
    // Similar-looking characters
    'रन': 'रण',
    'धन': 'धन', // Keep as is (common word)
    'बी': 'बि',
    'कि': 'की',
    
    // Common word corrections
    'नकद': 'नकद', // Cash (already correct)
    'उधार': 'उधार', // Credit (already correct)
    'जमा': 'जमा', // Deposit (already correct)
    'निकासी': 'निकासी', // Withdrawal (already correct)
    
    // Matras (vowel signs) corrections
    'ि‌': 'ि', // Remove zero-width joiner
    '‌ा': 'ा', // Remove zero-width joiner
  };
  
  let corrected = text;
  
  Object.entries(corrections).forEach(([wrong, right]) => {
    corrected = corrected.replace(new RegExp(wrong, 'g'), right);
  });
  
  // Remove zero-width characters that cause issues
  corrected = corrected.replace(/[\u200B-\u200D\uFEFF]/g, '');
  
  return corrected;
}

/**
 * Post-process OCR results with all pipeline functions
 * Returns enhanced results with suggestions and confidence per field
 */
export interface ProcessedField {
  raw: string;
  processed: string;
  confidence: number;
  suggestions?: string[];
  metadata?: Record<string, unknown>;
}

export interface PostProcessResult {
  date: ProcessedField;
  amount: ProcessedField;
  party: ProcessedField;
  notes: ProcessedField;
  gst?: ProcessedField;
}

export function postProcessOCRResult(
  recognizedText: string,
  confidence: number,
  locale: string = 'en-IN'
): PostProcessResult {
  // Apply Hindi corrections if applicable
  const correctedText = locale.startsWith('hi') 
    ? applyHindiCorrections(recognizedText) 
    : recognizedText;
  
  // Normalize numbers
  const normalized = normalizeNumbers(correctedText);
  
  // Parse date
  const dateResult = parseDate(normalized);
  const dateConfidence = dateResult ? Math.min(confidence * 1.1, 1.0) : confidence * 0.5;
  
  // Parse amount
  const { amount, raw: amountRaw } = parseCurrency(normalized);
  const amountConfidence = amount !== null ? Math.min(confidence * 1.1, 1.0) : confidence * 0.5;
  
  // Detect GST
  const gstNumber = detectGST(normalized);
  const gstConfidence = gstNumber ? Math.min(confidence * 1.05, 1.0) : confidence * 0.3;
  
  // Extract party name (simple heuristic: capitalized words)
  const partyMatch = normalized.match(/(?:to|from|party|customer):\s*([A-Za-z\s]+)/i);
  const party = partyMatch ? partyMatch[1].trim() : '';
  const partyConfidence = party ? confidence * 0.9 : confidence * 0.6;
  
  return {
    date: {
      raw: recognizedText,
      processed: dateResult || '',
      confidence: dateConfidence,
      suggestions: dateResult ? [dateResult] : [],
      metadata: { format: 'yyyy-MM-dd' }
    },
    amount: {
      raw: amountRaw,
      processed: amount !== null ? amount.toFixed(2) : '',
      confidence: amountConfidence,
      suggestions: amount !== null ? [`₹${amount.toFixed(2)}`] : [],
      metadata: { parsedAmount: amount }
    },
    party: {
      raw: party,
      processed: party,
      confidence: partyConfidence,
      suggestions: party ? [party] : []
    },
    notes: {
      raw: recognizedText,
      processed: normalized,
      confidence: confidence,
      suggestions: [normalized]
    },
    ...(gstNumber && {
      gst: {
        raw: normalized,
        processed: gstNumber,
        confidence: gstConfidence,
        suggestions: [gstNumber],
        metadata: { validated: true }
      }
    })
  };
}

export default {
  normalizeNumbers,
  parseCurrency,
  parseDate,
  detectGST,
  applyHindiCorrections,
  postProcessOCRResult
};
