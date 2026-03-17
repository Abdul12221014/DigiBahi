/**
 * Consent Management for DigBahi
 * 
 * Handles user consent for telemetry, federated learning, and analytics.
 * Stores consent state in localStorage and logs to audit trail.
 */

export type ConsentType = 'ocr_telemetry' | 'federated_learning' | 'analytics';

export interface ConsentRecord {
  type: ConsentType;
  granted: boolean;
  timestamp: number;
  version: string; // Privacy policy version
}

const CONSENT_KEY_PREFIX = 'digbahi_consent_';
const CONSENT_VERSION = 'v1.0.0'; // Update when privacy policy changes

/**
 * Check if user has granted consent for a specific type
 */
export function hasConsent(type: ConsentType): boolean {
  try {
    const key = `${CONSENT_KEY_PREFIX}${type}`;
    const stored = localStorage.getItem(key);
    
    if (!stored) return false;
    
    const record: ConsentRecord = JSON.parse(stored);
    
    // Check if consent is still valid (version matches)
    if (record.version !== CONSENT_VERSION) {
      return false; // Re-prompt if policy changed
    }
    
    return record.granted;
  } catch (error) {
    console.error('[Consent] Error checking consent:', error);
    return false;
  }
}

/**
 * Save user consent decision
 */
export function saveConsent(type: ConsentType, granted: boolean): void {
  try {
    const record: ConsentRecord = {
      type,
      granted,
      timestamp: Date.now(),
      version: CONSENT_VERSION,
    };
    
    const key = `${CONSENT_KEY_PREFIX}${type}`;
    localStorage.setItem(key, JSON.stringify(record));
    
    // Log to audit trail (will be implemented in audit service)
    logConsentEvent(record);
    
    console.log(`[Consent] ${type}: ${granted ? 'granted' : 'declined'}`);
  } catch (error) {
    console.error('[Consent] Error saving consent:', error);
  }
}

/**
 * Revoke consent for a specific type
 */
export function revokeConsent(type: ConsentType): void {
  saveConsent(type, false);
}

/**
 * Get all consent records
 */
export function getAllConsents(): Record<ConsentType, boolean> {
  return {
    ocr_telemetry: hasConsent('ocr_telemetry'),
    federated_learning: hasConsent('federated_learning'),
    analytics: hasConsent('analytics'),
  };
}

/**
 * Clear all consent records (useful for testing or data deletion)
 */
export function clearAllConsents(): void {
  const types: ConsentType[] = ['ocr_telemetry', 'federated_learning', 'analytics'];
  
  types.forEach(type => {
    const key = `${CONSENT_KEY_PREFIX}${type}`;
    localStorage.removeItem(key);
  });
  
  console.log('[Consent] All consents cleared');
}

/**
 * Log consent event to audit trail
 * (Placeholder - will be integrated with audit service)
 */
function logConsentEvent(record: ConsentRecord): void {
  // TODO: Integrate with db.audit when audit service is ready
  const auditEntry = {
    timestamp: record.timestamp,
    action: record.granted ? 'consent_granted' : 'consent_declined',
    resource: record.type,
    metadata: {
      version: record.version,
    },
  };
  
  console.log('[Audit] Consent event:', auditEntry);
  
  // For now, store in a separate localStorage key for debugging
  try {
    const auditKey = 'digbahi_consent_audit';
    const existing = localStorage.getItem(auditKey);
    const audit = existing ? JSON.parse(existing) : [];
    
    audit.push(auditEntry);
    
    // Keep only last 100 entries
    if (audit.length > 100) {
      audit.splice(0, audit.length - 100);
    }
    
    localStorage.setItem(auditKey, JSON.stringify(audit));
  } catch (error) {
    console.error('[Audit] Error logging consent event:', error);
  }
}

/**
 * Check if consent modal should be shown for a given type
 * Returns true if user hasn't been prompted yet or if policy version changed
 */
export function shouldShowConsentModal(type: ConsentType): boolean {
  try {
    const key = `${CONSENT_KEY_PREFIX}${type}`;
    const stored = localStorage.getItem(key);
    
    // First time - show modal
    if (!stored) return true;
    
    const record: ConsentRecord = JSON.parse(stored);
    
    // Policy version changed - show modal again
    if (record.version !== CONSENT_VERSION) return true;
    
    // User already made a decision
    return false;
  } catch (error) {
    console.error('[Consent] Error checking if modal should show:', error);
    return true; // Show modal on error to be safe
  }
}

