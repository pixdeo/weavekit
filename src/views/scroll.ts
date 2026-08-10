import type { Ctx } from '../core/ctx'
import { View } from '../core/view'
import type { Proposal, Rect, Size } from '../core/types'
import { clamp, concrete } from '../core/types'
import type { Signal } from '../core/signal'
import { project, type Animated } from '../core/animation'

/**
 * One scrollable axis. A plain signal is enough to scroll; an `animated()` one
 * additionally flings, because only it can be handed a release velocity.
 */
export type ScrollAxis = Signal<number> | Animated

export interface ScrollOffset {
  /** Provide a signal per scrollable axis. An absent axis does not scroll. */
  x?: ScrollAxis
  y?: ScrollAxis
}

/** `settle` is on `Animated` and on nothing else. */
const flingable = (axis: ScrollAxis): axis is Animated => 'settle' in axis

/**
 * Moves an axis right now, with no interpolation.
 *
 * `set` on an `animated()` axis *animates*, which is what a wheel notch wants
 * and exactly what a gesture does not: content that springs toward the finger
 * lags behind it, and the whole point of a direct manipulation is that it does
 * not. Anything driven by a pointer writes through here.
 */
const put = (axis: ScrollAxis, v: number): void => {
  if (flingable(axis)) axis.settle(v)
  else axis.set(v)
}

/**
 * Slowest release that still throws the content, in units per second. Below
 * it a release is a stop: letting go of a slow drag should leave the content
 * exactly where the finger left it, not creep on for another moment.
 */
const FLING_MIN = 60

/**
 * Rubber-band tension. Dragging past the end moves the content by a fraction
 * of the distance that shrinks the further it goes, so the edge announces
 * itself by feel instead of by stopping dead.
 *
 * Apple's constant, and the shape is theirs too: displacement asymptotes at
 * `dim / RUBBER`, so the content can never be dragged clean off the viewport
 * however hard it is pulled.
 */
const RUBBER = 0.55

/** Raw overshoot in, resisted overshoot out. Both positive. */
const resist = (over: number, dim: number): number =>
  dim <= 0 ? 0 : (1 - 1 / ((over * RUBBER) / dim + 1)) * (dim / RUBBER)

/**
 * The exact inverse. Grabbing the content mid-bounce has to resume from the
 * raw distance the visible offset stands for, or the first move of the new
 * drag resists an already-resisted value and the content jumps.
 */
const unresist = (shown: number, dim: number): number => {
  if (dim <= 0) return 0
  const k = RUBBER / dim
  // The asymptote: nothing shown beyond it corresponds to a finite raw drag.
  if (shown * k >= 1) return Infinity
  return (1 / (1 - shown * k) - 1) / k
}

/** The offset to display for a raw one, banded past either end. */
const band = (v: number, max: number, dim: number, elastic: boolean): number => {
  if (!elastic) return clamp(v, 0, max)
  if (v < 0) return -resist(-v, dim)
  if (v > max) return max + resist(v - max, dim)
  return v
}

/** The raw offset a displayed one stands for. Inverse of `band`. */
const unband = (v: number, max: number, dim: number): number => {
  if (v < 0) return -unresist(-v, dim)
  if (v > max) return max + unresist(v - max, dim)
  return v
}

/**
 * What a release does: bounce back if the content is past an end, coast if it
 * was thrown, and nothing at all otherwise.
 *
 * `velocity` is the offset's own, already negated from the pointer's. A coast
 * projects a landing point and clamps *that* rather than the motion, so a hard
 * flick near the end still arrives with the spring's deceleration instead of
 * being cut short. A bounce carries the velocity too, so a release still
 * travelling inward is helped along rather than fought.
 */
const release = (axis: ScrollAxis | null, velocity: number, max: number): void => {
  if (!axis || !flingable(axis)) return
  const at = axis()
  if (at < 0 || at > max) {
    axis.set(clamp(at, 0, max), velocity)
    return
  }
  if (Math.abs(velocity) < FLING_MIN) return
  axis.set(clamp(project(at, velocity), 0, max), velocity)
}

