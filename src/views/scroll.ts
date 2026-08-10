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
 * `set` on an `animated()` axis *animates*, which is wrong for anything a hand
 * is directly driving: content that springs toward the input lags behind it,
 * and the whole point of direct manipulation is that it does not. Fingers,
 * scrollbar thumbs and wheel notches all write through here; only a release —
 * a fling or a bounce — animates.
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
 * Rubber-band tension: how much of the first unit past an end the content
 * actually takes. Apple's constant.
 */
const RUBBER = 0.55

/**
 * How far past an end the stretch can ever reach, as a fraction of the
 * viewport.
 *
 * Apple's curve runs out at one whole viewport, which is right for a finger:
 * the pull is bounded by how far a hand can travel across the glass, so the
 * far end of the curve is somewhere you never actually get to. A wheel has no
 * such bound. It can pump deltas all day and walk straight up the asymptote,
 * and a stretch of a full viewport reads as the content having come loose.
 *
 * So the curve is capped well short of that. It is the one place this departs
 * from Apple, and it departs because the input does.
 */
const BAND_LIMIT = 0.3

/**
 * Raw overshoot in, resisted overshoot out. Both positive.
 *
 *   resist(x) = c·x / (x·c/L + 1)        L = dim · BAND_LIMIT
 *
 * Apple's curve, with its far end brought in. The two ends are what make it
 * feel like anything, and they are independent: the slope at zero is `c` for
 * every `L`, so the cap changes where the stretch runs out without touching
 * how it begins.
 *
 * Scaling the whole thing by `1/c` instead, which is an easy thing to do by
 * accident, ruins both at once: it starts at slope 1, which is no resistance
 * at all, and runs out 1.8× further than intended.
 */
const resist = (over: number, dim: number): number => {
  const limit = dim * BAND_LIMIT
  return limit <= 0 ? 0 : (RUBBER * over) / ((over * RUBBER) / limit + 1)
}

/**
 * The exact inverse. Grabbing the content mid-bounce has to resume from the
 * raw distance the visible offset stands for, or the first move of the new
 * drag resists an already-resisted value and the content jumps.
 */
