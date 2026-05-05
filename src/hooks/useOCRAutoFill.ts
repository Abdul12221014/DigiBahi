/**
 * useOCRAutoFill
 * ───────────────
 * Bridge between OCR scan results and EntryForm fields.
 * Accepts parsed bill data, auto-fills setters, tracks analytics.
 *
 * Usage in EntryForm:
 *   const { autoFill } = useOCRAutoFill({ setAmount, setPartyName, ... });
 *   // After OCR scan completes:
 *   autoFill(parsedFields);
 */

import { useCallback } from 'react';
import { analytics } from '@/lib/analytics';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedBillFields {
  amount?:       number;
  party_name?:   string;
  date?:         string;   // YYYY-MM-DD
  description?:  string;
  reference_no?: string;
  confidence:    number;   // 0.0 – 1.0
}

export interface AutoFillSetters {
  setAmount:      (v: string) => void;
  setPartyName:   (v: string) => void;
  setDate:        (v: string) => void;
  setDescription: (v: string) => void;
  setReferenceNo: (v: string) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOCRAutoFill(setters: AutoFillSetters) {
  const autoFill = useCallback(
    (parsed: ParsedBillFields) => {
      analytics.track('ocr_scan_completed', {
        confidence: parsed.confidence,
        fields:     Object.keys(parsed).filter(k => k !== 'confidence' && parsed[k as keyof ParsedBillFields]),
      });

      let fieldsFilled = 0;

      // High-stakes fields (amount, date) require minimum confidence to auto-fill
      const HIGH_STAKES_THRESHOLD = 0.5;
      const highStakes = parsed.confidence >= HIGH_STAKES_THRESHOLD;

      if (highStakes && parsed.amount && parsed.amount > 0) {
        setters.setAmount(parsed.amount.toString());
        fieldsFilled++;
      }
      if (parsed.party_name?.trim()) {
        setters.setPartyName(parsed.party_name.trim());
        fieldsFilled++;
      }
      if (highStakes && parsed.date?.match(/^\d{4}-\d{2}-\d{2}$/)) {
        setters.setDate(parsed.date);
        fieldsFilled++;
      }
      if (parsed.description?.trim()) {
        setters.setDescription(parsed.description.trim());
        fieldsFilled++;
      }
      if (parsed.reference_no?.trim()) {
        setters.setReferenceNo(parsed.reference_no.trim());
        fieldsFilled++;
      }

      analytics.track('ocr_autofill_accepted', {
        fields_filled: fieldsFilled,
        confidence:    parsed.confidence,
      });

      if (fieldsFilled > 0) {
        const pct = Math.round(parsed.confidence * 100);
        if (parsed.confidence >= 0.8) {
          toast.success(`Scanned! ${fieldsFilled} fields filled (${pct}% confidence). Review and Save & Share.`);
        } else if (parsed.confidence >= 0.5) {
          toast.info(`Scanned ${fieldsFilled} fields (${pct}% confidence). Please review before sharing.`);
        } else {
          toast.warning(`Low confidence scan (${pct}%). Please check all fields carefully.`);
        }
      } else {
        toast.error('Could not extract any fields from the scan. Please enter manually.');
      }
    },
    [setters],
  );

  return { autoFill };
}
