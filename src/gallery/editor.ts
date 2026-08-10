import type { Rect } from '../core/types'
import { MONO } from '../views/text'

export interface Editor {
  /** Line the textarea up with a canvas-laid-out rect. */
  setRect(rect: Rect): void
  setSource(source: string): void
  value(): string
  focus(): void
  /**
   * When a canvas overlay (the menu scrim) covers the editor, it must not
   * grab the pointer or the caret: `readOnly` stops keystrokes, `blur`
   * closes the on-screen keyboard, and hiding it keeps it from ghosting
   * over the scrim. Idempotent.
   */
  setEnabled(enabled: boolean): void
  destroy(): void
}

const RECT_EPSILON = 0.5

/**
 * The editor is a plain textarea overlaid on the canvas, not a canvas-drawn
 * one: text editing needs a caret, selection, IME and native scrolling, none
 * of which the toolkit has yet. The preview stays on canvas.
 */
export function createEditor(
  container: HTMLElement,
  onInput: (source: string) => void,
  debounceMs = 180,
): Editor {
  const area = document.createElement('textarea')
  area.spellcheck = false
  area.autocapitalize = 'off'
  area.setAttribute('autocomplete', 'off')
  area.setAttribute('aria-label', 'Example source')

  Object.assign(area.style, {
    position: 'absolute',
    display: 'none',
    boxSizing: 'border-box',
    margin: '0',
    padding: '0',
    border: '0',
    outline: 'none',
    resize: 'none',
    background: 'transparent',
    color: '#d4d4d8',
    caretColor: '#22c55e',
    font: `12px/1.55 ${MONO}`,
    whiteSpace: 'pre',
    overflow: 'auto',
    pointerEvents: 'auto',
    tabSize: '2',
  } satisfies Partial<CSSStyleDeclaration>)

  container.appendChild(area)

  let timer: number | undefined
  area.addEventListener('input', () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => onInput(area.value), debounceMs)
  })

  // Tab indents instead of leaving the editor.
  area.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const { selectionStart: start, selectionEnd: end, value } = area
    area.value = `${value.slice(0, start)}  ${value.slice(end)}`
    area.selectionStart = area.selectionEnd = start + 2
    area.dispatchEvent(new Event('input'))
  })

  let placed: Rect | null = null
  let enabled = true

  return {
    setRect(rect) {
      const same =
        placed !== null &&
        Math.abs(placed.x - rect.x) < RECT_EPSILON &&
        Math.abs(placed.y - rect.y) < RECT_EPSILON &&
        Math.abs(placed.w - rect.w) < RECT_EPSILON &&
        Math.abs(placed.h - rect.h) < RECT_EPSILON
      if (same) return

      placed = rect
      area.style.display = 'block'
      area.style.left = `${rect.x}px`
      area.style.top = `${rect.y}px`
      area.style.width = `${rect.w}px`
      area.style.height = `${rect.h}px`
    },

    setSource(source) {
      if (area.value === source) return
      area.value = source
    },

    value: () => area.value,
    focus: () => area.focus(),

    setEnabled(next) {
      if (enabled === next) return
      enabled = next
      area.readOnly = !next
      area.style.pointerEvents = next ? 'auto' : 'none'
      area.style.visibility = next ? 'visible' : 'hidden'
      if (!next) area.blur()
    },

    destroy() {
      window.clearTimeout(timer)
      area.remove()
    },
  }
}
