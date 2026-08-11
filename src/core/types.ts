/** Geometry, drawing and environment primitives shared by the whole toolkit. */

import type { Signal } from './signal'

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
  /**
   * Extra space between characters, in pixels. Part of the font rather than of
   * the text op because it changes how wide a string *measures*, and layout and
   * drawing have to agree about that or the two disagree by a few pixels per
   * word. Absent means none.
   */
  spacing?: number
}

/**
 * A drop shadow under a shape.
 *
 * No spread: the canvas has no such parameter, and a spread is a bigger shape,
 * which the caller can ask for by inflating the rect. Shadows fall under the
 * fill; a shape that only strokes casts from its stroke instead.
 */
export interface Shadow {
  color: string
  blur: number
  dx: number
  dy: number
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
      shadow?: Shadow
    }
  | {
      t: 'ellipse'
      rect: Rect
      opacity: number
      fill?: string
      stroke?: string
      lineWidth?: number
      shadow?: Shadow
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

/** A clipping window. `radius` rounds its corners; 0 or absent is square. */
export interface Clip extends Rect {
  radius?: number
}

/**
 * `clip` is stamped on at emit time by the context, already intersected with
 * any enclosing clips. Backends apply it per op, so they need no clip stack
 * and a cached subtree can be replayed as-is.
 */
export type DrawOp = DrawShape & { clip?: Clip }

export type PointerType = 'mouse' | 'touch' | 'pen'

/**
 * Anything a backend cannot classify is a mouse: a synthetic or unlabelled
 * pointer is far more likely to be a desktop one, and mouse is the type with
 * no special affordances attached to it.
 */
export const pointerTypeOf = (v: string | undefined | null): PointerType =>
  v === 'touch' || v === 'pen' ? v : 'mouse'

/**
 * One key press, in plain data — the keyboard analogue of `Drag`. The toolkit
 * routes the browser's `keydown` to the focused view instead of handing it
 * the DOM event, so views stay backend-agnostic and the headless checks can
 * dispatch keys without a browser.
 */
export interface Key {
  /** The key's value: `'a'`, `'Enter'`, `'Backspace'`, `'Shift'`… */
  key: string
  /** Physical key, layout-independent: `'KeyA'`, `'Digit1'`, `'Space'`… */
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  /** Held down — typematic repeats. */
  repeat: boolean
  /** Part of an IME composition; a handler should usually ignore it. */
  isComposing: boolean
}

export const toKey = (e: {
  key: string
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
  isComposing: boolean
}): Key => ({
  key: e.key,
  code: e.code,
  ctrlKey: e.ctrlKey,
  metaKey: e.metaKey,
  altKey: e.altKey,
  shiftKey: e.shiftKey,
  repeat: e.repeat,
  isComposing: e.isComposing,
})

/**
 * One sample of a drag, in root coordinates.
 *
 * `dx`/`dy` are the step since the previous sample; `tx`/`ty` are the total
 * since the drag began. Prefer the totals: they are immune to a dropped or
 * coalesced move, so a handler that maps them onto state captured at
 * `onStart` never accumulates error.
 */
export interface Drag {
  x: number
  y: number
  dx: number
  dy: number
  tx: number
  ty: number
  startX: number
  startY: number
  /**
   * Speed over the last few samples, in units per second — what a fling hands
   * to `animated().set(to, velocity)`.
   *
   * Measured over a short trailing window rather than from the last two
   * points, so it survives a jittery final sample and, more importantly,
   * reports ~0 when the pointer was held still before release. A release from
   * a standstill must not fling, however fast the drag was a moment earlier.
   */
  vx: number
  vy: number
  /** What is driving this gesture. Constant for its whole lifetime. */
  pointerType: PointerType
}

export interface DragHandlers {
  onStart?(d: Drag): void
  onMove?(d: Drag): void
  /** Also fires when the gesture is cancelled, so it is safe to clean up here. */
  onEnd?(d: Drag): void
  /**
   * Restricts which pointers may start this gesture. A press of any other type
   * falls through to whatever is beneath in the hit list, which is how a
   * viewport can pan under a finger without stealing a mouse press.
   */
  pointerTypes?: PointerType[]
}

export interface Hit {
  rect: Rect
  /** Absent for cursor-only regions such as resize handles. */
  handler?: () => void
  /**
   * Set to follow the pointer after it leaves this rect. The gesture owns the
   * pointer until it is released, so nothing else can steal it mid-drag.
   */
  drag?: DragHandlers
  /**
   * Pressing this view makes it the key target: `keydown` events route here
   * until the next press. See `onKey` on `View`.
   */
  key?: (k: Key) => void
  /** CSS cursor shown while the pointer is inside this rect. */
  cursor?: string
  /**
   * Set true while the pointer rests on this rect and nothing is drawn over
   * it, false when it leaves. Only the topmost region is hovered.
   */
  hover?: Signal<boolean>
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
