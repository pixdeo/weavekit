import { Ctx } from '../core/ctx'
import { DslSyntaxError, dslToJs } from '../core/dsl'
import { View } from '../core/view'
import { SANDBOX_NAMES, SANDBOX_VALUES } from './sandbox'

export type Compiled = { ok: true; view: View } | { ok: false; error: string }

const describe = (e: unknown): string =>
  e instanceof Error ? `${e.name}: ${e.message}` : String(e)

/**
 * Turns example source into a view.
 *
 * Two accepted shapes, tried in order:
 *   1. a single expression — `VStack(...)`
 *   2. a function body that returns one — `const n = signal(0)` then `return ...`
 *
 * The result is laid out once in a throwaway context before being handed back,
 * so a snippet that throws during measure or place cannot take down the frame
 * that renders it. Every failure comes back as a message, never an exception.
 */
export function compileView(source: string): Compiled {
  let factory: (...args: unknown[]) => unknown

  try {
    factory = new Function(...SANDBOX_NAMES, `return (\n${source}\n)`) as typeof factory
  } catch {
    try {
      factory = new Function(...SANDBOX_NAMES, source) as typeof factory
    } catch (e) {
      return { ok: false, error: describe(e) }
    }
  }

  let value: unknown
  try {
    value = factory(...SANDBOX_VALUES)
  } catch (e) {
    return { ok: false, error: describe(e) }
  }

  if (!(value instanceof View)) {
    return {
      ok: false,
      error: 'The code must evaluate to a view. End it with an expression, or `return` one.',
    }
  }

  try {
    const ctx = new Ctx()
    value.measure({ w: 480, h: 320 }, ctx)
    value.place({ x: 0, y: 0, w: 480, h: 320 }, ctx)
  } catch (e) {
    return { ok: false, error: describe(e) }
  }

  return { ok: true, view: value }
}

/**
 * `compileView`, but the source may also be written in block syntax (see
 * `dslToJs`). Plain JavaScript is tried first and its errors are kept unless
 * the source actually contains blocks, so existing snippets behave exactly as
 * before.
 */
export function compileSource(source: string): Compiled {
  const direct = compileView(source)
  if (direct.ok) return direct

  let rewritten: ReturnType<typeof dslToJs>
  try {
    rewritten = dslToJs(source)
  } catch (e) {
    if (e instanceof DslSyntaxError) return { ok: false, error: e.message }
    throw e
  }
  if (rewritten.blocksFound === 0) return direct
  return compileView(rewritten.code)
}
