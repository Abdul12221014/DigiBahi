/**
 * Palm Rejection Unit Tests
 * 
 * Tests the 3-tier palm rejection system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePalmRejection } from '../hooks/usePalmRejection';

// Mock PointerEvent
class MockPointerEvent {
    pointerId: number;
    pointerType: string;
    width: number;
    height: number;
    clientX: number;
    clientY: number;
    target: HTMLElement;

    constructor(data: Partial<MockPointerEvent>) {
        this.pointerId = data.pointerId || 1;
        this.pointerType = data.pointerType || 'touch';
        this.width = data.width || 10;
        this.height = data.height || 10;
        this.clientX = data.clientX || 100;
        this.clientY = data.clientY || 100;
        this.target = data.target || document.createElement('canvas');
    }
}

describe('usePalmRejection', () => {
    beforeEach(() => {
        vi.clearAllTimers();
        vi.useFakeTimers();
    });

    describe('Tier 1: Immediate Size-Based Rejection', () => {
        it('should reject touches larger than threshold', () => {
            const { result } = renderHook(() => usePalmRejection());

            const largeTouch = new MockPointerEvent({
                width: 50,
                height: 50
            }) as unknown as PointerEvent;

            const check = result.current.checkImmediateRejection(largeTouch);

            expect(check.shouldReject).toBe(true);
            expect(check.reason).toContain('exceeds threshold');
        });

        it('should accept touches smaller than threshold', () => {
            const { result } = renderHook(() => usePalmRejection());

            const smallTouch = new MockPointerEvent({
                width: 15,
                height: 15
            }) as unknown as PointerEvent;

            const check = result.current.checkImmediateRejection(smallTouch);

            expect(check.shouldReject).toBe(false);
        });

        it('should use custom threshold when provided', () => {
            const { result } = renderHook(() =>
                usePalmRejection({ sizeThreshold: 40 })
            );

            const mediumTouch = new MockPointerEvent({
                width: 35,
                height: 35
            }) as unknown as PointerEvent;

            const check = result.current.checkImmediateRejection(mediumTouch);

            expect(check.shouldReject).toBe(false);
        });

        it('should reject touches in edge zone when enabled', () => {
            const { result } = renderHook(() =>
                usePalmRejection({
                    enableEdgeFiltering: true,
                    edgeRejectionZone: 0.15
                })
            );

            const canvas = document.createElement('canvas');
            canvas.height = 1000;

            const edgeTouch = new MockPointerEvent({
                width: 20,
                height: 20,
                clientY: 900, // 90% down the screen
                target: canvas
            }) as unknown as PointerEvent;

            // Mock getBoundingClientRect
            canvas.getBoundingClientRect = () => ({
                top: 0,
                left: 0,
                bottom: 1000,
                right: 800,
                width: 800,
                height: 1000,
                x: 0,
                y: 0,
                toJSON: () => ({})
            });

            const check = result.current.checkImmediateRejection(edgeTouch, 1000);

            expect(check.shouldReject).toBe(true);
            expect(check.reason).toContain('edge zone');
        });
    });

    describe('Tier 2: Temporal Delay', () => {
        it('should queue large touches for temporal delay', () => {
            const { result } = renderHook(() => usePalmRejection());

            const onAccept = vi.fn();
            const onReject = vi.fn();

            const largeTouch = new MockPointerEvent({
                pointerId: 1,
                width: 25,
                height: 25
            }) as unknown as PointerEvent;

            act(() => {
                result.current.queuePointerForDelay(largeTouch, onAccept, onReject);
            });

            // Should not accept immediately
            expect(onAccept).not.toHaveBeenCalled();

            // Should accept after delay
            act(() => {
                vi.advanceTimersByTime(40);
            });

            expect(onAccept).toHaveBeenCalledWith(largeTouch);
            expect(onReject).not.toHaveBeenCalled();
        });

        it('should accept small touches immediately (stylus)', () => {
            const { result } = renderHook(() => usePalmRejection());

            const onAccept = vi.fn();
            const onReject = vi.fn();

            const smallTouch = new MockPointerEvent({
                pointerId: 1,
                width: 10,
                height: 10
            }) as unknown as PointerEvent;

            act(() => {
                result.current.queuePointerForDelay(smallTouch, onAccept, onReject);
            });

            // Should accept immediately (no delay for stylus)
            expect(onAccept).toHaveBeenCalledWith(smallTouch);
        });

        it('should reject large touch when smaller touch appears', () => {
            const { result } = renderHook(() => usePalmRejection());

            const onAcceptPalm = vi.fn();
            const onRejectPalm = vi.fn();
            const onAcceptStylus = vi.fn();
            const onRejectStylus = vi.fn();

            // First: large touch (palm)
            const palmTouch = new MockPointerEvent({
                pointerId: 1,
                width: 30,
                height: 30
            }) as unknown as PointerEvent;

            act(() => {
                result.current.queuePointerForDelay(palmTouch, onAcceptPalm, onRejectPalm);
            });

            // Palm is queued, not accepted yet
            expect(onAcceptPalm).not.toHaveBeenCalled();

            // Second: small touch (stylus) appears within delay window
            const stylusTouch = new MockPointerEvent({
                pointerId: 2,
                width: 8,
                height: 8
            }) as unknown as PointerEvent;

            act(() => {
                result.current.queuePointerForDelay(stylusTouch, onAcceptStylus, onRejectStylus);
            });

            // Stylus should be accepted immediately
            expect(onAcceptStylus).toHaveBeenCalledWith(stylusTouch);

            // Palm should be rejected
            expect(onRejectPalm).toHaveBeenCalledWith(1, expect.stringContaining('smaller stylus'));
            expect(onAcceptPalm).not.toHaveBeenCalled();
        });
    });

    describe('Tier 3: Velocity Analysis', () => {
        it('should track pointer movement', () => {
            const { result } = renderHook(() => usePalmRejection());

            const touch = new MockPointerEvent({
                pointerId: 1,
                width: 28,
                height: 28,
                clientX: 100,
                clientY: 100
            }) as unknown as PointerEvent;

            act(() => {
                result.current.registerPointerDown(touch);
            });

            // Move pointer
            const velocityCheck1 = result.current.trackPointerMovement(1, 105, 105);
            expect(velocityCheck1.shouldReject).toBe(false);

            // Advance time past 100ms
            act(() => {
                vi.advanceTimersByTime(150);
            });

            // Check again - should still not reject (has moved)
            const velocityCheck2 = result.current.trackPointerMovement(1, 110, 110);
            expect(velocityCheck2.shouldReject).toBe(false);
        });

        it('should reject large stationary touches', () => {
            const { result } = renderHook(() => usePalmRejection());

            const largeTouch = new MockPointerEvent({
                pointerId: 1,
                width: 35,
                height: 35,
                clientX: 100,
                clientY: 100
            }) as unknown as PointerEvent;

            act(() => {
                result.current.registerPointerDown(largeTouch);
            });

            // Minimal movement (< 2px)
            act(() => {
                result.current.trackPointerMovement(1, 100.5, 100.5);
            });

            // Advance time past 100ms
            act(() => {
                vi.advanceTimersByTime(150);
            });

            // Check - should reject (large + stationary)
            const velocityCheck = result.current.trackPointerMovement(1, 101, 101);
            expect(velocityCheck.shouldReject).toBe(true);
            expect(velocityCheck.reason).toContain('Stationary');
        });

        it('should not reject small stationary touches', () => {
            const { result } = renderHook(() => usePalmRejection());

            const smallTouch = new MockPointerEvent({
                pointerId: 1,
                width: 15,
                height: 15,
                clientX: 100,
                clientY: 100
            }) as unknown as PointerEvent;

            act(() => {
                result.current.registerPointerDown(smallTouch);
            });

            // Minimal movement
            act(() => {
                result.current.trackPointerMovement(1, 100.5, 100.5);
            });

            // Advance time
            act(() => {
                vi.advanceTimersByTime(150);
            });

            // Should not reject (small touch, even if stationary)
            const velocityCheck = result.current.trackPointerMovement(1, 101, 101);
            expect(velocityCheck.shouldReject).toBe(false);
        });
    });

    describe('Cleanup', () => {
        it('should unregister pointers on pointer up', () => {
            const { result } = renderHook(() => usePalmRejection());

            const touch = new MockPointerEvent({
                pointerId: 1,
                width: 20,
                height: 20
            }) as unknown as PointerEvent;

            act(() => {
                result.current.registerPointerDown(touch);
            });

            act(() => {
                result.current.unregisterPointer(1);
            });

            // Tracking should be cleared
            const velocityCheck = result.current.trackPointerMovement(1, 150, 150);
            expect(velocityCheck.shouldReject).toBe(false);
        });

        it('should cancel all pending pointers', () => {
            const { result } = renderHook(() => usePalmRejection());

            const onAccept = vi.fn();
            const onReject = vi.fn();

            const touch = new MockPointerEvent({
                pointerId: 1,
                width: 25,
                height: 25
            }) as unknown as PointerEvent;

            act(() => {
                result.current.queuePointerForDelay(touch, onAccept, onReject);
            });

            act(() => {
                result.current.cancelAllPending();
            });

            // Advance time - should not trigger accept
            act(() => {
                vi.advanceTimersByTime(50);
            });

            expect(onAccept).not.toHaveBeenCalled();
        });
    });

    describe('Configuration', () => {
        it('should respect disabled temporal delay', () => {
            const { result } = renderHook(() =>
                usePalmRejection({ enableTemporalDelay: false })
            );

            const onAccept = vi.fn();
            const onReject = vi.fn();

            const touch = new MockPointerEvent({
                pointerId: 1,
                width: 25,
                height: 25
            }) as unknown as PointerEvent;

            act(() => {
                result.current.queuePointerForDelay(touch, onAccept, onReject);
            });

            // Should accept immediately when temporal delay disabled
            expect(onAccept).toHaveBeenCalledWith(touch);
        });

        it('should respect disabled velocity analysis', () => {
            const { result } = renderHook(() =>
                usePalmRejection({ enableVelocityAnalysis: false })
            );

            const largeTouch = new MockPointerEvent({
                pointerId: 1,
                width: 35,
                height: 35,
                clientX: 100,
                clientY: 100
            }) as unknown as PointerEvent;

            act(() => {
                result.current.registerPointerDown(largeTouch);
            });

            act(() => {
                vi.advanceTimersByTime(150);
            });

            // Should not reject even if stationary (velocity analysis disabled)
            const velocityCheck = result.current.trackPointerMovement(1, 100, 100);
            expect(velocityCheck.shouldReject).toBe(false);
        });
    });
});
