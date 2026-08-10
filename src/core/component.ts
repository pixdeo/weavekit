import type { Ctx } from './ctx'
import { View } from './view'
import type { DrawOp, Env, Hit, Proposal, Rect, ScrollRegion, Size } from './types'
import { trackInto, versionOf, type SignalId } from './signal'

/**
 * A cached subtree.
 *
 * Without this, every signal write rebuilds, re-measures and re-draws the whole
 * view tree. A component remembers which signals its subtree read and, while
 * none of them are dirty, replays its cached size and draw ops instead of
 * running any of that work again.
 *
 * Reads register in every enclosing scope, so a dirty signal invalidates the
 * component that read it *and* its ancestors — the ancestors' cached ops embed
 * the child's. Siblings stay cached, which is where the saving comes from.
 */

/**
 * Stacks probe each child several times per pass (ideal size, then the full
 * room, then the final share), so one measure slot would thrash. A handful is
 * enough to cover a pass; overflow just resets the map.
 */
const MEASURE_SLOTS = 8

interface Entry {
  frame: number
  deps: Set<SignalId>
  /** Version of each dep as of the last time this entry did real work. */
  seen: Map<SignalId, number>
  view: View | null
  sizes: Map<string, Size>
  placeKey: string | null
  ops: DrawOp[] | null
  hits: Hit[] | null
  scrolls: ScrollRegion[] | null
  claims: unknown[] | null
}

const isStale = (entry: Entry): boolean => {
  for (const [id, version] of entry.seen) if (versionOf(id) !== version) return true
  return false
}

/**
 * Records the current version of every dep. Called after each tracked run, so
 * a component that has just rebuilt is immediately considered fresh — that is
 * what stops a stack's repeated measure probes from rebuilding it each time.
 */
const restamp = (entry: Entry): void => {
  for (const id of entry.deps) entry.seen.set(id, versionOf(id))
}

export interface CacheStats {
  built: number
  measured: number
  placed: number
  reusedMeasure: number
  reusedPlace: number
}

const envKey = (e: Env): string =>
  `${e.font.size}/${e.font.weight}/${e.font.family}/${e.foreground}/${e.opacity}`

const propKey = (p: Proposal, e: Env): string => `${p.w}:${p.h}:${envKey(e)}`

const rectKey = (r: Rect, e: Env): string => `${r.x}:${r.y}:${r.w}:${r.h}:${envKey(e)}`

const emptyStats = (): CacheStats => ({
  built: 0,
  measured: 0,
  placed: 0,
  reusedMeasure: 0,
  reusedPlace: 0,
})

/** Frames kept in `history`. Enough to look past an idle or resize frame. */
const HISTORY = 8

export class ComponentCache {
  private entries = new Map<string, Entry>()
  frame = 0
  stats: CacheStats = emptyStats()
  /** Most recent frames first. The current frame is `stats`. */
  history: CacheStats[] = []

  entry(key: string): Entry {
    let e = this.entries.get(key)
    if (!e) {
      e = {
        frame: this.frame,
        deps: new Set(),
        seen: new Map(),
        view: null,
        sizes: new Map(),
        placeKey: null,
        ops: null,
        hits: null,
        scrolls: null,
        claims: null,
      }
      this.entries.set(key, e)
    }
    e.frame = this.frame
    return e
  }

  beginFrame(): void {
    this.frame++
    this.history.unshift(this.stats)
    if (this.history.length > HISTORY) this.history.pop()
    this.stats = emptyStats()
  }

  /** Drops entries whose component did not appear in the last frame. */
  sweep(): void {
    for (const [key, e] of this.entries) {
      if (e.frame !== this.frame) this.entries.delete(key)
    }
  }

  get size(): number {
    return this.entries.size
  }
}

class ComponentView extends View {
  constructor(
    private key: string,
    private builder: () => View,
  ) {
    super()
  }

  private resolve(ctx: Ctx): { entry: Entry | null; view: View } {
    const cache = ctx.cache
    if (!cache) return { entry: null, view: this.builder() }

    const entry = cache.entry(this.key)
    if (entry.view && !isStale(entry)) return { entry, view: entry.view }

    // Stale: rebuild and start a fresh dependency set, so deps that no longer
    // apply stop invalidating this component.
    entry.deps = new Set()
    entry.seen = new Map()
    entry.view = trackInto(entry.deps, this.builder)
    restamp(entry)
    entry.sizes.clear()
    entry.placeKey = null
    entry.ops = null
    entry.hits = null
    entry.scrolls = null
    entry.claims = null
    cache.stats.built++
    return { entry, view: entry.view }
  }

  measure(p: Proposal, ctx: Ctx): Size {
    const { entry, view } = this.resolve(ctx)
    if (!entry) return view.measure(p, ctx)

    const key = propKey(p, ctx.env)
    const cached = entry.sizes.get(key)
    if (cached) {
      ctx.cache!.stats.reusedMeasure++
      return cached
    }

    const size = trackInto(entry.deps, () => view.measure(p, ctx))
    restamp(entry)
    if (entry.sizes.size >= MEASURE_SLOTS) entry.sizes.clear()
    entry.sizes.set(key, size)
    ctx.cache!.stats.measured++
    return size
  }

  place(rect: Rect, ctx: Ctx): void {
    const { entry, view } = this.resolve(ctx)
    if (!entry) {
      view.place(rect, ctx)
      return
    }

    const key = rectKey(rect, ctx.env)
    if (entry.ops && entry.hits && entry.scrolls && entry.claims && entry.placeKey === key) {
      for (const op of entry.ops) ctx.ops.push(op)
      for (const hit of entry.hits) ctx.hits.push(hit)
      // Scroll regions have to be replayed too, or a cached subtree would stop
      // responding to the wheel. Claims likewise: a DOM-backed view would look
      // gone on the very frame after it placed.
      for (const region of entry.scrolls) ctx.scrolls.push(region)
      for (const claim of entry.claims) ctx.claims.push(claim)
      ctx.cache!.stats.reusedPlace++
      return
    }

    const opStart = ctx.ops.length
    const hitStart = ctx.hits.length
    const scrollStart = ctx.scrolls.length
    const claimStart = ctx.claims.length
    trackInto(entry.deps, () => view.place(rect, ctx))
    restamp(entry)
    entry.ops = ctx.ops.slice(opStart)
    entry.hits = ctx.hits.slice(hitStart)
    entry.scrolls = ctx.scrolls.slice(scrollStart)
    entry.claims = ctx.claims.slice(claimStart)
    entry.placeKey = key
    ctx.cache!.stats.placed++
  }
}

/**
 * Wraps a subtree in a cache keyed by `key`. Keys must be unique and stable
 * across frames — node ids, route names, list item ids.
 */
export function component(key: string, builder: () => View): View {
  return new ComponentView(key, builder)
}
