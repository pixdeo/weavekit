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
 * How much of a further unit of raw travel the content still takes, `dresist`
 * at `over` units past the end.
 *
 * This is what makes a release out of range look right. A finger crossing the
 * glass at 900 units a second is only moving the content at a fraction of
 * that — the band is between them — so handing the spring the finger's own
 * speed throws the content far past anywhere the band ever let it go, and the
 * long trip back from there is the "it overshoots and takes forever" that a
 * rubber band is never supposed to do. The content leaves at the speed it was
 * visibly moving at, which is this.
 */
const bandSlope = (over: number, dim: number): number => {
  const limit = dim * BAND_LIMIT
  if (limit <= 0) return 0
  const k = 1 + (over * RUBBER) / limit
  return RUBBER / (k * k)
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
 * being cut short. A bounce carries the velocity too — through the band, which
 * is the only version of it the content was ever moving at.
 */
const release = (axis: ScrollAxis | null, velocity: number, max: number, dim: number): void => {
  if (!axis || !flingable(axis)) return
  const at = axis()
  if (at < 0 || at > max) {
    const over = at < 0 ? -at : at - max
    axis.set(clamp(at, 0, max), velocity * bandSlope(over, dim))
    return
  }
  if (Math.abs(velocity) < FLING_MIN) return
  axis.set(clamp(project(at, velocity), 0, max), velocity)
}

/**
 * How long the band holds after the last delta that still looked like a hand.
 *
 * A wheel has no release to hook onto — there is no event for "the fingers
 * left the trackpad" — so a hand that stops pushing and a hand that lifts look
 * identical, and this is how long the content waits before deciding it was the
 * second one. Long enough that a pause mid-push does not snatch the stretch
 * away; short enough that letting go feels answered.
 */
const HAND_HOLD = 180

/**
 * And once the wheel has been recognised as coasting.
 *
 * Momentum has no fingers left to wait for, so the moment it is identified the
 * countdown collapses to the shortest gap that is not a flicker. macOS keeps
 * delivering momentum for a second or more after the fingers lift; waiting for
 * it to stop left the content sitting stretched and motionless for a measured
 * 2.6s. That is not a slow spring, it is a stalled one, and no amount of
 * tuning the spring reaches it.
 */
const TAIL_AFTER = 50

/**
 * Ratios that tell a coasting wheel from a driven one.
 *
 * Momentum decays geometrically and only ever decays. That is the whole signal
 * — the platform exposes no phase on a wheel event — but reading it as "small
 * compared to the biggest delta so far" is wrong, and wrong in the way people
 * actually notice: flick to the end and then keep pushing gently to hold the
 * stretch open, and every one of those small deliberate deltas is filed as a
 * tail. The band lets go while the fingers are still moving.
 *
 * Compared against the *previous* delta instead, that gesture reads correctly:
 * gentle-but-steady is not decay. `DECAY` is how much smaller a delta has to
 * be to count as decaying at all — set below a trackpad's ~6% a frame with
 * room for jitter — and `DECAYS` how many must arrive in a row before the
 * wheel is called coasting, so one slow frame is not enough. `RISE` undoes it:
 * momentum never speeds up, so anything clearly larger than the delta before
 * it means the fingers are back.
 */
const DECAY = 0.97
const DECAYS = 3
const RISE = 1.15

/**
 * A delta this large relative to the episode's hardest is a push regardless of
 * what the decay test thinks. It covers the opening frames, where there is not
 * yet a run of anything to look at.
 */
const LOUD = 0.8

/** How long after the last delta of any kind an overscroll episode is over. */
const EPISODE_QUIET = 200

/**
 * One episode of overscroll: from the moment the content leaves the range
 * until the wheel goes quiet. Not until the content comes back — the two are
 * different moments, and the gap between them is where the tail lives.
 *
 * Ending it at the return instead is what made the bounce wobble. Momentum
 * outlasts the trip home by a long way, so the first delta to arrive after the
 * content lands starts a fresh episode, stretches the band again, and bounces
 * again: a pulse every 250ms for as long as the tail runs.
 */
interface Episode {
  /** Which end it is hanging off: -1 before the start, +1 past the end. */
  side: -1 | 1
  /** The pending return, or null once it has started, and its deadline. */
  bounce: ReturnType<typeof setTimeout> | null
  deadline: number
  /** Ends the episode once the wheel delivers nothing at all for a while. */
  quiet: ReturnType<typeof setTimeout> | null
  /** Strongest delta of the episode, and the one immediately before this. */
  peak: number
  prev: number
  /** Consecutive decaying deltas, and whether that has named it momentum. */
  decays: number
  coasting: boolean
  /** True once the return has begun. */
  returning: boolean
}

/**
 * Live episodes, keyed by the axis they belong to.
 *
 * A `ScrollViewImpl` is rebuilt every frame, so it is the wrong place to keep
 * anything that has to outlive one. The axis signal is the stable object in
 * play — the caller owns it and it is the same object across frames — so it is
 * what this hangs off.
 */
const episodes = new WeakMap<Animated, Episode>()

const endEpisode = (axis: ScrollAxis | null): void => {
  if (!axis || !flingable(axis)) return
  const ep = episodes.get(axis)
  if (!ep) return
  if (ep.bounce) clearTimeout(ep.bounce)
  if (ep.quiet) clearTimeout(ep.quiet)
  episodes.delete(axis)
}

/** Kept alive by traffic of any kind, including the deltas being dropped. */
const keepAlive = (axis: Animated, ep: Episode): void => {
  if (ep.quiet) clearTimeout(ep.quiet)
  ep.quiet = setTimeout(() => endEpisode(axis), EPISODE_QUIET)
}

/**
 * Starts, or puts off, the return. `delta` is the wheel delta that just
 * landed; whether it reads as a hand or as a tail is what sets the deadline.
 */
const armBounce = (axis: Animated, max: number, delta: number, side: -1 | 1): void => {
  let ep = episodes.get(axis)
  if (!ep) {
    ep = {
      side, bounce: null, deadline: 0, quiet: null,
      peak: 0, prev: 0, decays: 0, coasting: false, returning: false,
    }
    episodes.set(axis, ep)
  }

  const mag = Math.abs(delta)
  if (mag < ep.prev * DECAY) ep.decays++
  else ep.decays = 0
  if (ep.decays >= DECAYS) ep.coasting = true
  // Momentum never speeds up.
  if (mag > ep.prev * RISE) ep.coasting = false
  ep.prev = mag
  ep.peak = Math.max(ep.peak, mag)
  ep.side = side
  keepAlive(axis, ep)

  const driven = !ep.coasting || mag >= ep.peak * LOUD
  // A tail arriving on top of a countdown that is already the short one has
  // nothing to say. Waiting for the tail to stop is what stalled the spring.
  if (!driven && ep.bounce && ep.deadline === TAIL_AFTER) return

  if (ep.bounce) clearTimeout(ep.bounce)
  ep.deadline = driven ? HAND_HOLD : TAIL_AFTER
  ep.bounce = setTimeout(() => {
    ep.bounce = null
    // Where it is *heading*, not where it is. A wheel lands immediately so the
    // two agree, but a fling taken over by a wheel may still be in flight, and
    // it is the destination that decides whether to bounce.
    const at = axis.target()
    if (at < 0 || at > max) {
      ep.returning = true
      axis.set(clamp(at, 0, max), 0)
    } else {
      endEpisode(axis)
    }
  }, ep.deadline)
}

/**
 * True while the content is outside the range and heading back in — that is, a
 * bounce is under way. A fling does not qualify: it runs from inside the
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

    // Once the return has begun, momentum still pushing outwards is swallowed
    // rather than allowed to stretch the band again — otherwise the tail of a
    // trackpad flick fights the return the whole way home, and goes on
    // restretching it long after the content has landed. Consumed, not
    // rejected: handing it to an enclosing viewport would scroll that one
    // instead, which is worse than doing nothing.
    const ep = elastic && flingable(axis) ? episodes.get(axis) : undefined
    if (elastic && (ep?.returning || bouncingBack(axis, max))) {
      const side = ep?.side ?? (from < 0 ? -1 : 1)
      // A delta clearly bigger than the one before it is a fresh push, not the
      // tail: momentum never speeds up. It takes the content back, as does
      // anything aimed inward.
      const dropped = delta * side > 0 && !(ep && Math.abs(delta) > ep.prev * RISE)
      if (dropped) {
        if (ep) {
          ep.prev = Math.abs(delta)
          keepAlive(axis as Animated, ep)
        }
        return true
      }
      endEpisode(axis)
    }

    const next = band(unband(from, max, dim) + delta, max, dim, elastic)
    if (next === from) return false
    put(axis, next)

    if (elastic && flingable(axis)) {
      // Back inside under its own steam: there is nothing left to return to.
      if (next < 0) armBounce(axis, max, delta, -1)
      else if (next > max) armBounce(axis, max, delta, 1)
      else endEpisode(axis)
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
          endEpisode(panX)
          endEpisode(panY)
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
          release(panX, -d.vx, maxX, rect.w)
          release(panY, -d.vy, maxY, rect.h)
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
