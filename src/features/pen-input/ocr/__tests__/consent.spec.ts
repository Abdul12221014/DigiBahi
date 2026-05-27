/**
 * Consent Flow Tests
 * 
 * Tests for privacy-first telemetry gating:
 * - Consent accepted → telemetry saved
 * - Consent declined → telemetry NOT saved
 * - Consent revoked → blocks future telemetry
 * - Consent data encrypted in IndexedDB
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  saveConsent, 
  getConsent, 
  hasConsent, 
  revokeConsent,
  saveOCRTelemetry,
  ConsentRecord,
  OCRTelemetry,
  penDB
} from '@/lib/localStore';

describe('Consent Management', () => {
  beforeEach(async () => {
    // Clear database before each test
    await penDB.consent.clear();
    await penDB.ocrTelemetry.clear();
  });

  afterEach(async () => {
    // Cleanup
    await penDB.consent.clear();
    await penDB.ocrTelemetry.clear();
  });

  describe('Consent Storage', () => {
    it('should save and retrieve consent record', async () => {
      const consent: ConsentRecord = {
        version: '1.0',
        timestamp: Date.now(),
        accepted: true,
        scope: ['ocr', 'federated'],
      };

      await saveConsent(consent);
      const retrieved = await getConsent();

      expect(retrieved).toBeDefined();
      expect(retrieved?.accepted).toBe(true);
      expect(retrieved?.scope).toContain('ocr');
      expect(retrieved?.scope).toContain('federated');
    });

    it('should return most recent consent record', async () => {
      // Save first consent
      await saveConsent({
        version: '1.0',
        timestamp: Date.now() - 10000,
        accepted: true,
        scope: ['ocr'],
      });

      // Save second consent (more recent)
      await saveConsent({
        version: '1.0',
        timestamp: Date.now(),
        accepted: false,
        scope: [],
      });

      const current = await getConsent();
      expect(current?.accepted).toBe(false);
    });

    it('should return null if consent is expired', async () => {
      const expiredConsent: ConsentRecord = {
        version: '1.0',
        timestamp: Date.now() - 100000,
        accepted: true,
        scope: ['ocr'],
        expiresAt: Date.now() - 1000, // Expired 1 second ago
      };

      await saveConsent(expiredConsent);
      const retrieved = await getConsent();

      expect(retrieved).toBeNull();
    });

    it('should return null if consent is revoked', async () => {
      const revokedConsent: ConsentRecord = {
        version: '1.0',
        timestamp: Date.now(),
        accepted: true,
        scope: ['ocr'],
        revokedAt: Date.now(),
      };

      await saveConsent(revokedConsent);
      const retrieved = await getConsent();

      expect(retrieved).toBeNull();
    });
  });

  describe('Consent Scope Checks', () => {
    it('should return true when user has consented to OCR', async () => {
      await saveConsent({
        version: '1.0',
        timestamp: Date.now(),
        accepted: true,
        scope: ['ocr'],
      });

      expect(await hasConsent('ocr')).toBe(true);
    });

    it('should return false when user has not consented to OCR', async () => {
      await saveConsent({
        version: '1.0',
        timestamp: Date.now(),
        accepted: true,
        scope: ['federated'], // Only federated, not OCR
      });

      expect(await hasConsent('ocr')).toBe(false);
    });

    it('should return false when user declined all consent', async () => {
      await saveConsent({
        version: '1.0',
        timestamp: Date.now(),
        accepted: false,
        scope: [],
      });

      expect(await hasConsent('ocr')).toBe(false);
      expect(await hasConsent('federated')).toBe(false);
    });

    it('should return false when no consent record exists', async () => {
      expect(await hasConsent('ocr')).toBe(false);
      expect(await hasConsent('federated')).toBe(false);
    });
  });

  describe('Consent Revocation', () => {
    it('should revoke existing consent', async () => {
      // Save initial consent
      await saveConsent({
        version: '1.0',
        timestamp: Date.now(),
        accepted: true,
        scope: ['ocr', 'federated'],
      });

      expect(await hasConsent('ocr')).toBe(true);

      // Revoke consent
      await revokeConsent();

      // Check consent is revoked
      expect(await hasConsent('ocr')).toBe(false);
      expect(await hasConsent('federated')).toBe(false);

      const current = await getConsent();
      expect(current).toBeNull(); // Revoked consent returns null
    });

    it('should handle revoke when no consent exists', async () => {
      // Should not throw error
      await expect(revokeConsent()).resolves.not.toThrow();
    });
  });

  describe('Telemetry Gating', () => {
    it('should allow telemetry save when consent is granted', async () => {
      // Grant consent
      await saveConsent({
        version: '1.0',
        timestamp: Date.now(),
        accepted: true,
        scope: ['ocr'],
      });

      // Create telemetry
      const telemetry: OCRTelemetry = {
        id: 'test_telemetry_1',
        timestamp: Date.now(),
        imageHash: 'abc123',
        recognizedText: 'Test text',
        confidence: 0.95,
      };

      // Check consent before saving
      if (await hasConsent('ocr')) {
        await saveOCRTelemetry(telemetry);
      }

      // Verify telemetry was saved
      const count = await penDB.ocrTelemetry.count();
      expect(count).toBe(1);
    });

    it('should NOT save telemetry when consent is declined', async () => {
      // Decline consent
      await saveConsent({
        version: '1.0',
        timestamp: Date.now(),
        accepted: false,
        scope: [],
      });

      // Create telemetry
      const telemetry: OCRTelemetry = {
        id: 'test_telemetry_2',
        timestamp: Date.now(),
        imageHash: 'def456',
        recognizedText: 'Test text 2',
        confidence: 0.90,
      };

      // Check consent before saving (should block)
      if (await hasConsent('ocr')) {
        await saveOCRTelemetry(telemetry);
      }

      // Verify telemetry was NOT saved
      const count = await penDB.ocrTelemetry.count();
      expect(count).toBe(0);
    });

    it('should block telemetry after consent revocation', async () => {
      // Initially grant consent
      await saveConsent({
        version: '1.0',
        timestamp: Date.now(),
        accepted: true,
        scope: ['ocr'],
      });

      // Save first telemetry (should succeed)
      if (await hasConsent('ocr')) {
        await saveOCRTelemetry({
          id: 'test_1',
          timestamp: Date.now(),
          imageHash: 'hash1',
          recognizedText: 'First',
          confidence: 0.95,
        });
      }

      expect(await penDB.ocrTelemetry.count()).toBe(1);

      // Revoke consent
      await revokeConsent();

      // Try to save second telemetry (should be blocked)
      if (await hasConsent('ocr')) {
        await saveOCRTelemetry({
          id: 'test_2',
          timestamp: Date.now(),
          imageHash: 'hash2',
          recognizedText: 'Second',
          confidence: 0.90,
        });
      }

      // Should still be 1 (second telemetry blocked)
      expect(await penDB.ocrTelemetry.count()).toBe(1);
    });
  });

  describe('Data Encryption', () => {
    it('should encrypt consent data in IndexedDB', async () => {
      const consent: ConsentRecord = {
        version: '1.0',
        timestamp: Date.now(),
        accepted: true,
        scope: ['ocr', 'federated'],
      };

      await saveConsent(consent);

      // Get raw encrypted row from IndexedDB
      const row = await penDB.consent.orderBy('createdAt').reverse().first();

      // Use Object.prototype.toString for cross-realm ArrayBuffer check
      // (Node.js crypto returns ArrayBuffer from a different realm than jsdom's globalThis.ArrayBuffer)
      const isAB = (v: unknown) => Object.prototype.toString.call(v) === '[object ArrayBuffer]';
      expect(row).toBeDefined();
      expect(isAB(row?.payload)).toBe(true);
      expect(isAB(row?.iv)).toBe(true);
      expect(isAB(row?.salt)).toBe(true);

      // Payload should not be readable as plain text
      const payloadText = new TextDecoder().decode(row!.payload);
      expect(payloadText).not.toContain('ocr');
      expect(payloadText).not.toContain('federated');
    });

    it('should decrypt consent data correctly with correct PIN', async () => {
      const consent: ConsentRecord = {
        version: '1.0',
        timestamp: Date.now(),
        accepted: true,
        scope: ['ocr'],
      };

      const pin = 'test1234';
      await saveConsent(consent, pin);

      const retrieved = await getConsent(pin);
      expect(retrieved).toBeDefined();
      expect(retrieved?.scope).toContain('ocr');
    });
  });
});

