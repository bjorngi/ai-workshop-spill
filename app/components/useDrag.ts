// Pointer-based drag hook. Works for mouse AND touch via Pointer Events.
//
// You bind `dragHandlers` to the draggable token. On pointerdown it captures the
// pointer and starts tracking. On every move it reports the current normalized
// position over a target element (the grid) as {fx, fy} fractions of the grid's
// bounding rect, with fy measured from the BOTTOM. On pointerup it reports the
// final drop position.

import { useCallback, useRef, useState } from "react";

import type { Placement } from "~/game/types";

export interface DragState {
  /** True while a pointer is down and dragging. */
  dragging: boolean;
  /** Latest position over the target as bottom-left fractions, or null. */
  position: Placement | null;
}

export interface UseDrag {
  dragging: boolean;
  /** Latest live position over the target while dragging (bottom-left origin). */
  position: Placement | null;
  /** Spread onto the draggable element. */
  dragHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    style: React.CSSProperties;
  };
}

/** Clamp a number to [0, 1]. */
function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * @param targetRef ref to the element drops are measured against (the grid).
 * @param onDrop    called once on pointerup with the final {fx, fy}, if the
 *                  pointer was released over (or near) the target.
 */
export function useDrag(
  targetRef: React.RefObject<HTMLElement | null>,
  onDrop?: (placement: Placement) => void,
): UseDrag {
  const [state, setState] = useState<DragState>({
    dragging: false,
    position: null,
  });
  const latestRef = useRef<Placement | null>(null);

  const toFraction = useCallback(
    (clientX: number, clientY: number): Placement | null => {
      const el = targetRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      const fx = clamp01((clientX - rect.left) / rect.width);
      // Origin bottom-left: invert Y.
      const fy = clamp01(1 - (clientY - rect.top) / rect.height);
      return { fx, fy };
    },
    [targetRef],
  );

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setState({ dragging: true, position: null });
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      setState((prev) => {
        if (!prev.dragging) return prev;
        const pos = toFraction(e.clientX, e.clientY);
        latestRef.current = pos;
        return { dragging: true, position: pos };
      });
    },
    [toFraction],
  );

  const finish = useCallback(
    (e: React.PointerEvent) => {
      const el = e.currentTarget as HTMLElement;
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
      const pos = toFraction(e.clientX, e.clientY) ?? latestRef.current;
      latestRef.current = null;
      setState({ dragging: false, position: null });
      if (pos) onDrop?.(pos);
    },
    [toFraction, onDrop],
  );

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    latestRef.current = null;
    setState({ dragging: false, position: null });
  }, []);

  return {
    dragging: state.dragging,
    position: state.position,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel,
      style: { touchAction: "none", cursor: "grab" },
    },
  };
}
