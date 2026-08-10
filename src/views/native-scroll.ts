import type { Ctx } from '../core/ctx'
import { View } from '../core/view'
import type { Proposal, Rect, Size } from '../core/types'
import { clamp, concrete } from '../core/types'
import type { Animated } from '../core/animation'
import type { ScrollAxis, ScrollOffset } from './scroll'

/**
 * PROTOTYPE — the third scrolling flavour, next to ScrollView's plain and
 * animated axes, and the answer to "how do the canvas apps that feel native
 * do it". They do not simulate the gesture at all: a real, invisible
 * scrollable element sits exactly over the viewport and owns it — the phase
 * information, the momentum curve and the rubber band that WheelEvent never
 * exposes — and the offset is simply read back out of `scrollTop` into the
 * caller's signal. The canvas draws the content; the DOM owns the input.
 *
 * What this buys, per NOTES-scroll-bounce.md: the band holds while fingers
 * rest on the trackpad, the return starts at lift-off, and momentum needs no
 * statistical detection — all of it is the browser's. What it costs:
 *
 * - The overlay swallows presses meant for the content beneath it. Hit
 *   testing would have to be forwarded back to the canvas for this to be
 *   more than a prototype.
 * - A viewport whose content fits still keeps the wheel (and rubber-bands),
 *   where ScrollView would chain it to an enclosing region.
 * - Whether the stretch is *visible* depends on the engine reporting
 *   out-of-range offsets during the bounce; where it clamps them, the timing
 *   is native but the band does not show.
 */

const flingable = (axis: ScrollAxis): axis is Animated => 'settle' in axis

/** Same rule as ScrollView: a hand driving the offset never animates it. */
const put = (axis: ScrollAxis, v: number): void => {
  if (flingable(axis)) axis.settle(v)
  else axis.set(v)
}

/**
 * The absolutely-positioned element the hidden scrollers are appended to. It
 * must sit exactly over the canvas and ignore the pointer itself — each
 * scroller switches its own pointer events on. The gallery wires its
 * `#overlay` here; headless runs leave it null and get layout only.
 */
let layer: HTMLElement | null = null

export function setNativeScrollLayer(el: HTMLElement | null): void {
  layer = el
}

/** The native bars are hidden; the canvas draws its own, as ScrollView does. */
const ensureStyle = (): void => {
  if (document.getElementById('cui-nscroll-style')) return
  const style = document.createElement('style')
  style.id = 'cui-nscroll-style'
  style.textContent =
    '.cui-nscroll{scrollbar-width:none}.cui-nscroll::-webkit-scrollbar{display:none}'
  document.head.appendChild(style)
}

interface Scroller {
  el: HTMLDivElement
  spacer: HTMLDivElement
  /**
   * The last offsets the scroller reported itself. A signal holding anything
   * else was written from outside — a reset, a restore — and is handed back
   * to the element; its own writes already agree, so this never fights the
   * gesture.
   */
  reportedX: number
  reportedY: number
}

/**
 * Live scrollers, keyed by the axis signal. As with ScrollView's episodes,
 * the signal is the stable object: the `ScrollOffset` wrapper and the view
 * itself are rebuilt every frame.
 */
const active = new Map<ScrollAxis, Scroller>()

/** Ctx objects already carrying the end-of-pass sweeper. */
const hooked = new WeakSet<Ctx>()

/**
 * A scroller not claimed during a pass is no longer in the tree — the example
 * switched, the code was edited — and its element has to go, or an invisible
 * div keeps eating the wheel over a rect nothing scrolls.
 */
const hookSweep = (ctx: Ctx): void => {
  if (hooked.has(ctx)) return
  hooked.add(ctx)
  ctx.onPassEnd(() => {
    for (const [key, s] of active) {
      if (ctx.claims.includes(s)) continue
      s.el.remove()
      active.delete(key)
    }
  })
}

