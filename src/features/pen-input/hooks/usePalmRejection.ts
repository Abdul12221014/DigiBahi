import { useRef, useCallback, useMemo } from 'react';

/**
 * Palm Rejection Configuration
 * Optimized for Waveshare 10.1" DSI Capacitive Touchscreen
 */
export interface PalmRejectionConfig {
    /** Size threshold in pixels - touches larger than this are likely palms */
    sizeThreshold: number;

    /** Temporal delay in ms - wait this long to see if a smaller touch (stylus) appears */
    temporalDelayMs: number;

    /** Velocity threshold in px - touches moving less than this in first 100ms are likely stationary palms */
    velocityThreshold: number;

    /** Edge rejection zone as percentage of canvas height (0-1) - reject touches in bottom edge */
    edgeRejectionZone: number;

    /** Enable temporal delay feature */
    enableTemporalDelay: boolean;

    /** Enable velocity analysis feature */
    enableVelocityAnalysis: boolean;

    /** Enable edge zone filtering */
    enableEdgeFiltering: boolean;
}

const DEFAULT_CONFIG: PalmRejectionConfig = {
    sizeThreshold: 30,
    temporalDelayMs: 40,
    velocityThreshold: 2,
    edgeRejectionZone: 0.15, // Bottom 15% of screen
    enableTemporalDelay: true,
    enableVelocityAnalysis: true,
    enableEdgeFiltering: false, // Disabled by default to avoid interfering with UI
};

interface PendingPointer {
    pointerId: number;
    event: React.PointerEvent;
    timestamp: number;
    startX: number;
    startY: number;
    width: number;
    height: number;
    timeoutId: number;
}

interface ActivePointer {
    pointerId: number;
    startTime: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    width: number;
    height: number;
    totalMovement: number;
}

export interface PalmRejectionResult {
    /** Whether this pointer should be rejected as a palm */
    shouldReject: boolean;

    /** Reason for rejection (for debugging) */
    reason?: string;

    /** Whether to delay processing (temporal delay active) */
    shouldDelay: boolean;
}

/**
 * Enhanced Palm Rejection Hook
 * 
 * Implements a 3-tier palm rejection system:
 * 1. Immediate Rejection: Size-based filtering
 * 2. Temporal Delay: Wait to see if a smaller touch (stylus) appears
 * 3. Velocity Analysis: Reject stationary large touches
 * 
 * Optimized for capacitive touchscreens without active digitizers.
 */
