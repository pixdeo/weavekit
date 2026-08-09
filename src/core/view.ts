import type { Ctx } from './ctx'
import type { Drag, DragHandlers, Font, Insets, Proposal, Rect, Size } from './types'
import { concrete, inset, insets, shrink } from './types'

/**
 * Every view answers two questions, exactly like SwiftUI's Layout protocol:
 *
 *   measure(proposal) -> "given this much room, how big do you want to be?"
 *   place(rect)       -> "here is your final rect; position children, emit draw ops"
 *
 * Modifiers are not special: each one is a view that wraps a child. That is why
 * `.padding().background()` differs from `.background().padding()` for free.
 */
export abstract class View {
  abstract measure(p: Proposal, ctx: Ctx): Size
  abstract place(rect: Rect, ctx: Ctx): void

  padding(v: number | Partial<Insets> = 8): View {
    return new Padding(this, insets(v))
  }

  frame(w: number | null = null, h: number | null = null): View {
    return new Frame(this, w, h)
  }

  /** SwiftUI's `.frame(maxWidth: .infinity, maxHeight: .infinity)`. */
  expand(axis: 'both' | 'h' | 'v' = 'both'): View {
    return new Expand(this, axis)
  }

  background(v: View): View {
    return new Background(this, v)
  }

  overlay(v: View): View {
    return new Overlay(this, v)
  }

  font(f: Partial<Font>): View {
    return new EnvMod(this, { font: f })
  }

  foreground(color: string): View {
    return new EnvMod(this, { foreground: color })
  }

  opacity(o: number): View {
    return new OpacityMod(this, o)
  }

  offset(dx: number, dy: number): View {
    return new Offset(this, dx, dy)
  }

  onTap(handler: () => void, cursor = 'pointer'): View {
    return new TapMod(this, handler, cursor)
  }

  /**
   * Follows the pointer from a press inside this view until it is released,
   * wherever it travels — the view keeps the pointer for the whole gesture.
   *
   * Pass a function for move-only drags, or the three handlers when the
   * gesture needs to snapshot state at `onStart` and settle at `onEnd`. Read
   * `tx`/`ty` against that snapshot rather than accumulating `dx`/`dy`.
   */
  onDrag(handlers: DragHandlers | ((d: Drag) => void), cursor = 'grab'): View {
    return new DragMod(this, typeof handlers === 'function' ? { onMove: handlers } : handlers, cursor)
  }

  /** Cursor feedback without a tap handler — resize handles, drag surfaces. */
  cursor(cursor: string): View {
    return new CursorMod(this, cursor)
  }

  /**
   * Confines everything this view draws — and everything it responds to — to
   * its own rect. Nested clips intersect.
   */
  clip(): View {
    return new Clip(this)
  }

  /**
   * Reports this view's final rect during `place`. Use it to line a DOM
   * element up with a canvas-laid-out region — a text editor, a video, an
   * input. Cached subtrees do not re-place, so the callback only fires when
   * the rect could actually have changed.
   */
  onLayout(handler: (rect: Rect) => void): View {
    return new LayoutReporter(this, handler)
  }
}

class Padding extends View {
  constructor(
    private child: View,
    private i: Insets,
  ) {
    super()
  }

  measure(p: Proposal, ctx: Ctx): Size {
    const inner = this.child.measure(shrink(p, this.i), ctx)
    return { w: inner.w + this.i.l + this.i.r, h: inner.h + this.i.t + this.i.b }
  }

  place(rect: Rect, ctx: Ctx): void {
    this.child.place(inset(rect, this.i), ctx)
  }
}

class Frame extends View {
  constructor(
    private child: View,
    private w: number | null,
    private h: number | null,
  ) {
    super()
  }

  measure(p: Proposal, ctx: Ctx): Size {
    const proposal: Proposal = { w: this.w ?? p.w, h: this.h ?? p.h }
    const inner = this.child.measure(proposal, ctx)
    return { w: this.w ?? inner.w, h: this.h ?? inner.h }
  }

  place(rect: Rect, ctx: Ctx): void {
    const inner = this.child.measure({ w: rect.w, h: rect.h }, ctx)
    // Children are centred inside a fixed frame, matching SwiftUI's default.
    this.child.place(
      {
        x: rect.x + (rect.w - inner.w) / 2,
        y: rect.y + (rect.h - inner.h) / 2,
        w: inner.w,
        h: inner.h,
      },
      ctx,
    )
  }
}

class Expand extends View {
  constructor(
    private child: View,
    private axis: 'both' | 'h' | 'v',
  ) {
    super()
  }

  measure(p: Proposal, ctx: Ctx): Size {
    const inner = this.child.measure(p, ctx)
    const fillW = this.axis !== 'v'
    const fillH = this.axis !== 'h'
    return {
      w: fillW ? Math.max(inner.w, concrete(p.w, inner.w)) : inner.w,
      h: fillH ? Math.max(inner.h, concrete(p.h, inner.h)) : inner.h,
    }
  }

