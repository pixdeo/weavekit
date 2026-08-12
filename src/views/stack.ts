import type { Ctx } from '../core/ctx'
import { View } from '../core/view'
import type { Align, Proposal, Rect, Size } from '../core/types'
import { SpacerView } from './spacer'

export interface StackOpts {
  spacing?: number
  align?: Align
}

type Axis = 'v' | 'h'

/** Sub-pixel slack when deciding whether a child actually wants more room. */
const EPSILON = 0.01

class Stack extends View {
  private spacing: number
  private align: Align

  constructor(
    private axis: Axis,
    opts: StackOpts,
    private children: View[],
  ) {
    super()
    this.spacing = opts.spacing ?? 0
    this.align = opts.align ?? 'center'
    for (const c of children) if (c instanceof SpacerView) c.axis = axis
  }

  private prop(main: number | null, cross: number | null): Proposal {
    return this.axis === 'v' ? { w: cross, h: main } : { w: main, h: cross }
  }

  private main(s: Size): number {
    return this.axis === 'v' ? s.h : s.w
  }

  private cross(s: Size): number {
    return this.axis === 'v' ? s.w : s.h
  }

  private mainOf(p: Proposal): number | null {
    return this.axis === 'v' ? p.h : p.w
  }

  private crossOf(p: Proposal): number | null {
    return this.axis === 'v' ? p.w : p.h
  }

  /**
   * Space is handed out in order of increasing flexibility, so rigid children
   * (text, fixed frames) settle before greedy ones (Spacer, .expand()).
   *
   * When everything fits, each child keeps its ideal size and only the greedy
   * children share the surplus. Naively splitting the room evenly would starve
   * a Text sitting next to a Spacer and make it wrap for no reason.
   *
   * When it does not fit, the room is divided evenly among the children that
   * have not been measured yet, least flexible first.
   */
  private layout(p: Proposal, ctx: Ctx): Size[] {
    const n = this.children.length
    if (n === 0) return []

    const cross = this.crossOf(p)
    const available = this.mainOf(p)

    if (available == null || !isFinite(available)) {
      return this.children.map((c) => ctx.measure(c, this.prop(null, cross)))
    }

    const room = Math.max(0, available - this.spacing * (n - 1))
    const ideal = this.children.map((c) => ctx.measure(c, this.prop(null, cross)))
    const idealTotal = ideal.reduce((sum, s) => sum + this.main(s), 0)

    // `room` doubles as the "as much as you want" probe: an actual Infinity
    // would leak into the sums below.
    const upper = this.children.map((c) => this.main(ctx.measure(c, this.prop(room, cross))))

    if (idealTotal <= room) {
      const sizes = ideal.slice()
      const greedy = this.children
        .map((_, i) => ({ i, flex: upper[i] - this.main(ideal[i]) }))
        .filter((g) => g.flex > EPSILON)
        .sort((a, b) => a.flex - b.flex)

      let surplus = room - idealTotal
      let left = greedy.length
      for (const { i } of greedy) {
        const base = this.main(ideal[i])
        const size = ctx.measure(this.children[i], this.prop(base + surplus / left, cross))
        sizes[i] = size
        surplus = Math.max(0, surplus - (this.main(size) - base))
        left--
      }
      return sizes
    }

    const lower = this.children.map((c) => this.main(ctx.measure(c, this.prop(0, cross))))
    const order = this.children
      .map((_, i) => ({ i, flex: upper[i] - lower[i] }))
      .sort((a, b) => a.flex - b.flex)

    const sizes = new Array<Size>(n)
    let remaining = room
    let left = n
    for (const { i } of order) {
      const size = ctx.measure(this.children[i], this.prop(Math.max(0, remaining) / left, cross))
      sizes[i] = size
      remaining -= this.main(size)
      left--
    }
    return sizes
  }

  measure(p: Proposal, ctx: Ctx): Size {
    const n = this.children.length
    if (n === 0) return { w: 0, h: 0 }

    const sizes = this.layout(p, ctx)
    let mainSum = this.spacing * (n - 1)
    let crossMax = 0
    for (const s of sizes) {
      mainSum += this.main(s)
      crossMax = Math.max(crossMax, this.cross(s))
    }
    return this.axis === 'v' ? { w: crossMax, h: mainSum } : { w: mainSum, h: crossMax }
  }

