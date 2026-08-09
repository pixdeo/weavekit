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

  private drawBars(
    rect: Rect,
    content: Size,
    x: number,
    y: number,
    maxX: number,
    maxY: number,
    ctx: Ctx,
  ): void {
    if (maxY > 0) {
      const h = Math.max(BAR_MIN, rect.h * (rect.h / content.h))
      ctx.emit({
        t: 'rect',
        rect: {
          x: rect.x + rect.w - BAR_THICKNESS - BAR_INSET,
          y: rect.y + (rect.h - h) * (y / maxY),
          w: BAR_THICKNESS,
          h,
        },
        radius: BAR_THICKNESS / 2,
        opacity: ctx.env.opacity * 0.8,
        fill: BAR_COLOR,
      })
    }

    if (maxX > 0) {
      const w = Math.max(BAR_MIN, rect.w * (rect.w / content.w))
      ctx.emit({
        t: 'rect',
        rect: {
          x: rect.x + (rect.w - w) * (x / maxX),
          y: rect.y + rect.h - BAR_THICKNESS - BAR_INSET,
          w,
          h: BAR_THICKNESS,
        },
        radius: BAR_THICKNESS / 2,
        opacity: ctx.env.opacity * 0.8,
        fill: BAR_COLOR,
      })
    }
  }
}

export function ScrollView(offset: ScrollOffset, child: View): View {
  return new ScrollViewImpl(offset, child)
}
