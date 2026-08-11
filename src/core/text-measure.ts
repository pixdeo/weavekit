import type { Font } from './types'

/**
 * Text measurement is the #1 performance trap on canvas, so every result is
 * cached by (font, string). Both backends share this so layout is identical.
 */

let c2d: CanvasRenderingContext2D | null = null
const cache = new Map<string, number>()

/**
 * Entries kept before the cache is dropped wholesale.
 *
 * Without a bound this grows forever, and the strings that grow it are the ones
 * a UI produces most: a counter, a clock, a live readout measure a *new* string
 * every frame, so an app that runs all day accumulates an entry per frame and
 * never looks at any of them again. Clearing beats evicting one at a time — the
 * working set is re-measured in a frame, and the limit is far above any real
 * one, so the drop is rare enough not to matter.
 */
const CACHE_LIMIT = 20_000

/** Dev-only probe, so a check can assert the bound actually holds. */
export const textCacheSize = (): number => cache.size

export const fontCss = (f: Font): string => `${f.weight} ${f.size}px ${f.family}`

function ctx2d(): CanvasRenderingContext2D {
  if (!c2d) {
    const c = document.createElement('canvas')
    const got = c.getContext('2d')
    if (!got) throw new Error('2D canvas context unavailable')
    c2d = got
  }
  return c2d
}

/**
 * Letter spacing is applied to the measuring context, not added on afterwards.
 * The browser decides where the extra space goes — whether the last character
 * gets one too depends on the engine — and guessing it is how layout ends up a
 * few pixels off per word. A browser with no `letterSpacing` on its context
 * measures and draws without it: a font slightly tighter than asked for, not a
 * broken one.
 */
export const applySpacing = (c: CanvasRenderingContext2D, font: Font): void => {
  const ctx = c as CanvasRenderingContext2D & { letterSpacing?: string }
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${font.spacing ?? 0}px`
}

export function textWidth(text: string, font: Font): number {
  const key = `${fontCss(font)}/${font.spacing ?? 0} ${text}`
  let w = cache.get(key)
  if (w === undefined) {
    const c = ctx2d()
    c.font = fontCss(font)
    applySpacing(c, font)
    w = c.measureText(text).width
    if (cache.size >= CACHE_LIMIT) cache.clear()
    cache.set(key, w)
  }
  return w
}

/** Greedy word wrapping. Good enough until you need bidi or hyphenation. */
export function wrapText(text: string, font: Font, maxWidth: number): string[] {
  const paragraphs = text.split('\n')
  const out: string[] = []

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      out.push('')
      continue
    }
    let line = words[0]
    for (let i = 1; i < words.length; i++) {
      const candidate = `${line} ${words[i]}`
      if (textWidth(candidate, font) <= maxWidth) line = candidate
      else {
        out.push(line)
        line = words[i]
      }
    }
    out.push(line)
  }

  return out
}
