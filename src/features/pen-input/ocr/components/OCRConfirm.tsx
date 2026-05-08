import React, { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, Edit3, Calendar, DollarSign, User, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { saveOCRTelemetry, hasConsent, saveConsent, getConsent, type ConsentRecord, type OCRTelemetry } from '@/lib/localStore';
import { ConsentModal } from '@/components/ConsentModal';

interface OCRField {
  id: string;
  label: string;
  value: string;
  confidence: number;
  icon: React.ReactNode;
  placeholder: string;
}

interface OCRConfirmProps {
  recognizedText: string;
  confidence: number;
  imageHash: string;
  onConfirm: (fields: OCRField[]) => void;
  onCancel: () => void;
}

export function OCRConfirm({ 
  recognizedText, 
  confidence, 
  imageHash, 
  onConfirm, 
  onCancel 
}: OCRConfirmProps) {
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [pendingTelemetry, setPendingTelemetry] = useState<OCRTelemetry | null>(null);
  
  // Parse recognized text to extract fields
  const parseTextToFields = useCallback((text: string): OCRField[] => {
    // Simple parsing logic - can be enhanced with ML
    const lines = text.split('\n').filter(line => line.trim());
    
    // Try to extract date (DD/MM/YYYY, DD-MM-YYYY, or similar)
    const dateMatch = text.match(/\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})\b/);
    const date = dateMatch ? dateMatch[1] : '';
    
    // Try to extract amount (₹, Rs., or numbers)
    const amountMatch = text.match(/[₹Rs.]?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    const amount = amountMatch ? amountMatch[0] : '';
    
    // Try to extract party name (usually after "to", "from", "party", etc.)
    const partyMatch = text.match(/(?:to|from|party|customer):\s*([A-Za-z\s]+)/i);
    const party = partyMatch ? partyMatch[1].trim() : '';
    
    // Rest of text as notes
    const notes = text
      .replace(dateMatch?.[0] || '', '')
      .replace(amountMatch?.[0] || '', '')
      .replace(partyMatch?.[0] || '', '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return [
      {
        id: 'date',
        label: 'Date',
        value: date,
        confidence: confidence * 0.9, // Slightly lower confidence for parsed fields
        icon: <Calendar className="w-4 h-4" />,
        placeholder: 'DD/MM/YYYY'
      },
      {
        id: 'amount',
        label: 'Amount',
        value: amount,
        confidence: confidence * 0.95,
        icon: <DollarSign className="w-4 h-4" />,
        placeholder: '₹0.00'
      },
      {
        id: 'party',
        label: 'Party Name',
        value: party,
        confidence: confidence * 0.8,
        icon: <User className="w-4 h-4" />,
        placeholder: 'Customer/Vendor name'
      },
      {
        id: 'notes',
        label: 'Notes/Description',
        value: notes,
        confidence: confidence * 0.85,
        icon: <FileText className="w-4 h-4" />,
        placeholder: 'Transaction description...'
      }
    ];
  }, [confidence]);

  const [fields, setFields] = useState<OCRField[]>(() => parseTextToFields(recognizedText));
  const [editingField, setEditingField] = useState<string | null>(null);

  const updateField = useCallback((fieldId: string, newValue: string) => {
    setFields(prev => prev.map(field => 
      field.id === fieldId ? { ...field, value: newValue } : field
    ));
  }, []);

  const getConfidenceColor = (conf: number): string => {
    if (conf >= 0.8) return 'bg-green-100 text-green-800 border-green-200';
    if (conf >= 0.6) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  const handleConfirm = useCallback(async () => {
    // Validate required fields
    const requiredFields = ['date', 'amount'];
    const missingFields = requiredFields.filter(fieldId => {
      const field = fields.find(f => f.id === fieldId);
      return !field || !field.value.trim();
    });

    if (missingFields.length > 0) {
      toast.error('Please fill in required fields: Date and Amount');
      return;
    }

    // Extended telemetry with all fields
    const telemetry = {
      id: `ocr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      imageHash,
      recognizedText,
      correctedText: fields.map(f => `${f.label}: ${f.value}`).join(', '),
      confidence,
      format: 'ledger-entry',
      deviceType: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop',
      screenDPI: window.devicePixelRatio * 96,
      strokeCount: 0, // Will be populated by parent
      sessionId: sessionStorage.getItem('sessionId') || `session_${Date.now()}`,
      userLang: navigator.language || 'en-IN',
      fields: fields.reduce((acc, field) => {
        acc[field.id] = field.value;
        return acc;
      }, {} as Record<string, string>)
    };

    // Save to IndexedDB
    // Check consent before saving telemetry
    // Check if we need to show consent modal
    const currentConsent = await getConsent();
    
    if (!currentConsent || !currentConsent.accepted) {
      // First time or no consent - show consent modal
      setPendingTelemetry(telemetry);
      setShowConsentModal(true);
      return;
    }
    
    if (await hasConsent('ocr')) {
      // User has already consented - save telemetry
      try {
        await saveOCRTelemetry(telemetry);
        console.log('[OCRConfirm] Telemetry saved with user consent');
      } catch (error) {
        console.error('Failed to save telemetry:', error);
      }
    } else {
      console.log('[OCRConfirm] Telemetry not saved - user declined consent');
    }
    
    // Call parent callback - parent will handle ledger entry creation
    onConfirm(fields);
    toast.success('OCR result confirmed and saved');
  }, [fields, imageHash, recognizedText, confidence, onConfirm]);

  const handleConsentDecision = useCallback(async (consent: ConsentRecord) => {
    // Save consent record
    await saveConsent(consent);
    setShowConsentModal(false);

    if (consent.accepted && consent.scope.includes('ocr') && pendingTelemetry) {
      // User granted consent - save the pending telemetry
      try {
        await saveOCRTelemetry(pendingTelemetry);
        console.log('[OCRConfirm] Telemetry saved after consent granted');
        toast.success('Thank you! Your data will help improve OCR accuracy.');
      } catch (error) {
        console.error('Failed to save telemetry:', error);
      }
    } else {
      console.log('[OCRConfirm] User declined telemetry consent');
      toast.info('OCR telemetry disabled. You can enable it anytime in Settings.');
    }

    setPendingTelemetry(null);
    
    // Continue with confirmation (ledger entry creation)
    if (fields) {
      onConfirm(fields);
      toast.success('OCR result confirmed and saved');
    }
  }, [pendingTelemetry, fields, onConfirm]);

  const handleCancel = useCallback(() => {
    onCancel();
    toast.info('OCR result cancelled');
  }, [onCancel]);

  return (
    <>
      {/* Consent Modal */}
      <ConsentModal
        open={showConsentModal}
        onClose={() => setShowConsentModal(false)}
        onAccept={handleConsentDecision}
        onDecline={() => {
          setShowConsentModal(false);
          setPendingTelemetry(null);
          toast.info('OCR telemetry disabled. You can enable it anytime in Settings.');
        }}
        context="ocr"
      />

      {/* Main OCR Confirm Dialog */}
      <Card className="fixed inset-4 z-50 bg-background border shadow-2xl overflow-y-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Edit3 className="w-6 h-6" />
              Confirm OCR Result
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Review and edit the recognized fields before saving to ledger
            </p>
          </div>
          <Badge className={getConfidenceColor(confidence)}>
            {Math.round(confidence * 100)}% confidence
          </Badge>
        </div>

        {/* Original Text */}
        <Card className="p-4 bg-muted/50">
          <Label className="text-sm font-medium text-muted-foreground">Original Recognized Text:</Label>
          <p className="mt-2 text-sm italic">{recognizedText}</p>
        </Card>

        {/* Editable Fields */}
        <div className="grid gap-4">
          {fields.map((field) => (
            <Card key={field.id} className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 font-medium">
                    {field.icon}
                    {field.label}
                    {['date', 'amount'].includes(field.id) && (
                      <span className="text-red-500 text-xs">*</span>
                    )}
                  </Label>
                  <Badge className={getConfidenceColor(field.confidence)}>
                    {Math.round(field.confidence * 100)}%
                  </Badge>
                </div>
                
                {field.id === 'notes' ? (
                  <Textarea
                    value={field.value}
                    onChange={(e) => updateField(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    className="min-h-[80px]"
                  />
                ) : (
                  <Input
                    value={field.value}
                    onChange={(e) => updateField(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full"
                  />
                )}
              </div>
            </Card>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90"
          >
            <Check className="w-4 h-4" />
            Confirm & Save
          </Button>
        </div>
      </div>
    </Card>
    </>
  );
}

export default OCRConfirm;
