/**
 * ConsentModal Component
 * 
 * Privacy-first consent UI for OCR telemetry and federated learning.
 * Shows when user first triggers OCR or opens privacy settings.
 * 
 * Complies with privacy-first design: explicit consent required before any telemetry.
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Info, AlertTriangle } from 'lucide-react';

export interface ConsentRecord {
  version: string;
  timestamp: number;
  accepted: boolean;
  scope: Array<'ocr' | 'federated'>;
  expiresAt?: number;
}

interface ConsentModalProps {
  open: boolean;
  onClose: () => void;
  onAccept: (consent: ConsentRecord) => void;
  onDecline: () => void;
  context?: 'ocr' | 'federated' | 'settings';
}

export const ConsentModal: React.FC<ConsentModalProps> = ({
  open,
  onClose,
  onAccept,
  onDecline,
  context = 'ocr',
}) => {
  const [ocrConsent, setOcrConsent] = useState(false);
  const [federatedConsent, setFederatedConsent] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleAccept = () => {
    const scope: Array<'ocr' | 'federated'> = [];
    if (ocrConsent) scope.push('ocr');
    if (federatedConsent) scope.push('federated');

    const consent: ConsentRecord = {
      version: '1.0',
      timestamp: Date.now(),
      accepted: scope.length > 0,
      scope,
      expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000), // 1 year
    };

    onAccept(consent);
    onClose();
  };

  const handleDecline = () => {
    const consent: ConsentRecord = {
      version: '1.0',
      timestamp: Date.now(),
      accepted: false,
      scope: [],
    };

    onDecline();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <DialogTitle>Privacy & Data Collection Consent</DialogTitle>
          </div>
          <DialogDescription>
            DigBahi Accounting respects your privacy. We collect minimal data to improve OCR accuracy and provide you with better features.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Main explanation */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>You are in control.</strong> This app works completely offline. Telemetry is optional and encrypted locally before storage.
            </AlertDescription>
          </Alert>

          {/* OCR Telemetry Consent */}
          <div className="space-y-2 p-4 border rounded-lg">
            <div className="flex items-start gap-3">
              <Checkbox
                id="ocr-consent"
                checked={ocrConsent}
                onCheckedChange={(checked) => setOcrConsent(checked as boolean)}
              />
              <div className="flex-1">
                <label
                  htmlFor="ocr-consent"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Allow OCR Telemetry Collection
                </label>
                <p className="text-sm text-muted-foreground mt-1">
                  Collect OCR recognition data (text, confidence scores, corrections) to improve accuracy over time.
                </p>
              </div>
            </div>

            {showDetails && (
              <div className="mt-3 pl-7 space-y-2 text-sm text-muted-foreground">
                <p><strong>What we collect:</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Recognized text and confidence scores</li>
                  <li>User corrections (when you fix OCR mistakes)</li>
                  <li>Image hashes (NOT actual images)</li>
                  <li>Language and format settings</li>
                  <li>Timestamp and device type</li>
                </ul>
                <p><strong>What we DON'T collect:</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Your actual handwritten images</li>
                  <li>Personal information or names</li>
                  <li>Account numbers or sensitive data</li>
                  <li>Location or IP address</li>
                </ul>
                <p><strong>How it's stored:</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Encrypted locally with AES-GCM encryption</li>
                  <li>Stored only on your device (IndexedDB)</li>
                  <li>Never sent to servers without explicit action</li>
                </ul>
              </div>
            )}
          </div>

          {/* Federated Learning Consent */}
          <div className="space-y-2 p-4 border rounded-lg">
            <div className="flex items-start gap-3">
              <Checkbox
                id="federated-consent"
                checked={federatedConsent}
                onCheckedChange={(checked) => setFederatedConsent(checked as boolean)}
              />
              <div className="flex-1">
                <label
                  htmlFor="federated-consent"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Enable Federated Learning (Optional)
                </label>
                <p className="text-sm text-muted-foreground mt-1">
                  Contribute encrypted model updates to improve OCR for all users, without sharing your data.
                </p>
              </div>
            </div>

            {showDetails && (
              <div className="mt-3 pl-7 space-y-2 text-sm text-muted-foreground">
                <p><strong>How it works:</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Your device trains a local OCR model on your corrections</li>
                  <li>Only <strong>model updates</strong> (mathematical weights) are shared</li>
                  <li>Updates are encrypted with AES-GCM before transmission</li>
                  <li>Your actual data never leaves your device</li>
                </ul>
                <p><strong>Benefits:</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Better OCR accuracy for everyone over time</li>
                  <li>Support for regional handwriting styles</li>
                  <li>Privacy-preserving collaborative learning</li>
                </ul>
              </div>
            )}
          </div>

          {/* Learn More Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full"
          >
            {showDetails ? 'Hide Details' : 'Show Detailed Information'}
          </Button>

          {/* Warning if declining */}
          {!ocrConsent && !federatedConsent && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Without consent, OCR improvements and adaptive learning will be disabled. The app will continue to work, but accuracy may not improve over time.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleDecline}>
            Decline All
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!ocrConsent && !federatedConsent}
          >
            Accept Selected ({ocrConsent && federatedConsent ? 'Both' : ocrConsent ? 'OCR Only' : federatedConsent ? 'Federated Only' : 'None'})
          </Button>
        </DialogFooter>

        <p className="text-xs text-muted-foreground text-center pt-2">
          You can change your consent preferences anytime in Settings → Privacy.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default ConsentModal;
