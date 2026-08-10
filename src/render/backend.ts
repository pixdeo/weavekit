import type { DrawOp, PointerType } from '../core/types'

/**
 * Everything a backend reports about a pointer event.
 *
 * `t` is the event's own timestamp in milliseconds, not the current time:
 * release velocity is measured from it, and events can be coalesced or
 * delivered late, so reading a clock on arrival would smear the numbers.
 */
export type PointerCallback = (
  x: number,
  y: number,
  id: number,
  type: PointerType,
  t: number,
) => void

/**
 * The layout engine never talks to a canvas or the DOM — it emits DrawOps.
 * Swapping backends is how you debug layout: run the DOM one and inspect
 * every rect in DevTools.
 */
export interface Backend {
  el: HTMLElement
  resize(w: number, h: number): void
  draw(ops: DrawOp[]): void
  /** `id` identifies the pointer, so several can be tracked at once. */
  onPointerDown(cb: PointerCallback): void
  onPointerMove(cb: PointerCallback): void
  /** Fires for release and for cancellation, so a gesture always terminates. */
  onPointerUp(cb: PointerCallback): void
  /**
   * Routes this pointer's events here until it is released, even once it
   * leaves the element. Without it a drag dies at the first edge it crosses.
   *
   * Must not throw. The DOM's `setPointerCapture` does, for a pointer that is
   * no longer active, and a backend that lets that escape aborts the whole
   * pointerdown — losing the gesture to save the capture.
   */
  capturePointer(id: number): void
  releasePointer(id: number): void
  /** Return true when the delta was consumed, so the page does not scroll. */
  onWheel(cb: (x: number, y: number, dx: number, dy: number) => boolean): void
  setCursor(cursor: string): void
  destroy(): void
}
