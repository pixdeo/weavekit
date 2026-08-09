import type { Backend } from './backend'
import type { DrawOp } from '../core/types'

/**
 * Debug backend. Same DrawOps, rendered as absolutely positioned elements so
 * you can inspect every layout rect in DevTools. Set `outline` to see boxes.
 */
export function createDomBackend(outline = false): Backend {
  const root = document.createElement('div')
  root.style.position = 'relative'
  root.style.overflow = 'hidden'
  root.style.width = '100%'
  root.style.height = '100%'
  root.style.touchAction = 'none'

  const box = (rect: DrawOp['rect']): HTMLDivElement => {
    const d = document.createElement('div')
    d.style.position = 'absolute'
    d.style.left = `${rect.x}px`
    d.style.top = `${rect.y}px`
    d.style.width = `${rect.w}px`
    d.style.height = `${rect.h}px`
    d.style.boxSizing = 'border-box'
    if (outline) d.style.outline = '1px solid rgba(255,80,80,.35)'
    return d
  }

  return {
    el: root,

    resize() {
      // The container is already sized by its parent.
    },

    draw(ops: DrawOp[]) {
      root.replaceChildren()

      for (const op of ops) {
        const d = box(op.rect)
        d.style.opacity = String(op.opacity)

        if (op.clip) {
          // Same rect the canvas backend clips to, expressed relative to this
          // element's own box.
          const top = Math.max(0, op.clip.y - op.rect.y)
          const left = Math.max(0, op.clip.x - op.rect.x)
          const right = Math.max(0, op.rect.x + op.rect.w - (op.clip.x + op.clip.w))
          const bottom = Math.max(0, op.rect.y + op.rect.h - (op.clip.y + op.clip.h))
          d.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px)`
        }

        if (op.t === 'rect') {
          if (op.fill) d.style.background = op.fill
          if (op.stroke) d.style.border = `${op.lineWidth ?? 1}px solid ${op.stroke}`
          if (op.radius) d.style.borderRadius = `${op.radius}px`
        } else if (op.t === 'ellipse') {
          if (op.fill) d.style.background = op.fill
          if (op.stroke) d.style.border = `${op.lineWidth ?? 1}px solid ${op.stroke}`
          d.style.borderRadius = '50%'
        } else {
          d.style.font = `${op.font.weight} ${op.font.size}px/${op.lineHeight} ${op.font.family}`
          d.style.color = op.color
          d.style.whiteSpace = 'pre'
          d.textContent = op.lines.join('\n')
        }

        root.appendChild(d)
      }
    },

    onPointerDown(cb) {
      root.addEventListener('pointerdown', (e) => {
        const r = root.getBoundingClientRect()
        cb(e.clientX - r.left, e.clientY - r.top, e.pointerId)
      })
    },

    onPointerMove(cb) {
      root.addEventListener('pointermove', (e) => {
        const r = root.getBoundingClientRect()
        cb(e.clientX - r.left, e.clientY - r.top, e.pointerId)
      })
    },

    onPointerUp(cb) {
      const fire = (e: PointerEvent): void => {
        const r = root.getBoundingClientRect()
        cb(e.clientX - r.left, e.clientY - r.top, e.pointerId)
      }
      root.addEventListener('pointerup', fire)
      root.addEventListener('pointercancel', fire)
    },

    // Capture goes on the container, not the op elements — `draw` replaces
    // those every frame and would drop the capture with them.
    capturePointer(id) {
      root.setPointerCapture(id)
    },

    releasePointer(id) {
      if (root.hasPointerCapture(id)) root.releasePointerCapture(id)
    },

    onWheel(cb) {
      root.addEventListener(
        'wheel',
        (e) => {
          const r = root.getBoundingClientRect()
          if (cb(e.clientX - r.left, e.clientY - r.top, e.deltaX, e.deltaY)) e.preventDefault()
        },
        { passive: false },
      )
    },

    setCursor(cursor) {
      if (root.style.cursor !== cursor) root.style.cursor = cursor
    },

    destroy() {
      root.remove()
    },
  }
}
