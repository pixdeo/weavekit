import { Ctx } from './ctx'
import type { View } from './view'
import type { Drag, Hit, ScrollRegion } from './types'
import { hitTestable } from './types'
import { subscribe } from './signal'
import { ComponentCache, type CacheStats } from './component'
import type { Backend } from '../render/backend'

export interface Mounted {
  invalidate(): void
  unmount(): void
  /** Cache activity for the frame just rendered. */
  stats(): CacheStats
  /** Cache activity for recent frames, most recent first. */
  history(): CacheStats[]
}

/**
 * One frame = rebuild the view tree, measure it, place it, draw the ops.
 * Rebuilding is cheap because views are throwaway descriptions, not widgets.
 */
export function mount(host: HTMLElement, backend: Backend, build: () => View): Mounted {
  host.replaceChildren(backend.el)

  let hits: Hit[] = []
  let scrolls: ScrollRegion[] = []
  let queued = false
  let alive = true
  let pointer: { x: number; y: number } | null = null

  /**
   * The gesture in flight. It holds the `Hit` captured at pointerdown, not a
   * lookup repeated per move: the tree is rebuilt under the pointer while the
   * drag runs, and the whole point of capture is that the handler survives
   * that. Handlers should therefore read `tx`/`ty` against state they closed
   * over at `onStart`, not against this frame's layout.
   */
  let gesture: {
    id: number
    hit: Hit
    startX: number
    startY: number
    lastX: number
    lastY: number
  } | null = null

  const cache = new ComponentCache()

  const frame = (): void => {
    queued = false
    if (!alive) return

    const w = host.clientWidth
    const h = host.clientHeight
    cache.beginFrame()

    const ctx = new Ctx(cache)
    const root = build()

    root.measure({ w, h }, ctx)
    root.place({ x: 0, y: 0, w, h }, ctx)

    cache.sweep()

    hits = ctx.hits
    scrolls = ctx.scrolls
    backend.resize(w, h)
    backend.draw(ctx.ops)
    // The layout may have moved under a stationary pointer. A drag in flight
    // owns the cursor, so leave it alone.
    if (pointer && !gesture) updateCursor(pointer.x, pointer.y)
  }

  const invalidate = (): void => {
    if (queued || !alive) return
    queued = true
    requestAnimationFrame(frame)
  }

  const unsubscribe = subscribe(invalidate)

  /** Scans back-to-front so the innermost region wins. */
  const hitTest = (x: number, y: number, want: (h: Hit) => boolean): Hit | null => {
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i]
      if (hitTestable(h.rect, h.clip, x, y) && want(h)) return h
    }
    return null
  }

  const sample = (x: number, y: number): Drag => ({
    x,
    y,
    dx: x - gesture!.lastX,
    dy: y - gesture!.lastY,
    tx: x - gesture!.startX,
    ty: y - gesture!.startY,
    startX: gesture!.startX,
    startY: gesture!.startY,
  })

  backend.onPointerDown((x, y, id) => {
    // A tap and a drag are independent: a view can carry both, and a view that
    // only taps is unaffected by a drag starting somewhere beneath it.
    const draggable = gesture ? null : hitTest(x, y, (h) => h.drag != null)
    if (draggable) {
      gesture = { id, hit: draggable, startX: x, startY: y, lastX: x, lastY: y }
      backend.capturePointer(id)
      draggable.drag?.onStart?.(sample(x, y))
    }
    hitTest(x, y, (h) => h.handler != null)?.handler?.()
  })

  function updateCursor(x: number, y: number): void {
    const hit = hitTest(x, y, (h) => h.cursor != null)
    backend.setCursor(hit?.cursor ?? 'default')
  }

  backend.onPointerMove((x, y, id) => {
    pointer = { x, y }

    if (gesture && gesture.id === id) {
      const drag = sample(x, y)
      gesture.lastX = x
      gesture.lastY = y
      // The gesture keeps its own cursor wherever the pointer wanders.
      backend.setCursor(gesture.hit.cursor ?? 'default')
      gesture.hit.drag?.onMove?.(drag)
      return
    }

    updateCursor(x, y)
  })

  backend.onPointerUp((x, y, id) => {
    if (!gesture || gesture.id !== id) return
    const { hit } = gesture
    const drag = sample(x, y)
    gesture = null
    backend.releasePointer(id)
    hit.drag?.onEnd?.(drag)
    updateCursor(x, y)
  })

  backend.onWheel((x, y, dx, dy) => {
    // Innermost first; a region that cannot move passes the wheel outwards.
    for (let i = scrolls.length - 1; i >= 0; i--) {
      const region = scrolls[i]
      if (!hitTestable(region.rect, region.clip, x, y)) continue
      if (region.scroll(dx, dy)) return true
    }
    return false
  })

  const onResize = (): void => invalidate()
  window.addEventListener('resize', onResize)

  frame()

  return {
    invalidate,
    stats: () => cache.stats,
    history: () => cache.history,
    unmount() {
      alive = false
      unsubscribe()
      window.removeEventListener('resize', onResize)
      backend.destroy()
    },
  }
}
