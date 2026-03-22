/**
 * Smart Parsing for Ledger Entry Text
 * 
 * Extracts structured data from OCR-recognized text for ledger entries.
 * Handles common formats like: "Sale ₹5000 to Customer A on 15/01/2025"
 */

import { parseCurrency, parseDate } from '@/features/pen-input/ocr/postprocess';
import type { LedgerEntry } from '@/lib/db';

export interface ParsedLedgerFields {
  type?: LedgerEntry['type'];
  amount?: number;
  party_name?: string;
  date?: string;
  description?: string;
  reference_no?: string;
  tags?: string;
}

/**
 * Detect transaction type from text
 */
function detectTransactionType(text: string): LedgerEntry['type'] | undefined {
  const normalized = text.toLowerCase();
  
  // Sale keywords
  if (/\b(sale|sold|sell|invoice|billing)\b/i.test(normalized)) {
    return 'sale';
  }
  
  // Purchase keywords
  if (/\b(purchase|bought|buy|procurement)\b/i.test(normalized)) {
    return 'purchase';
  }
  
  // Expense keywords
  if (/\b(expense|spent|spending|cost|payment)\b/i.test(normalized)) {
    return 'expense';
  }
  
  // Receipt keywords
  if (/\b(receipt|received|collection|payment received)\b/i.test(normalized)) {
    return 'receipt';
  }
  
  return undefined;
}

/**
 * Extract party name from text
 * Looks for patterns like: "to Customer A", "from Vendor B", "party: Name"
 */
function extractPartyName(text: string): string | undefined {
  // Pattern 1: "to [Name]" or "from [Name]"
  const toFromMatch = text.match(/\b(?:to|from)\s+([A-Za-z][A-Za-z\s]{2,30})\b/i);
  if (toFromMatch) {
    return toFromMatch[1].trim();
  }
  
  // Pattern 2: "party: [Name]" or "customer: [Name]"
  const partyMatch = text.match(/\b(?:party|customer|vendor|client):\s*([A-Za-z][A-Za-z\s]{2,30})\b/i);
  if (partyMatch) {
    return partyMatch[1].trim();
  }
  
  // Pattern 3: Capitalized words after amount (common pattern: "₹5000 Customer Name")
  const afterAmountMatch = text.match(/₹?\s*\d+[\s,]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (afterAmountMatch) {
    return afterAmountMatch[1].trim();
  }
  
  return undefined;
}

/**
 * Extract reference number (invoice, receipt number, etc.)
 */
function extractReferenceNo(text: string): string | undefined {
  // Pattern 1: "Invoice #123" or "Bill #456"
  const hashMatch = text.match(/\b(?:invoice|bill|receipt|ref)[\s#:]*([A-Z0-9-]{3,20})\b/i);
  if (hashMatch) {
    return hashMatch[1].trim();
  }
  
  // Pattern 2: "INV-2025-001" or "BILL/1234"
  const refMatch = text.match(/\b(?:INV|BILL|REC|REF)[-/]?([A-Z0-9-]{3,20})\b/i);
  if (refMatch) {
    return refMatch[0].trim();
  }
  
  return undefined;
}

/**
 * Extract tags from text
 */
function extractTags(text: string): string | undefined {
  const tags: string[] = [];
  
  // Common tag keywords
  const tagKeywords = {
    'urgent': /\b(urgent|immediate|asap)\b/i,
    'payment-due': /\b(due|pending|outstanding)\b/i,
    'recurring': /\b(recurring|monthly|weekly|daily)\b/i,
    'cash': /\b(cash|nagad)\b/i,
    'credit': /\b(credit|udhar|udhaar)\b/i,
  };
  
  Object.entries(tagKeywords).forEach(([tag, regex]) => {
    if (regex.test(text)) {
      tags.push(tag);
    }
  });
  
  return tags.length > 0 ? tags.join(', ') : undefined;
}

/**
 * Generate description from remaining text after extracting other fields
 */
function generateDescription(
  originalText: string,
  extractedFields: Partial<ParsedLedgerFields>
): string {
  let description = originalText;
  
  // Remove extracted amount
  if (extractedFields.amount) {
    description = description.replace(/₹?\s*\d+([.,]\d{2})?/g, '').trim();
  }
  
  // Remove extracted date
  if (extractedFields.date) {
    description = description.replace(/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/g, '').trim();
  }
  
  // Remove party name patterns
  if (extractedFields.party_name) {
    description = description
      .replace(new RegExp(`\\b(?:to|from)\\s+${extractedFields.party_name}\\b`, 'gi'), '')
      .replace(new RegExp(`\\b(?:party|customer|vendor):\\s*${extractedFields.party_name}\\b`, 'gi'), '')
      .trim();
  }
  
  // Remove reference number patterns
  if (extractedFields.reference_no) {
    description = description
      .replace(new RegExp(`\\b(?:invoice|bill|receipt|ref)[\\s#:]*${extractedFields.reference_no}\\b`, 'gi'), '')
      .trim();
  }
  
  // Remove transaction type keywords
  const typeKeywords = ['sale', 'purchase', 'expense', 'receipt', 'sold', 'bought', 'spent', 'received'];
  typeKeywords.forEach(keyword => {
    description = description.replace(new RegExp(`\\b${keyword}\\b`, 'gi'), '').trim();
  });
  
  // Clean up multiple spaces
  description = description.replace(/\s+/g, ' ').trim();
  
  // If description is too short or empty, use original text
  if (description.length < 3) {
    return originalText.trim();
  }
  
  return description;
}

/**
 * Main parsing function
 * Takes OCR-recognized text and extracts all ledger fields
 */
export function parseLedgerText(text: string): ParsedLedgerFields {
  if (!text || text.trim().length === 0) {
    return {};
  }
  
  const normalized = text.trim();
  
  // Extract structured fields
  const type = detectTransactionType(normalized);
  const { amount } = parseCurrency(normalized);
  const date = parseDate(normalized);
  const party_name = extractPartyName(normalized);
  const reference_no = extractReferenceNo(normalized);
  const tags = extractTags(normalized);
  
  // Build partial result
  const extractedFields: Partial<ParsedLedgerFields> = {
    ...(type && { type }),
    ...(amount !== null && { amount }),
    ...(date && { date }),
    ...(party_name && { party_name }),
    ...(reference_no && { reference_no }),
    ...(tags && { tags }),
  };
  
  // Generate description from remaining text
  const description = generateDescription(normalized, extractedFields);
  
  return {
    ...extractedFields,
    description: description || normalized, // Fallback to original if empty
  };
}

/**
 * Merge parsed fields with existing form values
 * Only overwrites if parsed value is more confident/better
 */
export function mergeParsedFields(
  parsed: ParsedLedgerFields,
  existing: Partial<ParsedLedgerFields>
): ParsedLedgerFields {
  return {
    // Use parsed value if available, otherwise keep existing
    type: parsed.type || existing.type,
    amount: parsed.amount !== undefined ? parsed.amount : existing.amount,
    date: parsed.date || existing.date,
    party_name: parsed.party_name || existing.party_name,
    reference_no: parsed.reference_no || existing.reference_no,
    tags: parsed.tags || existing.tags,
    description: parsed.description || existing.description,
  };
}