const unresist = (shown: number, dim: number): number => {
  const limit = dim * BAND_LIMIT
  if (limit <= 0) return 0
  // Nothing at or beyond the cap came from a finite push.
  if (shown >= limit) return Infinity
  return shown / (RUBBER * (1 - shown / limit))
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

/**
 * How long the band holds before springing back, in ms, timed from the last
 * delta that still looked like a hand — *not* from the last delta of any kind.
 *
 * This distinction is the whole thing. A wheel has no release to hook onto:
 * there is no event for "the fingers left the trackpad", and macOS keeps
 * delivering momentum deltas for a second or more after they did. Waiting for
 * those to stop means waiting out the entire tail — measured at 2.6s of the
 * content sitting stretched and motionless after a flick whose fingers lifted
 * at 120ms. That is not a slow spring, it is a stalled one, and no amount of
 * tuning the spring reaches it.
 *
 * Timed from the crossing instead, the deadline is bounded by construction.
 * Momentum still arrives; it just no longer postpones anything.
 */
const BOUNCE_AFTER = 50

/**
 * Fraction of an overscroll's strongest delta below which later ones are read
 * as momentum rather than as a hand.
 *
 * Momentum decays geometrically and a hand does not. That is the only signal
 * available — the platform exposes no phase on a wheel event — and it is
 * enough. A delta below this fraction of the hardest one in the episode is a
 * tail and must not postpone the return; at or above it the wheel is still
 * being driven, and the band holds for as long as it is.
 *
 * Set high on purpose. Momentum falls off by about 6% a frame, so a strict
 * threshold is crossed in a few frames while a hand — which does not decay at
 * all — stays above it indefinitely. Lowering it is not more forgiving, it is
 * slower: at 0.5 a tail keeps the band stretched for a further 190ms, which is
 * most of the delay this exists to remove.
 */
const TAIL = 0.8

interface Bounce {
  timer: ReturnType<typeof setTimeout>
  /** Strongest delta seen since the content left the range. */
  peak: number
}

/**
 * Pending bounce-backs, keyed by the axis they will move.
 *
 * A `ScrollViewImpl` is rebuilt every frame, so it is the wrong place to keep
 * anything that has to outlive one. The axis signal is the stable object in
 * play — the caller owns it and it is the same object across frames — so it is
 * what this hangs off.
 */
const bounces = new WeakMap<Animated, Bounce>()

const cancelBounce = (axis: ScrollAxis | null): void => {
  if (!axis || !flingable(axis)) return
  const live = bounces.get(axis)
  if (!live) return
  clearTimeout(live.timer)
  bounces.delete(axis)
}

/**
 * Starts, or puts off, the return. `magnitude` is the size of the delta that
 * just landed, which is what decides between the two.
 */
const armBounce = (axis: Animated, max: number, magnitude: number): void => {
  const live = bounces.get(axis)
  const peak = Math.max(magnitude, live?.peak ?? 0)

  // Decayed well below this episode's peak: momentum, so leave the countdown
  // where it is. Waiting for the tail to stop is what left the content sitting
  // stretched for over two seconds after a flick.
  if (live && magnitude < peak * TAIL) {
    live.peak = peak
    return
  }

  if (live) clearTimeout(live.timer)
  bounces.set(axis, {
    peak,
    timer: setTimeout(() => {
      bounces.delete(axis)
      // Where it is *heading*, not where it is. A wheel lands immediately so
      // the two agree, but a fling taken over by a wheel may still be in
      // flight, and it is the destination that decides whether to bounce.
      const at = axis.target()
      if (at < 0 || at > max) axis.set(clamp(at, 0, max), 0)
    }, BOUNCE_AFTER),
  })
}

/**
 * True while the content is outside the content and heading back in — that is,
 * a bounce is under way. A fling does not qualify: it runs from inside the
 * range, so a wheel can still take one over.
 */
const bouncingBack = (axis: ScrollAxis, max: number): boolean => {
  if (!flingable(axis) || !axis.animating()) return false
  const at = axis()
  const to = axis.target()
  return (at < 0 || at > max) && to >= 0 && to <= max
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
        // `||` after the call on purpose: both axes must run, and only then
        // does it matter whether either of them did anything.
        const movedX = this.axes.x ? this.wheel(this.axes.x, dx, maxX, rect.w) : false
        const movedY = this.axes.y ? this.wheel(this.axes.y, dy, maxY, rect.h) : false
        return movedX || movedY
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
   * One wheel delta on one axis. Reports whether it was consumed.
   *
   * The delta lands immediately, with no interpolation, even on an animated
   * axis. Smoothing each notch through the spring sounds nicer than it is: a
   * trackpad already sends a delta per frame, so animating them stacks the
   * spring's whole response time onto a gesture that was continuous to begin
   * with, and the content trails the fingers. It also couples two unrelated
   * things to one setting — raise `response` for a softer bounce and scrolling
   * goes mushy with it. Here the spec means one thing: how the content coasts
   * and bounces, never how it tracks.
   *
   * Accumulating from the current value rather than the target follows from
   * that, and takes over a fling from where it visibly is instead of jumping
   * to wherever it was headed.
   *
   * An elastic axis bands past its ends and keeps the wheel, which is what a
   * native nested scroller does: once a gesture is in a region, that region
   * owns it and rubber-bands rather than handing it outwards mid-scroll. A
   * region with nothing to scroll still reports false, so the wheel chains out
   * of an enclosing viewport that cannot move — that rule has not changed.
   */
  private wheel(axis: ScrollAxis, delta: number, max: number, dim: number): boolean {
    const elastic = flingable(axis) && max > 0
    const from = axis()

    // Once the bounce is under way, momentum that is still pushing outwards is
    // swallowed rather than allowed to stretch the band again — otherwise the
    // tail of a trackpad flick fights the return the whole way home. Consumed,
    // not rejected: handing it to an enclosing viewport would scroll that one
    // instead, which is worse than doing nothing.
    if (elastic && bouncingBack(axis, max)) {
      const outwards = from < 0 ? delta < 0 : delta > 0
      if (outwards) return true
    }

    const next = band(unband(from, max, dim) + delta, max, dim, elastic)
    if (next === from) return false
    put(axis, next)

    if (elastic) {
      const outside = next < 0 || next > max
      // Back inside under its own steam: there is nothing left to return to.
      if (outside) armBounce(axis, max, Math.abs(delta))
      else cancelBounce(axis)
    }
    return true
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
          // The wheel's pending bounce has to go too, or it fires mid-drag and
          // pulls the content out from under the finger.
          cancelBounce(panX)
          cancelBounce(panY)
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