const createScroller = (axes: ScrollOffset): Scroller => {
  ensureStyle()
  const el = document.createElement('div')
  el.className = 'cui-nscroll'
  Object.assign(el.style, {
    position: 'absolute',
    overflow: 'auto',
    pointerEvents: 'auto',
    background: 'transparent',
  } satisfies Partial<CSSStyleDeclaration>)
  const spacer = document.createElement('div')
  el.appendChild(spacer)
  layer!.appendChild(el)

  const s: Scroller = { el, spacer, reportedX: 0, reportedY: 0 }
  // The whole point of the prototype: the browser owns the gesture, and the
  // offset is just read back out of it.
  el.addEventListener(
    'scroll',
    () => {
      s.reportedX = el.scrollLeft
      s.reportedY = el.scrollTop
      if (axes.x) put(axes.x, s.reportedX)
      if (axes.y) put(axes.y, s.reportedY)
    },
    { passive: true },
  )
  return s
}

const BAR_THICKNESS = 4
const BAR_INSET = 3
const BAR_MIN = 24
const BAR_COLOR = '#3f3f46'

/**
 * A viewport onto a taller or wider child, scrolled by a hidden native
 * element rather than by the toolkit's own wheel and pan handling. The offset
 * is still a signal the caller owns: the scroller reports into it, and writes
 * to it from elsewhere are pushed back to the element.
 */
class NativeScrollViewImpl extends View {
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
    return { w: concrete(p.w, content.w), h: concrete(p.h, content.h) }
  }

  place(rect: Rect, ctx: Ctx): void {
    const content = this.child.measure(this.childProposal(rect.w, rect.h), ctx)
    const maxX = Math.max(0, content.w - rect.w)
    const maxY = Math.max(0, content.h - rect.h)
    // Read as-is, like ScrollView: an out-of-range offset is the rubber band
    // being visible, which is what the native scroller reports mid-bounce.
    const x = this.axes.x?.() ?? 0
    const y = this.axes.y?.() ?? 0

    this.syncDom(rect, content, ctx)

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

  /** Lines the hidden scroller up with this viewport and claims it. */
  private syncDom(rect: Rect, content: Size, ctx: Ctx): void {
    if (!layer) return
    const key = this.axes.y ?? this.axes.x
    if (!key) return
    hookSweep(ctx)

    let s = active.get(key)
    if (!s) {
      s = createScroller(this.axes)
      active.set(key, s)
    }
    ctx.claim(s)

    s.el.style.left = `${rect.x}px`
    s.el.style.top = `${rect.y}px`
    s.el.style.width = `${rect.w}px`
    s.el.style.height = `${rect.h}px`
    s.spacer.style.width = `${content.w}px`
    s.spacer.style.height = `${content.h}px`

    const x = this.axes.x?.() ?? 0
    const y = this.axes.y?.() ?? 0
    if (this.axes.x && x !== s.reportedX) {
      s.el.scrollLeft = x
      s.reportedX = s.el.scrollLeft
    }
    if (this.axes.y && y !== s.reportedY) {
      s.el.scrollTop = y
      s.reportedY = s.el.scrollTop
    }
  }

  /** The same bars ScrollView draws, minus the grab: indicative only. */
  private drawBars(
    rect: Rect,
    content: Size,
    x: number,
    y: number,
    maxX: number,
    maxY: number,
    ctx: Ctx,
  ): void {
    const ratio = (v: number, max: number): number => clamp(v / max, 0, 1)

    if (maxY > 0 && this.axes.y) {
      const h = Math.max(BAR_MIN, rect.h * (rect.h / content.h))
      ctx.emit({
        t: 'rect',
        rect: {
          x: rect.x + rect.w - BAR_THICKNESS - BAR_INSET,
          y: rect.y + (rect.h - h) * ratio(y, maxY),
          w: BAR_THICKNESS,
          h,
        },
        radius: BAR_THICKNESS / 2,
        opacity: ctx.env.opacity * 0.8,
        fill: BAR_COLOR,
      })
    }

    if (maxX > 0 && this.axes.x) {
      const w = Math.max(BAR_MIN, rect.w * (rect.w / content.w))
      ctx.emit({
        t: 'rect',
        rect: {
          x: rect.x + (rect.w - w) * ratio(x, maxX),
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

export function NativeScrollView(offset: ScrollOffset, child: View): View {
  return new NativeScrollViewImpl(offset, child)
}
