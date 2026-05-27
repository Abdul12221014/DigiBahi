import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OTPEvent } from '../../types/delivery.types';

const mockOtpEvents = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { otpEvents: mockOtpEvents } }));

import { logOTPEvent, hashOTPFingerprint } from '../otp-event.service';

beforeEach(() => {
  vi.clearAllMocks();
  mockOtpEvents.add.mockResolvedValue(1);
});

describe('hashOTPFingerprint', () => {
  it('returns a 64-char lowercase hex SHA-256 string', async () => {
    const hash = await hashOTPFingerprint('123456', '+919876543210', '2026-05-27T10:00:00.000Z');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('produces different hashes for different OTP values', async () => {
    const ts = '2026-05-27T10:00:00.000Z';
    const phone = '+919876543210';
    const h1 = await hashOTPFingerprint('111111', phone, ts);
    const h2 = await hashOTPFingerprint('222222', phone, ts);
    expect(h1).not.toBe(h2);
  });

  it('never includes the raw OTP in its output', async () => {
    const otp = '987654';
    const hash = await hashOTPFingerprint(otp, '+919876543210', '2026-05-27T10:00:00.000Z');
    expect(hash).not.toContain(otp);
  });
});

describe('logOTPEvent', () => {
  it('stores a fingerprint when rawOTP is provided — raw OTP never in record', async () => {
    await logOTPEvent({
      eventType: 'sent',
      channel: 'whatsapp_api',
      customerPhone: '+919876543210',
      success: true,
      attemptNumber: 1,
      rawOTP: '123456',
    });

    const stored = mockOtpEvents.add.mock.calls[0][0] as OTPEvent;
    expect(stored.otpFingerprint).toHaveLength(64);
    expect(JSON.stringify(stored)).not.toContain('123456');
  });

  it('stores no fingerprint when rawOTP is omitted', async () => {
    await logOTPEvent({
      eventType: 'verified',
      channel: 'whatsapp_api',
      customerPhone: '+919876543210',
      success: true,
      attemptNumber: 1,
    });

    const stored = mockOtpEvents.add.mock.calls[0][0] as OTPEvent;
    expect(stored.otpFingerprint).toBeUndefined();
    expect(stored.eventType).toBe('verified');
  });

  it('stores failure reason on failed events', async () => {
    await logOTPEvent({
      eventType: 'failed',
      channel: 'whatsapp_api',
      customerPhone: '+919876543210',
      success: false,
      attemptNumber: 2,
      failureReason: 'invalid_otp',
    });

    const stored = mockOtpEvents.add.mock.calls[0][0] as OTPEvent;
    expect(stored.success).toBe(false);
    expect(stored.failureReason).toBe('invalid_otp');
    expect(stored.attemptNumber).toBe(2);
  });
});
