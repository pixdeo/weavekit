/** Geometry, drawing and environment primitives shared by the whole toolkit. */

export interface Size {
  w: number
  h: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * A size proposal from a parent to a child.
 * `null` means "unspecified — pick your ideal size".
 * `Infinity` means "as much as you want".
 */
export interface Proposal {
  w: number | null
  h: number | null
}

export interface Insets {
  t: number
  r: number
  b: number
  l: number
}

export interface Font {
  size: number
  weight: number
  family: string
}

export type Align = 'leading' | 'center' | 'trailing'

/** Values inherited down the view tree, like SwiftUI's Environment. */
export interface Env {
  font: Font
  foreground: string
  opacity: number
}

export type DrawShape =
  | {
      t: 'rect'
      rect: Rect
      radius: number
      opacity: number
      fill?: string
      stroke?: string
      lineWidth?: number
    }
  | {
      t: 'ellipse'
      rect: Rect
      opacity: number
      fill?: string
      stroke?: string
      lineWidth?: number
    }
  | {
      t: 'text'
      rect: Rect
      lines: string[]
      font: Font
      color: string
      opacity: number
      lineHeight: number
    }

/**
 * `clip` is stamped on at emit time by the context, already intersected with
 * any enclosing clips. Backends apply it per op, so they need no clip stack
 * and a cached subtree can be replayed as-is.
 */
export type DrawOp = DrawShape & { clip?: Rect }

export interface Hit {
  rect: Rect
  /** Absent for cursor-only regions such as resize handles. */
  handler?: () => void
  /** CSS cursor shown while the pointer is inside this rect. */
  cursor?: string
  clip?: Rect
}

export interface ScrollRegion {
  rect: Rect
  clip?: Rect
  /**
   * Returns whether the delta actually moved anything. A region already at its
   * end reports false so the wheel chains out to whatever encloses it.
   */
  scroll(dx: number, dy: number): boolean
}

export const insets = (v: number | Partial<Insets>): Insets =>
  typeof v === 'number'
    ? { t: v, r: v, b: v, l: v }
    : { t: v.t ?? 0, r: v.r ?? 0, b: v.b ?? 0, l: v.l ?? 0 }

/** Shrinks a proposal by insets, keeping `null` / `Infinity` intact. */
export const shrink = (p: Proposal, i: Insets): Proposal => ({
  w: p.w == null ? null : Math.max(0, p.w - i.l - i.r),
  h: p.h == null ? null : Math.max(0, p.h - i.t - i.b),
})

export const inset = (r: Rect, i: Insets): Rect => ({
  x: r.x + i.l,
  y: r.y + i.t,
  w: Math.max(0, r.w - i.l - i.r),
  h: Math.max(0, r.h - i.t - i.b),
})

/** Resolves a proposal axis to a concrete number, falling back when unspecified. */
export const concrete = (v: number | null, fallback: number): number =>
  v == null || !isFinite(v) ? fallback : v

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

export const intersect = (a: Rect, b: Rect): Rect => {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return {
    x,
    y,
    w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x),
    h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y),
  }
}

export const contains = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

/** A point is live only if it is inside the rect and inside any clip on it. */
export const hitTestable = (
  r: Rect,
  clip: Rect | undefined,
  x: number,
  y: number,
): boolean => contains(r, x, y) && (!clip || contains(clip, x, y))
