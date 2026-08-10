import { Ctx } from './ctx'
import type { View } from './view'
import type { Drag, DragHandlers, Hit, PointerType, ScrollRegion } from './types'
import { hitTestable, pointerTypeOf } from './types'
import { subscribe } from './signal'
import { advanceAnimations } from './animation'
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
  /** Where the mouse last was. Fingers do not hover, so they never set it. */
  let pointer: { x: number; y: number } | null = null

  interface Gesture {
    hit: Hit
    pointerType: PointerType
    startX: number
    startY: number
    lastX: number
    lastY: number
    /** Recent positions, oldest first, for the release velocity. */
    trail: { t: number; x: number; y: number }[]
  }

  /**
   * The gestures in flight, keyed by pointer id and in the order they started.
   * Every pointer hit-tests, captures and runs its handlers on its own, so two
   * fingers drive two objects — or the same object twice, which is the
   * handler's problem, not this loop's.
   *
   * A gesture holds the `Hit` captured at pointerdown, not a lookup repeated
   * per move: the tree is rebuilt under the pointer while the drag runs, and
   * the whole point of capture is that the handler survives that. Handlers
   * should therefore read `tx`/`ty` against state they closed over at
   * `onStart`, not against this frame's layout.
   */
  const gestures = new Map<number, Gesture>()

  const cache = new ComponentCache()

  const frame = (now = 0): void => {
    queued = false
    if (!alive) return

    // Before anything is built: the tree about to be measured has to see the
    // values as of this timestamp, not the previous frame's.
    const animating = advanceAnimations(now)

    const w = host.clientWidth
    const h = host.clientHeight
    cache.beginFrame()

    const ctx = new Ctx(cache)
    const root = build()

    root.measure({ w, h }, ctx)
    root.place({ x: 0, y: 0, w, h }, ctx)
    ctx.endPass()

    cache.sweep()

    hits = ctx.hits
    scrolls = ctx.scrolls
    backend.resize(w, h)
    backend.draw(ctx.ops)
    // The layout may have moved under a stationary pointer.
    refreshCursor()

    // An animation that ticked without changing its value writes nothing, so
    // it notifies nobody and would strand itself one frame short. The driver's
    // own answer is what keeps the loop alive.
    if (animating) invalidate()
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

  /**
   * How far back release velocity looks, in milliseconds. Long enough that a
   * single jittery sample cannot dominate, short enough that a pointer held
   * still before release measures as stopped — which is the case that matters,
   * because a fling from a standstill is the one thing users never forgive.
   */
  const VELOCITY_WINDOW = 100

  const record = (g: Gesture, t: number, x: number, y: number): void => {
    g.trail.push({ t, x, y })
    // Keep the last sample outside the window is *not* what we want: dropping
    // it is what makes a pause read as a stop.
    let stale = 0
    while (stale < g.trail.length - 1 && g.trail[stale].t < t - VELOCITY_WINDOW) stale++
    if (stale > 0) g.trail.splice(0, stale)
  }

  const sample = (g: Gesture, x: number, y: number): Drag => {
    const first = g.trail[0]
    const last = g.trail[g.trail.length - 1]
    // Zero when the window holds one sample, or several from the same instant.
    const span = (last.t - first.t) / 1000
    return {
      x,
      y,
      dx: x - g.lastX,
      dy: y - g.lastY,
      tx: x - g.startX,
      ty: y - g.startY,
      startX: g.startX,
      startY: g.startY,
      vx: span > 0 ? (last.x - first.x) / span : 0,
      vy: span > 0 ? (last.y - first.y) / span : 0,
      pointerType: g.pointerType,
    }
  }

  const accepts = (drag: DragHandlers, type: PointerType): boolean =>
    drag.pointerTypes == null || drag.pointerTypes.includes(type)

  /**
   * However many pointers are down, there is one cursor, so it cannot simply
   * follow "the gesture". Touch and pen gestures leave it alone: nothing is
   * drawn under a finger, and the mouse may be hovering something else
   * entirely. Among mouse gestures the first to start keeps it until it ends,
   * so a stray second pointer cannot yank the feedback out of a live drag.
   */
  const cursorOwner = (): Gesture | null => {
    for (const g of gestures.values()) if (g.pointerType === 'mouse') return g
    return null
  }

  const refreshCursor = (): void => {
    const owner = cursorOwner()
    if (owner) backend.setCursor(owner.hit.cursor ?? 'default')
    else if (pointer) updateCursor(pointer.x, pointer.y)
  }

  backend.onPointerDown((x, y, id, rawType, t = 0) => {
    const type = pointerTypeOf(rawType)
    if (type === 'mouse') pointer = { x, y }

    // A tap and a drag are independent: a view can carry both, and a view that
    // only taps is unaffected by a drag starting somewhere beneath it. A hit
    // this pointer's type is not allowed to drive is skipped rather than
    // consumed, so the scan continues into whatever sits below it.
    const draggable = gestures.has(id)
      ? null
      : hitTest(x, y, (h) => h.drag != null && accepts(h.drag, type))
    if (draggable) {
      const g: Gesture = {
        hit: draggable,
        pointerType: type,
        startX: x,
        startY: y,
        lastX: x,
        lastY: y,
        trail: [{ t, x, y }],
      }
      gestures.set(id, g)
      backend.capturePointer(id)
      draggable.drag?.onStart?.(sample(g, x, y))
    }
    hitTest(x, y, (h) => h.handler != null)?.handler?.()
  })

  function updateCursor(x: number, y: number): void {
    const hit = hitTest(x, y, (h) => h.cursor != null)
    backend.setCursor(hit?.cursor ?? 'default')
  }

  backend.onPointerMove((x, y, id, rawType, t = 0) => {
    if (pointerTypeOf(rawType) === 'mouse') pointer = { x, y }

    const g = gestures.get(id)
    if (g) {
      record(g, t, x, y)
      const drag = sample(g, x, y)
      g.lastX = x
      g.lastY = y
      g.hit.drag?.onMove?.(drag)
    }

    refreshCursor()
  })

  backend.onPointerUp((x, y, id, rawType, t = 0) => {
    if (pointerTypeOf(rawType) === 'mouse') pointer = { x, y }

    const g = gestures.get(id)
    if (!g) return
    record(g, t, x, y)
    const drag = sample(g, x, y)
    // Dropped before the handler runs: `onEnd` may mount, unmount or otherwise
    // reason about what is still in flight, and this pointer no longer is.
    gestures.delete(id)
    backend.releasePointer(id)
    g.hit.drag?.onEnd?.(drag)
    refreshCursor()
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
      // A capture outlives the element it was taken on, so anything still held
      // has to go back before the backend does.
      for (const id of gestures.keys()) backend.releasePointer(id)
      gestures.clear()
      backend.destroy()
    },
  }
}