const BAR_THICKNESS = 4
const BAR_INSET = 3
const BAR_MIN = 24
const BAR_COLOR = '#3f3f46'
/** A 4px bar is not grabbable; the hit rect is padded out to a usable target. */
const BAR_GRAB = 7

/**
 * A viewport onto a taller or wider child.
 *
 * The offset lives in signals the caller owns, so scrolling is ordinary state:
 * it can be read, restored and animated, and writing it invalidates exactly
 * the component that read it. Reading the offset here registers that
 * dependency, so a scroll re-places this subtree and nothing else.
 */
class ScrollViewImpl extends View {
  constructor(
    private axes: ScrollOffset,
    private child: View,
  ) {
    super()
  }

  private childProposal(w: number | null, h: number | null): Proposal {
    return { w: this.axes.x ? null : w, h: this.axes.y ? null : h }
  }

  measure(p: Proposal, ctx: Ctx): Size {
    const content = this.child.measure(this.childProposal(p.w, p.h), ctx)
    // A viewport fills what it is offered, and falls back to its content when
    // nothing is proposed. That makes it greedy inside a stack.
    return { w: concrete(p.w, content.w), h: concrete(p.h, content.h) }
  }

  place(rect: Rect, ctx: Ctx): void {
    const content = this.child.measure(this.childProposal(rect.w, rect.h), ctx)

    const maxX = Math.max(0, content.w - rect.w)
    const maxY = Math.max(0, content.h - rect.h)
    // Read as-is rather than clamped. An offset outside the content is what
    // rubber-banding is: the bounce has to be visible to be a bounce. Every
    // path that *writes* the offset does its own clamping, so an out-of-range
    // value only ever comes from something that meant it.
    const x = this.axes.x?.() ?? 0
    const y = this.axes.y?.() ?? 0

    // Registered before the child so nested viewports land later in the list
    // and win the wheel; an inner one that cannot move chains back out here.
    ctx.addScroll({
      rect,
      scroll: (dx, dy) => {
        let moved = false
        if (this.axes.x) {
          const next = clamp(x + dx, 0, maxX)
          if (next !== x) {
            this.axes.x.set(next)
            moved = true
          }
        }
        if (this.axes.y) {
          const next = clamp(y + dy, 0, maxY)
          if (next !== y) {
            this.axes.y.set(next)
            moved = true
          }
        }
        return moved
      },
    })

    this.pan(rect, maxX, maxY, ctx)

    ctx.withClip(rect, () => {
      this.child.place(
        {
          x: rect.x - x,
          y: rect.y - y,
          w: this.axes.x ? content.w : rect.w,
          h: this.axes.y ? content.h : rect.h,
        },
        ctx,
      )
      this.drawBars(rect, content, x, y, maxX, maxY, ctx)
    })
  }

  /**
   * Dragging the content pans it, which is what every touch surface does and
   * what no mouse does — a mouse press on content is a press, not a scroll —
   * so the gesture is restricted to touch and pen. A mouse press falls through
   * to whatever is underneath, exactly as if this hit did not exist.
   *
   * Registered before the child, so draggable content wins the press, and
   * before the bars, which are placed later still and win over both.
   *
   * The wheel's chaining rule applies in the one form a captured gesture can
   * express it: a viewport with nothing to move registers no pan at all, so
   * the press reaches an enclosing viewport that does. Unlike the wheel, a
   * pan that runs out mid-gesture cannot hand over — it already owns the
   * pointer — so it bands against the end and springs back on release.
   *
   * Banding needs somewhere to spring back *to*, so it only applies to an
   * `animated()` axis. A plain signal stops at the end, as it always did.
   */
  private pan(rect: Rect, maxX: number, maxY: number, ctx: Ctx): void {
    const panX = this.axes.x && maxX > 0 ? this.axes.x : null
    const panY = this.axes.y && maxY > 0 ? this.axes.y : null
    if (!panX && !panY) return

    const elasticX = panX != null && flingable(panX)
    const elasticY = panY != null && flingable(panY)

    // Snapshotted at the press and mapped from the total, like the thumbs:
    // the offset this closure saw is a frame old by the second move. Held in
    // raw units, before banding, so that a press mid-bounce resumes from the
    // distance the visible offset stands for rather than re-resisting it.
    let fromX = 0
    let fromY = 0
    ctx.addHit({
      rect,
      // No cursor: a mouse hovering the content must see no change.
      drag: {
        pointerTypes: ['touch', 'pen'],
        onStart: () => {
          // A press during a fling or a bounce stops it where the content is.
          if (panX && flingable(panX)) panX.settle(panX())
          if (panY && flingable(panY)) panY.settle(panY())
          fromX = unband(panX?.() ?? 0, maxX, rect.w)
          fromY = unband(panY?.() ?? 0, maxY, rect.h)
        },
        // Content follows the finger 1:1, so it moves the way the finger does
        // and the offset moves against it — until an end, where the band
        // takes over and it follows a shrinking fraction of the finger.
        onMove: (d) => {
          if (panX) put(panX, band(fromX - d.tx, maxX, rect.w, elasticX))
          if (panY) put(panY, band(fromY - d.ty, maxY, rect.h, elasticY))
        },
        onEnd: (d) => {
          release(panX, -d.vx, maxX)
          release(panY, -d.vy, maxY)
        },
      },
    })
  }

