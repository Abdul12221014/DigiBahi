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

import { useCallback, useState } from 'react';
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

// Fields that were OCR-filled at medium confidence — needs user verification
export type OCRFilledFields = Partial<Record<'amount' | 'party_name' | 'date' | 'description' | 'reference_no', boolean>>;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOCRAutoFill(setters: AutoFillSetters) {
  // Tracks which fields were filled at medium (0.5–0.79) confidence — shown with yellow ring
  const [ocrLowConfidenceFields, setOCRLowConfidenceFields] = useState<OCRFilledFields>({});

  const clearOCRHighlight = useCallback((field: keyof OCRFilledFields) => {
    setOCRLowConfidenceFields(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const autoFill = useCallback(
    (parsed: ParsedBillFields) => {
      analytics.track('ocr_scan_completed', {
        confidence: parsed.confidence,
        fields:     Object.keys(parsed).filter(k => k !== 'confidence' && parsed[k as keyof ParsedBillFields]),
      });

      const isLowConf = parsed.confidence >= 0.5 && parsed.confidence < 0.8;
      const filled: OCRFilledFields = {};
      let fieldsFilled = 0;

      // Confidence thresholds per field — party_name drives GST filing accuracy
      // so it requires higher confidence than descriptive fields.
      const AMOUNT_DATE_THRESHOLD = 0.5;
      const PARTY_NAME_THRESHOLD  = 0.6;
      const DESCRIPTION_THRESHOLD = 0.0;

      if (parsed.confidence >= AMOUNT_DATE_THRESHOLD && parsed.amount && parsed.amount > 0) {
        setters.setAmount(parsed.amount.toString());
        if (isLowConf) filled.amount = true;
        fieldsFilled++;
      }
      if (parsed.party_name?.trim() && parsed.confidence >= PARTY_NAME_THRESHOLD) {
        setters.setPartyName(parsed.party_name.trim());
        if (isLowConf) filled.party_name = true;
        fieldsFilled++;
      }
      if (parsed.confidence >= AMOUNT_DATE_THRESHOLD && parsed.date?.match(/^\d{4}-\d{2}-\d{2}$/)) {
        setters.setDate(parsed.date);
        if (isLowConf) filled.date = true;
        fieldsFilled++;
      }
      if (parsed.description?.trim() && parsed.confidence >= DESCRIPTION_THRESHOLD) {
        setters.setDescription(parsed.description.trim());
        if (isLowConf) filled.description = true;
        fieldsFilled++;
      }
      if (parsed.reference_no?.trim() && parsed.confidence >= DESCRIPTION_THRESHOLD) {
        setters.setReferenceNo(parsed.reference_no.trim());
        if (isLowConf) filled.reference_no = true;
        fieldsFilled++;
      }

      setOCRLowConfidenceFields(isLowConf ? filled : {});

      analytics.track('ocr_autofill_accepted', {
        fields_filled: fieldsFilled,
        confidence:    parsed.confidence,
      });

      if (fieldsFilled > 0) {
        const pct = Math.round(parsed.confidence * 100);
        if (parsed.confidence >= 0.8) {
          toast.success(`Scanned! ${fieldsFilled} fields filled (${pct}% confidence). Review and Save & Share.`);
        } else if (parsed.confidence >= 0.5) {
          toast.warning(`Scanned ${fieldsFilled} fields (${pct}% confidence) — highlighted fields need verification.`);
        } else {
          toast.warning(`Low confidence scan (${pct}%). Please check all fields carefully.`);
        }
      } else {
        toast.error('Could not extract any fields from the scan. Please enter manually.');
      }
    },
    [setters],
  );

  return { autoFill, ocrLowConfidenceFields, clearOCRHighlight };
}
