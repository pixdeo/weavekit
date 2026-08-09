import { Ctx } from './ctx'
import type { View } from './view'
import type { Hit, ScrollRegion } from './types'
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
    // The layout may have moved under a stationary pointer.
    if (pointer) updateCursor(pointer.x, pointer.y)
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

  backend.onPointerDown((x, y) => {
    hitTest(x, y, (h) => h.handler != null)?.handler?.()
  })

  function updateCursor(x: number, y: number): void {
    const hit = hitTest(x, y, (h) => h.cursor != null)
    backend.setCursor(hit?.cursor ?? 'default')
  }

  backend.onPointerMove((x, y) => {
    pointer = { x, y }
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