  private drawBars(
    rect: Rect,
    content: Size,
    x: number,
    y: number,
    maxX: number,
    maxY: number,
    ctx: Ctx,
  ): void {
    // The offset can sit outside the content while a band is stretched; the
    // thumb stays pinned to its track rather than sliding off the end of it.
    const ratio = (v: number, max: number): number => clamp(v / max, 0, 1)

    if (maxY > 0 && this.axes.y) {
      const h = Math.max(BAR_MIN, rect.h * (rect.h / content.h))
      const travel = rect.h - h
      const thumb = {
        x: rect.x + rect.w - BAR_THICKNESS - BAR_INSET,
        y: rect.y + travel * ratio(y, maxY),
        w: BAR_THICKNESS,
        h,
      }
      ctx.emit({
        t: 'rect',
        rect: thumb,
        radius: BAR_THICKNESS / 2,
        opacity: ctx.env.opacity * 0.8,
        fill: BAR_COLOR,
      })
      this.grab(thumb, 'y', travel, maxY, ctx)
    }

    if (maxX > 0 && this.axes.x) {
      const w = Math.max(BAR_MIN, rect.w * (rect.w / content.w))
      const travel = rect.w - w
      const thumb = {
        x: rect.x + travel * ratio(x, maxX),
        y: rect.y + rect.h - BAR_THICKNESS - BAR_INSET,
        w,
        h: BAR_THICKNESS,
      }
      ctx.emit({
        t: 'rect',
        rect: thumb,
        radius: BAR_THICKNESS / 2,
        opacity: ctx.env.opacity * 0.8,
        fill: BAR_COLOR,
      })
      this.grab(thumb, 'x', travel, maxX, ctx)
    }
  }

  /**
   * Makes a thumb draggable. The offset at the press is captured once and the
   * gesture's total displacement is scaled onto it, so the thumb tracks the
   * pointer exactly instead of drifting as the layout moves underneath.
   */
  private grab(
    thumb: Rect,
    axis: 'x' | 'y',
    travel: number,
    max: number,
    ctx: Ctx,
  ): void {
    const offset = this.axes[axis]
    if (!offset || travel <= 0) return

    // Padded on the cross axis only: widening it along the track would let a
    // press past the end of the thumb start a drag from the wrong place.
    const vertical = axis === 'y'
    let from = 0
    ctx.addHit({
      rect: {
        x: vertical ? thumb.x - BAR_GRAB : thumb.x,
        y: vertical ? thumb.y : thumb.y - BAR_GRAB,
        w: vertical ? thumb.w + BAR_GRAB * 2 : thumb.w,
        h: vertical ? thumb.h : thumb.h + BAR_GRAB * 2,
      },
      cursor: 'grab',
      drag: {
        onStart: () => {
          from = offset()
        },
        onMove: (d) => {
          const moved = (vertical ? d.ty : d.tx) * (max / travel)
          put(offset, clamp(from + moved, 0, max))
        },
      },
    })
  }
}

export function ScrollView(offset: ScrollOffset, child: View): View {
  return new ScrollViewImpl(offset, child)
}
