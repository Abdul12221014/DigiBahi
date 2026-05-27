import { db } from '@/lib/db';
import type { OTPEvent, OTPEventType, OTPChannel } from '../types/delivery.types';

export async function hashOTPFingerprint(
  otp: string,
  phone: string,
  timestamp: string,
): Promise<string> {
  const data = `${otp}:${phone}:${timestamp}`;
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

interface LogOTPEventInput {
  eventType:      OTPEventType;
  channel:        OTPChannel;
  customerPhone:  string;     // E.164
  invoiceNumber?: string;
  deliveryId?:    number;
  rawOTP?:        string;     // hashed before storage — NEVER persisted
  success:        boolean;
  failureReason?: string;
  attemptNumber:  number;
  deviceId?:      string;
}

export async function logOTPEvent(input: LogOTPEventInput): Promise<number> {
  const timestamp = new Date().toISOString();

  const otpFingerprint = input.rawOTP
    ? await hashOTPFingerprint(input.rawOTP, input.customerPhone, timestamp)
    : undefined;

  const event: OTPEvent = {
    eventType:      input.eventType,
    channel:        input.channel,
    customerPhone:  input.customerPhone,
    invoiceNumber:  input.invoiceNumber,
    deliveryId:     input.deliveryId,
    otpFingerprint,
    success:        input.success,
    failureReason:  input.failureReason,
    attemptNumber:  input.attemptNumber,
    timestamp,
    deviceId:       input.deviceId,
  };

  return db.otpEvents.add(event);
}
