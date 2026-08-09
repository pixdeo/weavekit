import type { Ctx } from '../core/ctx'
import { View } from '../core/view'
import type { Proposal, Rect, Size } from '../core/types'
import { clamp, concrete } from '../core/types'
import type { Signal } from '../core/signal'

export interface ScrollOffset {
  /** Provide a signal per scrollable axis. An absent axis does not scroll. */
  x?: Signal<number>
  y?: Signal<number>
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
    const x = clamp(this.axes.x?.() ?? 0, 0, maxX)
    const y = clamp(this.axes.y?.() ?? 0, 0, maxY)

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
   * pointer — so it clamps and holds.
   */
  private pan(rect: Rect, maxX: number, maxY: number, ctx: Ctx): void {
    const panX = this.axes.x && maxX > 0 ? this.axes.x : null
    const panY = this.axes.y && maxY > 0 ? this.axes.y : null
    if (!panX && !panY) return

    // Snapshotted at the press and mapped from the total, like the thumbs:
    // the offset this closure saw is a frame old by the second move.
    let fromX = 0
    let fromY = 0
    ctx.addHit({
      rect,
      // No cursor: a mouse hovering the content must see no change.
      drag: {
        pointerTypes: ['touch', 'pen'],
        onStart: () => {
          fromX = panX?.() ?? 0
          fromY = panY?.() ?? 0
        },
        // Content follows the finger 1:1, so it moves the way the finger does
        // and the offset moves against it.
        onMove: (d) => {
          panX?.set(clamp(fromX - d.tx, 0, maxX))
          panY?.set(clamp(fromY - d.ty, 0, maxY))
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
    if (maxY > 0 && this.axes.y) {
      const h = Math.max(BAR_MIN, rect.h * (rect.h / content.h))
      const travel = rect.h - h
      const thumb = {
        x: rect.x + rect.w - BAR_THICKNESS - BAR_INSET,
        y: rect.y + travel * (y / maxY),
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
        x: rect.x + travel * (x / maxX),
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
          offset.set(clamp(from + moved, 0, max))
        },
      },
    })
  }
}

export function ScrollView(offset: ScrollOffset, child: View): View {
  return new ScrollViewImpl(offset, child)
}