  place(rect: Rect, ctx: Ctx): void {
    this.child.place(rect, ctx)
  }
}

class Background extends View {
  constructor(
    private child: View,
    private bg: View,
  ) {
    super()
  }

  measure(p: Proposal, ctx: Ctx): Size {
    return this.child.measure(p, ctx)
  }

  place(rect: Rect, ctx: Ctx): void {
    this.bg.measure({ w: rect.w, h: rect.h }, ctx)
    this.bg.place(rect, ctx)
    this.child.place(rect, ctx)
  }
}

class Overlay extends View {
  constructor(
    private child: View,
    private top: View,
  ) {
    super()
  }

  measure(p: Proposal, ctx: Ctx): Size {
    return this.child.measure(p, ctx)
  }

  place(rect: Rect, ctx: Ctx): void {
    this.child.place(rect, ctx)
    this.top.measure({ w: rect.w, h: rect.h }, ctx)
    this.top.place(rect, ctx)
  }
}

class EnvMod extends View {
  constructor(
    private child: View,
    private patch: { font?: Partial<Font>; foreground?: string },
  ) {
    super()
  }

  private apply<T>(ctx: Ctx, fn: () => T): T {
    const next: { font?: Font; foreground?: string } = {}
    if (this.patch.font) next.font = { ...ctx.env.font, ...this.patch.font }
    if (this.patch.foreground) next.foreground = this.patch.foreground
    return ctx.withEnv(next, fn)
  }

  measure(p: Proposal, ctx: Ctx): Size {
    return this.apply(ctx, () => this.child.measure(p, ctx))
  }

  place(rect: Rect, ctx: Ctx): void {
    this.apply(ctx, () => this.child.place(rect, ctx))
  }
}

class OpacityMod extends View {
  constructor(
    private child: View,
    private o: number,
  ) {
    super()
  }

  measure(p: Proposal, ctx: Ctx): Size {
    return this.child.measure(p, ctx)
  }

  place(rect: Rect, ctx: Ctx): void {
    ctx.withEnv({ opacity: ctx.env.opacity * this.o }, () => this.child.place(rect, ctx))
  }
}

class Offset extends View {
  constructor(
    private child: View,
    private dx: number,
    private dy: number,
  ) {
    super()
  }

  measure(p: Proposal, ctx: Ctx): Size {
    return this.child.measure(p, ctx)
  }

  place(rect: Rect, ctx: Ctx): void {
    this.child.place({ ...rect, x: rect.x + this.dx, y: rect.y + this.dy }, ctx)
  }
}

class TapMod extends View {
  constructor(
    private child: View,
    private handler: () => void,
    private cursorName: string,
  ) {
    super()
  }

  measure(p: Proposal, ctx: Ctx): Size {
    return this.child.measure(p, ctx)
  }

  place(rect: Rect, ctx: Ctx): void {
    // Pushed before the child so nested handlers land later in the list and
    // win when the hit test scans back-to-front.
    ctx.addHit({ rect, handler: this.handler, cursor: this.cursorName })
    this.child.place(rect, ctx)
  }
}

class DragMod extends View {
  constructor(
    private child: View,
    private handlers: DragHandlers,
    private cursorName: string,
  ) {
    super()
  }

  measure(p: Proposal, ctx: Ctx): Size {
    return this.child.measure(p, ctx)
  }

  place(rect: Rect, ctx: Ctx): void {
    // Before the child, for the same reason as a tap: nested gestures land
    // later in the list and win the back-to-front scan.
    ctx.addHit({ rect, drag: this.handlers, cursor: this.cursorName })
    this.child.place(rect, ctx)
  }
}

class Clip extends View {
  constructor(private child: View) {
    super()
  }

  measure(p: Proposal, ctx: Ctx): Size {
    return this.child.measure(p, ctx)
  }

  place(rect: Rect, ctx: Ctx): void {
    ctx.withClip(rect, () => this.child.place(rect, ctx))
  }
}

class LayoutReporter extends View {
  constructor(
    private child: View,
    private handler: (rect: Rect) => void,
  ) {
    super()
  }

  measure(p: Proposal, ctx: Ctx): Size {
    return this.child.measure(p, ctx)
  }

  place(rect: Rect, ctx: Ctx): void {
    this.child.place(rect, ctx)
    this.handler(rect)
  }
}

class CursorMod extends View {
  constructor(
    private child: View,
    private cursorName: string,
  ) {
    super()
  }

  measure(p: Proposal, ctx: Ctx): Size {
    return this.child.measure(p, ctx)
  }

  place(rect: Rect, ctx: Ctx): void {
    ctx.addHit({ rect, cursor: this.cursorName })
    this.child.place(rect, ctx)
  }
}