  place(rect: Rect, ctx: Ctx): void {
    const sizes = this.layout({ w: rect.w, h: rect.h }, ctx)
    const crossSpan = this.axis === 'v' ? rect.w : rect.h
    let cursor = this.axis === 'v' ? rect.y : rect.x

    for (let i = 0; i < this.children.length; i++) {
      const size = sizes[i]
      const cross = Math.min(this.cross(size), crossSpan)
      const offset =
        this.align === 'leading' ? 0 : this.align === 'trailing' ? crossSpan - cross : (crossSpan - cross) / 2

      const childRect: Rect =
        this.axis === 'v'
          ? { x: rect.x + offset, y: cursor, w: cross, h: size.h }
          : { x: cursor, y: rect.y + offset, w: size.w, h: cross }

      this.children[i].place(childRect, ctx)
      cursor += this.main(size) + this.spacing
    }
  }
}

type StackArgs = [StackOpts, ...View[]] | View[]

function split(args: StackArgs): [StackOpts, View[]] {
  if (args.length > 0 && !(args[0] instanceof View)) {
    return [args[0] as StackOpts, args.slice(1) as View[]]
  }
  return [{}, args as View[]]
}

export function VStack(...args: StackArgs): View {
  const [opts, children] = split(args)
  return new Stack('v', opts, children)
}

export function HStack(...args: StackArgs): View {
  const [opts, children] = split(args)
  return new Stack('h', opts, children)
}

/**
 * Where a child that does not fill the stack sits inside it. The nine SwiftUI
 * alignments, as fractions of the room left over on each axis: 0 pins to the
 * start, 1 to the end.
 */
export type ZAlign =
  | 'center'
  | 'top'
  | 'bottom'
  | 'leading'
  | 'trailing'
  | 'topLeading'
  | 'topTrailing'
  | 'bottomLeading'
  | 'bottomTrailing'

const ANCHORS: Record<ZAlign, [number, number]> = {
  center: [0.5, 0.5],
  top: [0.5, 0],
  bottom: [0.5, 1],
  leading: [0, 0.5],
  trailing: [1, 0.5],
  topLeading: [0, 0],
  topTrailing: [1, 0],
  bottomLeading: [0, 1],
  bottomTrailing: [1, 1],
}

export interface ZStackOpts {
  align?: ZAlign
}

/**
 * Draws children on top of each other. Each is proposed the stack's rect and
 * placed at the size it answered with, aligned inside — centred by default,
 * matching SwiftUI. A shape or an `.expand()` still fills the stack, because
 * that is what it measures to; a fixed frame keeps its own size instead of
 * being stretched over the whole stack.
 */
class ZStackView extends View {
  private align: ZAlign

  constructor(
    opts: ZStackOpts,
    private children: View[],
  ) {
    super()
    this.align = opts.align ?? 'center'
  }

  measure(p: Proposal, ctx: Ctx): Size {
    let w = 0
    let h = 0
    for (const c of this.children) {
      const s = ctx.measure(c, p)
      w = Math.max(w, s.w)
      h = Math.max(h, s.h)
    }
    return { w, h }
  }

  place(rect: Rect, ctx: Ctx): void {
    const [ax, ay] = ANCHORS[this.align]
    for (const c of this.children) {
      const s = ctx.measure(c, { w: rect.w, h: rect.h })
      c.place(
        {
          x: rect.x + (rect.w - s.w) * ax,
          y: rect.y + (rect.h - s.h) * ay,
          w: s.w,
          h: s.h,
        },
        ctx,
      )
    }
  }
}

type ZStackArgs = [ZStackOpts, ...View[]] | View[]

export function ZStack(...args: ZStackArgs): View {
  if (args.length > 0 && !(args[0] instanceof View)) {
    return new ZStackView(args[0] as ZStackOpts, args.slice(1) as View[])
  }
  return new ZStackView({}, args as View[])
}
