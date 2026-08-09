import type { Ctx } from '../core/ctx'
import { View } from '../core/view'
import type { Proposal, Rect, Size } from '../core/types'
import { textWidth, wrapText } from '../core/text-measure'

export interface TextOpts {
  lineHeight?: number
  /**
   * Off for code and other whitespace-sensitive text: lines break only on
   * `\n`, indentation is preserved, and the view may exceed the proposal.
   */
  wrap?: boolean
}

class TextView extends View {
  private lines: string[] = []
  private lineHeight: number
  private wrap: boolean

  constructor(
    private src: string | (() => string),
    opts: TextOpts,
  ) {
    super()
    this.lineHeight = opts.lineHeight ?? 1.35
    this.wrap = opts.wrap ?? true
  }

  private value(): string {
    return typeof this.src === 'function' ? this.src() : this.src
  }

  private layoutLines(maxWidth: number | null, ctx: Ctx): Size {
    const font = ctx.env.font
    const text = this.value()

    if (!this.wrap) {
      this.lines = text.split('\n')
    } else if (maxWidth == null || !isFinite(maxWidth)) {
      this.lines = [text]
    } else {
      this.lines = wrapText(text, font, maxWidth)
    }

    let w = 0
    for (const line of this.lines) w = Math.max(w, textWidth(line, font))
    return {
      w: this.wrap && maxWidth != null && isFinite(maxWidth) ? Math.min(w, maxWidth) : w,
      h: Math.max(1, this.lines.length) * font.size * this.lineHeight,
    }
  }

  measure(p: Proposal, ctx: Ctx): Size {
    return this.layoutLines(p.w, ctx)
  }

  place(rect: Rect, ctx: Ctx): void {
    // Re-wrap at the final width: the last measure may have used a probe.
    this.layoutLines(rect.w, ctx)
    ctx.emit({
      t: 'text',
      rect,
      lines: this.lines,
      font: ctx.env.font,
      color: ctx.env.foreground,
      opacity: ctx.env.opacity,
      lineHeight: this.lineHeight,
    })
  }
}

export function Text(src: string | (() => string), opts: TextOpts = {}): View {
  return new TextView(src, opts)
}

export const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/** Monospaced, whitespace-preserving text. Does not wrap — keep lines short. */
export function Code(src: string | (() => string)): View {
  return Text(src, { wrap: false, lineHeight: 1.55 }).font({ size: 12, family: MONO })
}
