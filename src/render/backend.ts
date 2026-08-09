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
  onPointerDown(cb: (x: number, y: number) => void): void
  onPointerMove(cb: (x: number, y: number) => void): void
  /** Return true when the delta was consumed, so the page does not scroll. */
  onWheel(cb: (x: number, y: number, dx: number, dy: number) => boolean): void
  setCursor(cursor: string): void
  destroy(): void
}
