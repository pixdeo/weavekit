/**
 * Minimal reactive value with dependency tracking.
 *
 * Reads that happen inside `track()` are recorded, so a component can learn
 * which signals its subtree actually depends on. Each write bumps that
 * signal's version; a component compares the versions it last saw against the
 * current ones to decide whether its cached work is still valid.
 *
 * Versions rather than a shared dirty set: a dirty set has to be cleared by
 * whoever consumed it, which breaks as soon as two trees are mounted — the
 * first one to render would clear it out from under the second.
 */

export type SignalId = number

export interface Signal<T> {
  (): T
  set(next: T | ((prev: T) => T)): void
}

let nextId: SignalId = 1

/** Active tracking scopes, innermost last. A read registers in all of them. */
const scopes: Set<SignalId>[] = []

const versions = new Map<SignalId, number>()
const subscribers = new Set<() => void>()

export const versionOf = (id: SignalId): number => versions.get(id) ?? 0

export function subscribe(fn: () => void): () => void {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function signal<T>(initial: T): Signal<T> {
  const id = nextId++
  let value = initial

  const read = (() => {
    for (const scope of scopes) scope.add(id)
    return value
  }) as Signal<T>

  read.set = (next) => {
    const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : next
    if (Object.is(resolved, value)) return
    value = resolved
    versions.set(id, versionOf(id) + 1)
    for (const fn of subscribers) fn()
  }

  return read
}

/** Runs `fn`, collecting every signal it reads. */
export function track<T>(fn: () => T): { value: T; deps: Set<SignalId> } {
  const deps = new Set<SignalId>()
  scopes.push(deps)
  try {
    return { value: fn(), deps }
  } finally {
    scopes.pop()
  }
}

/** Runs `fn`, merging every signal it reads into `deps`. */
export function trackInto<T>(deps: Set<SignalId>, fn: () => T): T {
  const { value, deps: found } = track(fn)
  for (const id of found) deps.add(id)
  return value
}
