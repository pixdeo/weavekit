/**
 * Minimal reactive value with dependency tracking.
 *
 * Reads that happen inside `track()` are recorded together with the version
 * each signal had at that moment, so a component can learn which signals its
 * subtree depends on and how up to date those reads were. Each write bumps
 * that signal's version; a component compares the versions its last reads
 * saw against the current ones to decide whether its cached work is still
 * valid.
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

/**
 * Active tracking scopes, innermost last. Each scope maps the signals it read
 * to the version they had at that read — recording the read-time version
 * (rather than stamping it after the run) is what lets a signal written mid
 * run, say from an `onLayout` handler, still invalidate the caller.
 */
const scopes: Map<SignalId, number>[] = []

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
    for (const scope of scopes) scope.set(id, versionOf(id))
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

/**
 * Runs `fn`, collecting every signal it read and the version each one had at
 * that read.
 */
export function track<T>(fn: () => T): { value: T; reads: Map<SignalId, number> } {
  const reads = new Map<SignalId, number>()
  scopes.push(reads)
  try {
    return { value: fn(), reads }
  } finally {
    scopes.pop()
  }
}

/**
 * Runs `fn`, merging the signals it read into `deps` and their read-time
 * versions into `seen`.
 */
export function trackInto<T>(
  deps: Set<SignalId>,
  seen: Map<SignalId, number>,
  fn: () => T,
): T {
  const { value, reads } = track(fn)
  for (const [id, version] of reads) {
    deps.add(id)
    seen.set(id, version)
  }
  return value
}
