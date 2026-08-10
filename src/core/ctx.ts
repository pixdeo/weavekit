import type { ComponentCache } from './component'
import type { DrawOp, DrawShape, Env, Hit, Rect, ScrollRegion } from './types'
import { intersect } from './types'

export const defaultEnv = (): Env => ({
  font: { size: 14, weight: 400, family: 'ui-sans-serif, system-ui, -apple-system, sans-serif' },
  foreground: '#e4e4e7',
  opacity: 1,
})

/**
 * Carries the inherited environment down the tree and collects the flat draw
 * op list, the hit-test rects and the scrollable regions produced by a pass.
 *
 * `cache` survives across frames; everything else is per-frame. Without a
 * cache the tree still lays out correctly, just without memoisation.
 */
export class Ctx {
  ops: DrawOp[] = []
  hits: Hit[] = []
  scrolls: ScrollRegion[] = []
  env: Env = defaultEnv()
  /** Current clip, already intersected with every enclosing one. */
  clip: Rect | null = null

  /**
   * Tokens claimed by DOM-backed views during this pass. A DOM element lined
   * up with a laid-out rect — a hidden scroller, an overlaid editor — is not
   * rebuilt every frame the way ops are, so it needs another way to know it is
   * still in the tree: its view claims it during `place`, and whatever went
   * unclaimed can be swept by an `onPassEnd` callback once the pass ends.
   * `mount` calls `endPass` once per frame.
   */
  claims: unknown[] = []
  private passEnd: (() => void)[] = []

  claim(token: unknown): void {
    this.claims.push(token)
  }

  onPassEnd(cb: () => void): void {
    this.passEnd.push(cb)
  }

  endPass(): void {
    for (const cb of this.passEnd) cb()
  }

  constructor(readonly cache?: ComponentCache) {}

  withEnv<T>(patch: Partial<Env>, fn: () => T): T {
    const prev = this.env
    this.env = { ...prev, ...patch }
    try {
      return fn()
    } finally {
      this.env = prev
    }
  }

  withClip<T>(rect: Rect, fn: () => T): T {
    const prev = this.clip
    this.clip = prev ? intersect(prev, rect) : rect
    try {
      return fn()
    } finally {
      this.clip = prev
    }
  }

  /** Emits a draw op, stamping the clip in force where it was emitted. */
  emit(shape: DrawShape): void {
    this.ops.push(this.clip ? { ...shape, clip: this.clip } : shape)
  }

  addHit(hit: Hit): void {
    this.hits.push(this.clip ? { ...hit, clip: this.clip } : hit)
  }

  addScroll(region: ScrollRegion): void {
    this.scrolls.push(this.clip ? { ...region, clip: this.clip } : region)
  }
}
