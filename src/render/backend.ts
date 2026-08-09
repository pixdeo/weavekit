import type { DrawOp } from '../core/types'

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
  onPointerDown(cb: (x: number, y: number, id: number) => void): void
  onPointerMove(cb: (x: number, y: number, id: number) => void): void
  /** Fires for release and for cancellation, so a gesture always terminates. */
  onPointerUp(cb: (x: number, y: number, id: number) => void): void
  /**
   * Routes this pointer's events here until it is released, even once it
   * leaves the element. Without it a drag dies at the first edge it crosses.
   */
  capturePointer(id: number): void
  releasePointer(id: number): void
  /** Return true when the delta was consumed, so the page does not scroll. */
  onWheel(cb: (x: number, y: number, dx: number, dy: number) => boolean): void
  setCursor(cursor: string): void
  destroy(): void
}
