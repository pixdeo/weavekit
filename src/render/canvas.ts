import type { Backend } from './backend'
import type { DrawOp } from '../core/types'
import { fontCss } from '../core/text-measure'

export function createCanvasBackend(): Backend {
  const canvas = document.createElement('canvas')
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'

  const c = canvas.getContext('2d')
  if (!c) throw new Error('2D canvas context unavailable')

  let width = 0
  let height = 0

  return {
    el: canvas,

    resize(w, h) {
      const dpr = window.devicePixelRatio || 1
      width = w
      height = h
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
    },

    draw(ops: DrawOp[]) {
      c.clearRect(0, 0, width, height)

      for (const op of ops) {
        if (op.clip) {
          if (op.clip.w <= 0 || op.clip.h <= 0) continue
          c.save()
          c.beginPath()
          c.rect(op.clip.x, op.clip.y, op.clip.w, op.clip.h)
          c.clip()
        }

        c.globalAlpha = op.opacity

        if (op.t === 'rect') {
          c.beginPath()
          if (op.radius > 0) c.roundRect(op.rect.x, op.rect.y, op.rect.w, op.rect.h, op.radius)
          else c.rect(op.rect.x, op.rect.y, op.rect.w, op.rect.h)
          if (op.fill) {
            c.fillStyle = op.fill
            c.fill()
          }
          if (op.stroke) {
            c.strokeStyle = op.stroke
            c.lineWidth = op.lineWidth ?? 1
            c.stroke()
          }
        } else if (op.t === 'ellipse') {
          c.beginPath()
          c.ellipse(
            op.rect.x + op.rect.w / 2,
            op.rect.y + op.rect.h / 2,
            op.rect.w / 2,
            op.rect.h / 2,
            0,
            0,
            Math.PI * 2,
          )
          if (op.fill) {
            c.fillStyle = op.fill
            c.fill()
          }
          if (op.stroke) {
            c.strokeStyle = op.stroke
            c.lineWidth = op.lineWidth ?? 1
            c.stroke()
          }
        } else {
          c.font = fontCss(op.font)
          c.fillStyle = op.color
          c.textBaseline = 'alphabetic'
          const step = op.font.size * op.lineHeight
          // Rough centring of the glyph box inside its line box.
          const baseline = op.rect.y + step * 0.5 + op.font.size * 0.36
          for (let i = 0; i < op.lines.length; i++) {
            c.fillText(op.lines[i], op.rect.x, baseline + i * step)
          }
        }

        if (op.clip) c.restore()
      }

      c.globalAlpha = 1
    },

    onPointerDown(cb) {
      canvas.addEventListener('pointerdown', (e) => {
        const r = canvas.getBoundingClientRect()
        cb(e.clientX - r.left, e.clientY - r.top)
      })
    },

    onPointerMove(cb) {
      canvas.addEventListener('pointermove', (e) => {
        const r = canvas.getBoundingClientRect()
        cb(e.clientX - r.left, e.clientY - r.top)
      })
    },

    onWheel(cb) {
      canvas.addEventListener(
        'wheel',
        (e) => {
          const r = canvas.getBoundingClientRect()
          if (cb(e.clientX - r.left, e.clientY - r.top, e.deltaX, e.deltaY)) e.preventDefault()
        },
        { passive: false },
      )
    },

    setCursor(cursor) {
      if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor
    },

    destroy() {
      canvas.remove()
    },
  }
}
