import type { Ctx } from '../core/ctx'
import { View } from '../core/view'
import type { Proposal, Rect, Shadow, Size } from '../core/types'
import { concrete } from '../core/types'

/** Shapes fill whatever they are proposed, like SwiftUI's Shape views. */
export class Shape extends View {
  private fillColor?: string
  private strokeColor?: string
  private lineWidth = 1
  private dropShadow?: Shadow

  constructor(
    private kind: 'rect' | 'ellipse',
    private radius = 0,
  ) {
    super()
  }

  fill(color: string): this {
    this.fillColor = color
    return this
  }

  stroke(color: string, width = 1): this {
    this.strokeColor = color
    this.lineWidth = width
    return this
  }

  /**
   * A drop shadow under this shape.
   *
   * On the shape rather than as a `View` modifier because a shadow is part of
   * how a shape is painted, not a box wrapped around one — and because a
   * modifier would have to know the silhouette of whatever it wraps, which
   * only the shape does.
   */
  shadow(color: string, o: { blur?: number; dx?: number; dy?: number } = {}): this {
    this.dropShadow = { color, blur: o.blur ?? 8, dx: o.dx ?? 0, dy: o.dy ?? 2 }
    return this
  }

  measure(p: Proposal): Size {
    return { w: concrete(p.w, 10), h: concrete(p.h, 10) }
  }

  place(rect: Rect, ctx: Ctx): void {
    if (this.kind === 'rect') {
      ctx.emit({
        t: 'rect',
        rect,
        radius: this.radius,
        opacity: ctx.env.opacity,
        fill: this.fillColor,
        stroke: this.strokeColor,
        lineWidth: this.lineWidth,
        shadow: this.dropShadow,
      })
    } else {
      ctx.emit({
        t: 'ellipse',
        rect,
        opacity: ctx.env.opacity,
        fill: this.fillColor,
        stroke: this.strokeColor,
        lineWidth: this.lineWidth,
        shadow: this.dropShadow,
      })
    }
  }
}

export const Rectangle = (): Shape => new Shape('rect', 0)
export const RoundedRect = (radius: number): Shape => new Shape('rect', radius)
export const Ellipse = (): Shape => new Shape('ellipse')
export const Circle = (): Shape => new Shape('ellipse')