export function usePalmRejection(customConfig?: Partial<PalmRejectionConfig>) {
    const config = useMemo(() => ({ ...DEFAULT_CONFIG, ...customConfig }), [customConfig]);

    // Track pending pointers (temporal delay)
    const pendingPointersRef = useRef<Map<number, PendingPointer>>(new Map());

    // Track active pointers (velocity analysis)
    const activePointersRef = useRef<Map<number, ActivePointer>>(new Map());

    // Track if we have an active pen/stylus
    const activeStylusRef = useRef<number | null>(null);

    /**
     * Tier 1: Immediate Size-Based Rejection
     */
    const checkImmediateRejection = useCallback((
        e: React.PointerEvent,
        canvasHeight?: number
    ): PalmRejectionResult => {
        const width = e.width || 0;
        const height = e.height || 0;
        const size = Math.max(width, height);

        // Size-based rejection
        if (size > config.sizeThreshold) {
            return {
                shouldReject: true,
                shouldDelay: false,
                reason: `Size ${size.toFixed(1)}px exceeds threshold ${config.sizeThreshold}px`
            };
        }

        // Edge zone rejection (if enabled)
        if (config.enableEdgeFiltering && canvasHeight) {
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            const relativeY = (e.clientY - rect.top) / canvasHeight;

            if (relativeY > (1 - config.edgeRejectionZone)) {
                return {
                    shouldReject: true,
                    shouldDelay: false,
                    reason: `Touch in edge zone (${(relativeY * 100).toFixed(1)}%)`
                };
            }
        }

        // If there's already an active stylus (smaller touch), reject this larger touch
        if (activeStylusRef.current !== null && activeStylusRef.current !== e.pointerId) {
            const activeStylus = activePointersRef.current.get(activeStylusRef.current);
            if (activeStylus && size > Math.max(activeStylus.width, activeStylus.height) * 1.5) {
                return {
                    shouldReject: true,
                    shouldDelay: false,
                    reason: 'Larger touch while stylus active'
                };
            }
        }

        return {
            shouldReject: false,
            shouldDelay: false
        };
    }, [config]);

    /**
     * Tier 2: Temporal Delay Processing
     * Queue the pointer and wait to see if a smaller touch appears
     */
    const queuePointerForDelay = useCallback((
        e: React.PointerEvent,
        onAccept: (e: React.PointerEvent) => void,
        onReject: (pointerId: number, reason: string) => void
    ) => {
        if (!config.enableTemporalDelay) {
            onAccept(e);
            return;
        }

        const width = e.width || 0;
        const height = e.height || 0;
        const size = Math.max(width, height);

        // If this is a very small touch, accept immediately (likely stylus)
        if (size < config.sizeThreshold * 0.5) {
            // This is likely a stylus - accept immediately and mark as active stylus
            activeStylusRef.current = e.pointerId;

            // Cancel any pending larger touches (they were palms)
            pendingPointersRef.current.forEach((pending, id) => {
                if (id !== e.pointerId) {
                    const pendingSize = Math.max(pending.width, pending.height);
                    if (pendingSize > size * 1.5) {
                        clearTimeout(pending.timeoutId);
                        pendingPointersRef.current.delete(id);
                        onReject(id, `Rejected by smaller stylus touch (${size.toFixed(1)}px vs ${pendingSize.toFixed(1)}px)`);
                    }
                }
            });

            onAccept(e);
            return;
        }

        // Queue this pointer with temporal delay
        const timeoutId = window.setTimeout(() => {
            const pending = pendingPointersRef.current.get(e.pointerId);
            if (pending) {
                pendingPointersRef.current.delete(e.pointerId);
                onAccept(pending.event);
            }
        }, config.temporalDelayMs);

        pendingPointersRef.current.set(e.pointerId, {
            pointerId: e.pointerId,
            event: e,
            timestamp: performance.now(),
            startX: e.clientX,
            startY: e.clientY,
            width,
            height,
            timeoutId
        });
    }, [config]);

    /**
     * Tier 3: Velocity Analysis
     * Track pointer movement and reject if stationary
     */
    const trackPointerMovement = useCallback((
        pointerId: number,
        x: number,
        y: number
    ): PalmRejectionResult => {
        if (!config.enableVelocityAnalysis) {
            return { shouldReject: false, shouldDelay: false };
        }

        const active = activePointersRef.current.get(pointerId);
        if (!active) {
            return { shouldReject: false, shouldDelay: false };
        }

        // Update position
        const dx = x - active.lastX;
        const dy = y - active.lastY;
        const movement = Math.sqrt(dx * dx + dy * dy);
        active.totalMovement += movement;
        active.lastX = x;
        active.lastY = y;

        // Check velocity after 100ms
        const elapsed = performance.now() - active.startTime;
        if (elapsed > 100) {
            const size = Math.max(active.width, active.height);

            // If large touch with minimal movement, it's likely a palm
            if (size > config.sizeThreshold * 0.8 && active.totalMovement < config.velocityThreshold) {
                return {
                    shouldReject: true,
                    shouldDelay: false,
                    reason: `Stationary large touch (${active.totalMovement.toFixed(1)}px movement in ${elapsed.toFixed(0)}ms)`
                };
            }
        }

        return { shouldReject: false, shouldDelay: false };
    }, [config]);

    /**
     * Register a new pointer down event
     */
    const registerPointerDown = useCallback((
        e: React.PointerEvent,
        canvasHeight?: number
    ) => {
        const width = e.width || 0;
        const height = e.height || 0;

        activePointersRef.current.set(e.pointerId, {
            pointerId: e.pointerId,
            startTime: performance.now(),
            startX: e.clientX,
            startY: e.clientY,
            lastX: e.clientX,
            lastY: e.clientY,
            width,
            height,
            totalMovement: 0
        });
    }, []);

    /**
     * Unregister a pointer up event
     */
    const unregisterPointer = useCallback((pointerId: number) => {
        // Clear pending pointer
        const pending = pendingPointersRef.current.get(pointerId);
        if (pending) {
            clearTimeout(pending.timeoutId);
            pendingPointersRef.current.delete(pointerId);
        }

        // Clear active pointer
        activePointersRef.current.delete(pointerId);

        // Clear stylus reference if this was the stylus
        if (activeStylusRef.current === pointerId) {
            activeStylusRef.current = null;
        }
    }, []);

    /**
     * Cancel all pending pointers (e.g., on component unmount)
     */
    const cancelAllPending = useCallback(() => {
        pendingPointersRef.current.forEach(pending => {
            clearTimeout(pending.timeoutId);
        });
        pendingPointersRef.current.clear();
        activePointersRef.current.clear();
        activeStylusRef.current = null;
    }, []);

    return {
        checkImmediateRejection,
        queuePointerForDelay,
        trackPointerMovement,
        registerPointerDown,
        unregisterPointer,
        cancelAllPending,
        config
    };
}

export default usePalmRejection;
