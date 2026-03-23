import { useCallback, useRef, useEffect } from 'react';
import type { StrokePoint } from '../types/pen.types';
import { usePalmRejection, type PalmRejectionConfig } from './usePalmRejection';

interface Handlers {
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
}

export interface PointerEventsConfig {
  /** Custom palm rejection configuration */
  palmRejection?: Partial<PalmRejectionConfig>;

  /** Enable enhanced palm rejection (default: true) */
  enablePalmRejection?: boolean;

  /** Enable debug logging for palm rejection */
  debugPalmRejection?: boolean;
}

export function usePointerEvents(
  opts: {
    getPosition: (e: React.PointerEvent) => { x: number; y: number; pressure: number };
    beginStroke: (p: StrokePoint) => void;
    extendStroke: (p: StrokePoint) => void;
    endStroke: () => void;
    onPan?: (dx: number, dy: number) => void;
    onZoom?: (scale: number, centerX: number, centerY: number) => void;
  },
  config?: PointerEventsConfig
): Handlers {
  const enablePalmRejection = config?.enablePalmRejection !== false;
  const debugMode = config?.debugPalmRejection || false;

  // Refs for state tracking
  const activePenRef = useRef<boolean>(false);
  const activePointerIdRef = useRef<number | null>(null);
  const activePointersMapRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const isPanningRef = useRef<boolean>(false);

  // Enhanced palm rejection
  const palmRejection = usePalmRejection(config?.palmRejection);

  // Track delayed strokes that are waiting for temporal delay
  const delayedStrokesRef = useRef<Map<number, { x: number; y: number; pressure: number }>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      palmRejection.cancelAllPending();
    };
  }, [palmRejection]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Explicitly prevent default browser behavior (scrolling/selection) during drawing
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      e.preventDefault();
    }

    const clientX = e.clientX;
    const clientY = e.clientY;

    // Track this pointer
    activePointersMapRef.current.set(e.pointerId, { x: clientX, y: clientY });

    // Multi-touch detection (Pan/Scroll gesture start)
    if (activePointersMapRef.current.size >= 2) {
      if (debugMode) console.log('[PointerEvents] Multi-touch gesture started, stopping draw');
      isPanningRef.current = true;
      
      // Stop current stroke if any
      if (activePointerIdRef.current !== null) {
        opts.endStroke();
        activePointerIdRef.current = null;
      }
      return;
    }

    // Enhanced palm rejection (if enabled)
    if (enablePalmRejection && e.pointerType === 'touch') {
      const canvasHeight = (e.target as HTMLCanvasElement).height;

      // Tier 1: Immediate rejection
      const immediateCheck = palmRejection.checkImmediateRejection(e, canvasHeight);
      if (immediateCheck.shouldReject) {
        if (debugMode) {
          console.log('[PalmRejection] Immediate rejection:', immediateCheck.reason);
        }
        return;
      }

      // Register pointer for tracking
      palmRejection.registerPointerDown(e, canvasHeight);

      // Tier 2: Temporal delay (queue and wait)
      const position = opts.getPosition(e);

      palmRejection.queuePointerForDelay(
        e,
        // onAccept callback
        (acceptedEvent) => {
          if (debugMode) {
            console.log('[PalmRejection] Pointer accepted after delay:', acceptedEvent.pointerId);
          }

          // If we started panning during the delay, don't start a stroke
          if (isPanningRef.current) return;

          // Track this pointer
          activePointerIdRef.current = acceptedEvent.pointerId;
          
          // Capture pointer for drawing
          (acceptedEvent.target as Element).setPointerCapture(acceptedEvent.pointerId);

          // Get the stored position (or recalculate if needed)
          const storedPosition = delayedStrokesRef.current.get(acceptedEvent.pointerId);
          const finalPosition = storedPosition || opts.getPosition(acceptedEvent);
          delayedStrokesRef.current.delete(acceptedEvent.pointerId);

          // Begin stroke
          opts.beginStroke({
            x: finalPosition.x,
            y: finalPosition.y,
            pressure: Math.max(0.1, finalPosition.pressure || 1),
            timestamp: performance.now()
          });
        },
        // onReject callback
        (rejectedPointerId, reason) => {
          if (debugMode) {
            console.log('[PalmRejection] Pointer rejected:', rejectedPointerId, reason);
          }
          delayedStrokesRef.current.delete(rejectedPointerId);
          palmRejection.unregisterPointer(rejectedPointerId);
        }
      );

      // Store position for delayed processing
      delayedStrokesRef.current.set(e.pointerId, position);
      return;
    }

    // Legacy palm rejection (fallback for pen events or if enhanced is disabled)
    if (e.pointerType === 'touch' && !enablePalmRejection) {
      if (activePenRef.current) return;
      if ((e.width && e.width > 30) || (e.height && e.height > 30)) return;
    }

    // Prefer pen
    if (e.pointerType === 'pen') activePenRef.current = true;

    // Track this pointer for drawing
    activePointerIdRef.current = e.pointerId;

    // Capture pointer for drawing
    (e.target as Element).setPointerCapture(e.pointerId);

    const { x, y, pressure } = opts.getPosition(e);
    opts.beginStroke({
      x,
      y,
      pressure: Math.max(0.1, pressure || 1),
      timestamp: performance.now()
    });
  }, [opts, enablePalmRejection, debugMode, palmRejection]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Explicitly prevent default browser behavior (scrolling/selection)
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      e.preventDefault();
    }

    const currentPos = { x: e.clientX, y: e.clientY };
    const prevPos = activePointersMapRef.current.get(e.pointerId);
    activePointersMapRef.current.set(e.pointerId, currentPos);

    // GESTURE HANDLING (Multi-touch Panning)
    if (isPanningRef.current && activePointersMapRef.current.size >= 2 && opts.onPan) {
      const pointerIds = Array.from(activePointersMapRef.current.keys());
      const otherId = pointerIds.find(id => id !== e.pointerId);
      const otherPos = otherId !== undefined ? activePointersMapRef.current.get(otherId) : null;

      if (prevPos && otherPos) {
        // Calculate centroid movement
        const prevCentroidX = (prevPos.x + otherPos.x) / 2;
        const prevCentroidY = (prevPos.y + otherPos.y) / 2;
        const currCentroidX = (currentPos.x + otherPos.x) / 2;
        const currCentroidY = (currentPos.y + otherPos.y) / 2;

        const dx = currCentroidX - prevCentroidX;
        const dy = currCentroidY - prevCentroidY;

        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          opts.onPan(dx, dy);
        }

        // Optional: Implement pinch-to-zoom
        if (opts.onZoom) {
          const dist = Math.sqrt(Math.pow(currentPos.x - otherPos.x, 2) + Math.pow(currentPos.y - otherPos.y, 2));
          const prevDist = Math.sqrt(Math.pow(prevPos.x - otherPos.x, 2) + Math.pow(prevPos.y - otherPos.y, 2));
          
          if (prevDist > 0 && Math.abs(dist - prevDist) > 1) {
            const scale = dist / prevDist;
            opts.onZoom(scale, currCentroidX, currCentroidY);
          }
        }
      }
      return;
    }

    // Only proceed with drawing if this is the active drawing pointer
    if (activePointerIdRef.current !== e.pointerId) return;

    const { x, y, pressure } = opts.getPosition(e);

    // Tier 3: Velocity analysis (if enabled)
    if (enablePalmRejection && e.pointerType === 'touch') {
      const velocityCheck = palmRejection.trackPointerMovement(e.pointerId, e.clientX, e.clientY);
      if (velocityCheck.shouldReject) {
        if (debugMode) {
          console.log('[PalmRejection] Velocity rejection:', velocityCheck.reason);
        }

        // Cancel this stroke
        opts.endStroke();
        activePointerIdRef.current = null;
        palmRejection.unregisterPointer(e.pointerId);

        // Release pointer capture
        (e.target as Element).releasePointerCapture(e.pointerId);
        return;
      }
    }

    opts.extendStroke({
      x,
      y,
      pressure: Math.max(0.1, pressure || 1),
      timestamp: performance.now()
    });
  }, [opts, enablePalmRejection, debugMode, palmRejection]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Remove from active pointers map
    activePointersMapRef.current.delete(e.pointerId);

    // Reset panning if we drop below 2 pointers
    if (activePointersMapRef.current.size < 2) {
      isPanningRef.current = false;
    }

    // Clean up delayed stroke data
    delayedStrokesRef.current.delete(e.pointerId);

    // Unregister from palm rejection
    if (enablePalmRejection) {
      palmRejection.unregisterPointer(e.pointerId);
    }

    // Only end stroke if this was the primary drawing pointer
    if (activePointerIdRef.current === e.pointerId) {
      (e.target as Element).releasePointerCapture(e.pointerId);
      opts.endStroke();
      activePointerIdRef.current = null;
      if (e.pointerType === 'pen') activePenRef.current = false;
    }

    // If no more active pointers, reset state
    if (activePointersMapRef.current.size === 0) {
      activePointerIdRef.current = null;
      activePenRef.current = false;
      isPanningRef.current = false;
    }
  }, [opts, enablePalmRejection, palmRejection]);

  return { onPointerDown, onPointerMove, onPointerUp };
}

export default usePointerEvents;
