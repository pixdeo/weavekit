import type { ComponentCache } from './component'
import type { Clip, DrawOp, DrawShape, Env, Hit, Proposal, Rect, ScrollRegion, Size } from './types'
import { intersect } from './types'
import type { View } from './view'

/** Identifies an environment for cache keys. Two equal keys measure alike. */
export const envKey = (e: Env): string =>
  `${e.font.size}/${e.font.weight}/${e.font.family}/${e.foreground}/${e.opacity}`

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
  clip: Clip | null = null

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

  /**
   * Measurements already taken during this pass.
   *
   * A stack asks each child for its size up to three times — ideal, the whole
   * room, then its final share — and every one of those questions re-asks the
   * child's own children. Nested stacks multiply: the leaf of a seven-deep tree
   * gets measured 724 times for a single frame, and the growth is exponential
   * in depth, so a real layout is unpayable without this.
   *
   * `measure` is a pure function of the view, the proposal and the inherited
   * environment, so the repeats are all the same question. The map lives on the
   * pass — a new `Ctx` per frame — which is exactly as long as an answer stays
   * true.
   */
  private measures = new WeakMap<View, Map<string, Size>>()

  /** Runs `view.measure(p)` unless this pass already asked the same question. */
  measure(view: View, p: Proposal): Size {
    let seen = this.measures.get(view)
    if (!seen) {
      seen = new Map()
      this.measures.set(view, seen)
    }
    const key = `${p.w}:${p.h}:${envKey(this.env)}`
    const hit = seen.get(key)
    if (hit) return hit
    const size = view.measure(p, this)
    seen.set(key, size)
    return size
  }

  withEnv<T>(patch: Partial<Env>, fn: () => T): T {
    const prev = this.env
    this.env = { ...prev, ...patch }
    try {
      return fn()
    } finally {
      this.env = prev
    }
  }

  /**
   * `radius` rounds the window's corners.
   *
   * Two rounded windows do not intersect into a third one — the shape that
   * comes out is not a rounded rectangle — so a nested clip that actually cuts
   * into its parent gives up its rounding and stays square. The common case,
   * one rounded window with nothing tighter around it, keeps it.
   */
  withClip<T>(rect: Rect, fn: () => T, radius = 0): T {
    const prev = this.clip
    const next: Clip = prev ? intersect(prev, rect) : { ...rect }
    const whole = next.x === rect.x && next.y === rect.y && next.w === rect.w && next.h === rect.h
    if (radius > 0 && whole) next.radius = radius
    this.clip = next
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
