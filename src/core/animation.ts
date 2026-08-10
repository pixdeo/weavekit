import { signal } from './signal'
import { clamp } from './types'

/**
 * Animatable state.
 *
 * An `animated()` value reads like a signal, which is the whole design: the
 * view tree needs no support for it. Whatever reads it is already invalidated
 * when it moves, and a cached component that does not read it stays cached.
 *
 * This is deliberately not "animate the layout". Interpolating a rect from
 * where a view was last frame to where it is now needs view identity across
 * frames, and views here are throwaway descriptions with no identity at all.
 * This is the layer underneath that one — and the layer momentum, transitions
 * and easing actually run on.
 *
 * Time arrives from outside. Nothing in here reads a clock, so the headless
 * checks step the driver with fake timestamps and a future recorder can
 * replay a session frame for frame.
 */

/** Maps normalised progress to normalised distance. Only `[0, 1]` is defined. */
export type Easing = (t: number) => number

/**
 * Four curves, cubic. Anything else is a one-liner the caller can pass
 * directly, and the case a named curve usually gets reached for — overshoot —
 * is a spring's job, not an easing's.
 */
export const linear: Easing = (t) => t
export const easeIn: Easing = (t) => t * t * t
export const easeOut: Easing = (t) => 1 - (1 - t) ** 3
export const easeInOut: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2

export interface TweenOpts {
  /** Milliseconds. */
  duration?: number
  easing?: Easing
}

export interface SpringOpts {
  /**
   * Milliseconds. Roughly how long the spring takes to cover the distance —
   * formally the period of the undamped oscillation.
   */
  response?: number
  /** Damping ratio. 1 stops dead on the target, below 1 overshoots. */
  damping?: number
}

export type AnimationSpec =
  | { kind: 'tween'; duration: number; easing: Easing }
  | { kind: 'spring'; response: number; damping: number }

export const tween = (o: TweenOpts = {}): AnimationSpec => ({
  kind: 'tween',
  duration: Math.max(0, o.duration ?? 250),
  easing: o.easing ?? easeInOut,
})

/**
 * Response and damping ratio rather than stiffness/damping/mass.
 *
 * The three physical constants are coupled: raising the mass slows the spring
 * *and* makes it bouncier, so tuning one property always damages another.
 * Response and damping ratio are the same system reparameterised into the two
 * things anyone actually wants to choose — how fast, and how bouncy — and they
 * are orthogonal. Mass disappears because it is redundant with response once
 * the system is written in terms of its natural frequency. It is also what
 * SwiftUI exposes, and this toolkit is SwiftUI-shaped elsewhere.
 *
 * Everything is milliseconds, matching the driver's timestamps. Mixed units
 * are how animation code grows off-by-1000 bugs.
 */
export const spring = (o: SpringOpts = {}): AnimationSpec => ({
  kind: 'spring',
  response: Math.max(1, o.response ?? 300),
  // Floored well below anything usable rather than at zero: a truly undamped
  // spring never comes to rest, and would hold the frame loop open forever.
  damping: Math.max(0.05, o.damping ?? 1),
})

export interface Animated {
  /** The value right now. Reading inside a tracking scope registers it. */
  (): number
  /**
   * Animates toward `to`. A spring keeps the velocity it already had, so a
   * retarget mid-flight bends the path instead of restarting it; a tween has
   * no velocity state and re-runs its curve from the current value.
   *
   * An explicit `velocity` (units per second) is injected into the spring —
   * that is how a fling would hand over its release speed. A tween ignores it.
   */
  set(to: number, velocity?: number): void
  /** Lands on `to` — or on the current target — this instant, at rest. */
  settle(to?: number): void
  /** Where it is heading. Equals the value once at rest. */
  target(): number
  /** Units per second, signed. */
  velocity(): number
  /** True while the driver is still stepping it. */
  animating(): boolean
}

interface Running {
  /** Advances by `dt` seconds. Returns true once it has come to rest. */
  step(dt: number): boolean
}

/**
 * Rest threshold, as a fraction of the distance the current move set out to
 * cover. Unit-free on purpose: a 300px slide and a 0→1 fade then stop looking
 * finished at the same moment, with no per-value epsilon to hand-tune.
 */
const REST = 1e-3

/**
 * Half-width of the band around ζ = 1 treated as critically damped. Both the
 * underdamped and the overdamped closed forms divide by a term that vanishes
 * there, so exactly 1 needs its own branch and nearly-1 needs to use it too.
 */
const CRITICAL_BAND = 1e-3

/**
 * Longest step the driver will take, in milliseconds. A backgrounded tab
 * delivers one frame after an arbitrary gap, and integrating it honestly would
 * teleport everything. Capping it makes the animation lag instead, which is
 * the failure everyone prefers.
 */
const MAX_STEP = 64

const inFlight = new Set<Running>()

/** Timestamp of the last advance, so each animation needs no clock of its own. */
let lastNow: number | null = null

/**
 * Steps every animation to `nowMs` and reports whether any are still moving.
 * Callers pass the frame timestamp; the clock is never read here.
 *
 * Two mounts advancing the same frame is harmless — the second call sees a
 * zero delta, so the world still moves exactly once per frame.
 */
export function advanceAnimations(nowMs: number): boolean {
  const dt = lastNow == null ? 0 : clamp(nowMs - lastNow, 0, MAX_STEP)
  // The clock only ever moves forward. A timestamp from behind it is a zero
  // step *and* is not adopted — `mount` renders its first frame before it has
  // one to pass, and that must not drag the clock back and turn the next real
  // frame into a capped jump.
  if (lastNow == null || nowMs > lastNow) lastNow = nowMs
  // Deleting from a Set while iterating it is safe: the entry is simply not
  // visited again.
  for (const a of inFlight) if (a.step(dt / 1000)) inFlight.delete(a)
  return inFlight.size > 0
}

export function animated(initial: number, spec: AnimationSpec = spring()): Animated {
  // The value is a real signal so that reads track and writes invalidate.
  // `cur` mirrors it because the integrator has to read the value without
  // registering a dependency in whatever scope happens to be open.
  const value = signal(initial)
  /**
   * Bumped when the phase changes — started, retargeted, landed. `target()`
   * and `animating()` depend on this instead of on the value, so a component
   * that only shows where things are heading is not rebuilt every frame.
   */
  const phase = signal(0)

  /** Natural frequency, radians per second. */
  const omega = spec.kind === 'spring' ? (2 * Math.PI * 1000) / spec.response : 0

  let cur = initial
  let to = initial
  let vel = 0
  let from = initial
  /** Milliseconds into the tween. */
  let elapsed = 0
  let scale = 0

  const entry: Running = { step }

  const write = (next: number): void => {
    cur = next
    value.set(next)
  }

  const bump = (): void => phase.set((n) => n + 1)

  /**
   * Arrives exactly on the target, at rest.
   *
   * The registry entry goes first because the writes that follow notify
   * subscribers synchronously — a mount that renders in response must not see
   * `animating()` still claiming the animation is in flight.
   */
  const land = (): void => {
    inFlight.delete(entry)
    vel = 0
    write(to)
    bump()
  }

  function step(dt: number): boolean {
    if (spec.kind === 'tween') {
      elapsed += dt * 1000
      const t = spec.duration === 0 ? 1 : clamp(elapsed / spec.duration, 0, 1)
      const next = from + (to - from) * spec.easing(t)
      // A tween carries no velocity of its own; report the rate it is moving
      // at so callers see something meaningful either way.
      if (dt > 0) vel = (next - cur) / dt
      if (t < 1) {
        write(next)
        return false
      }
      // Snapped rather than trusted: a caller's easing need not end at 1.
      land()
      return true
    }

    // Analytic solution of x'' + 2ζω x' + ω² x = 0 about the target, where x
    // is the displacement. Exact for a step of any size, so a 200ms stall
    // lands in the same state as ten 20ms frames — no sub-stepping, no drift,
    // and the headless checks get to assert real numbers.
    const z = spec.damping
    const x0 = cur - to
    const v0 = vel
    let x: number
    let v: number

    if (z < 1 - CRITICAL_BAND) {
      const wd = omega * Math.sqrt(1 - z * z)
      const decay = Math.exp(-z * omega * dt)
      const a = x0
      const b = (v0 + z * omega * x0) / wd
      const cos = Math.cos(wd * dt)
      const sin = Math.sin(wd * dt)
      x = decay * (a * cos + b * sin)
      v = decay * (-z * omega * (a * cos + b * sin) + wd * (b * cos - a * sin))
    } else if (z > 1 + CRITICAL_BAND) {
      const root = omega * Math.sqrt(z * z - 1)
      const r1 = -z * omega + root
      const r2 = -z * omega - root
      const c2 = (v0 - r1 * x0) / (r2 - r1)
      const c1 = x0 - c2
      const e1 = Math.exp(r1 * dt)
      const e2 = Math.exp(r2 * dt)
      x = c1 * e1 + c2 * e2
      v = c1 * r1 * e1 + c2 * r2 * e2
    } else {
      const decay = Math.exp(-omega * dt)
      const c2 = v0 + omega * x0
      x = (x0 + c2 * dt) * decay
      v = (c2 - omega * (x0 + c2 * dt)) * decay
    }

    if (Math.abs(x) > scale * REST || Math.abs(v) > scale * omega * REST) {
      vel = v
      write(to + x)
      return false
    }
    land()
    return true
  }

  const set = (next: number, velocity?: number): void => {
    // Already heading there, so keep going rather than restart: a restart
    // flat-spots a tween and throws away a spring's velocity.
    if (next === to && velocity === undefined) return
    to = next
    if (velocity !== undefined && spec.kind === 'spring') vel = velocity

    if (cur === to && vel === 0) {
      land()
      return
    }

    if (spec.kind === 'tween') {
      from = cur
      elapsed = 0
    } else {
      // |v|/ω is the distance the current velocity is worth, so a fling into a
      // target it already sits on still has a sensible scale to rest against.
      scale = Math.max(Math.abs(to - cur), Math.abs(vel) / omega)
    }
    inFlight.add(entry)
    bump()
  }

  const settle = (next: number = to): void => {
    if (!inFlight.has(entry) && next === to && next === cur) return
    to = next
    land()
  }

  const read = (() => value()) as Animated
  read.set = set
  read.settle = settle
  read.target = () => {
    phase()
    return to
  }
  read.velocity = () => {
    // Velocity moves in lockstep with the value, so it depends on both: the
    // value for every tick, the phase for an injected or discarded one.
    value()
    phase()
    return vel
  }
  read.animating = () => {
    phase()
    return inFlight.has(entry)
  }
  return read
}

/**
 * Where a flick coasts to a stop, given the speed it was released at.
 *
 * This is the missing half of a fling. A spring animates *to* a target, and a
 * release velocity does not name one — so something has to turn "moving this
 * fast" into "heading there". Exponential deceleration integrates to a finite
 * distance, and that distance is all of it:
 *
 *   ScrollView({ y }, rows)   // y is an animated()
 *   y.set(clamp(project(y(), v), 0, max), v)
 *
 * `velocity` is units per second, matching `Animated.velocity()`. The default
 * rate is UIScrollView's, which is what a flick has felt like on a touchscreen
 * for fifteen years; lower it for a surface that should stop sooner.
 */
export const project = (position: number, velocity: number, decelerationRate = 0.998): number => {
  const rate = clamp(decelerationRate, 0, 0.9999)
  return position + (velocity / 1000) * (rate / (1 - rate))
}

const HEX = /^#(?:([0-9a-f]{3})|([0-9a-f]{6}))$/i

const channels = (c: string): [number, number, number] | null => {
  const m = HEX.exec(c.trim())
  if (!m) return null
  const d = m[1] ? m[1].replace(/./g, (ch) => ch + ch) : m[2]
  return [parseInt(d.slice(0, 2), 16), parseInt(d.slice(2, 4), 16), parseInt(d.slice(4, 6), 16)]
}

/**
 * Blends two hex colours. Kept as a plain function rather than folded into
 * `animated`: animating a colour is animating one number and mapping it, so
 * there is no reason to make the value type generic and every reason not to.
 *
 *   Rectangle().fill(mixColor('#2563eb', '#f43f5e', t()))
 *
 * The mix is in sRGB, like CSS has always done it — not perceptually even, but
 * it is what the numbers in a palette were picked against. Anything that is
 * not `#rgb` or `#rrggbb` snaps at the midpoint instead of throwing.
 */
export function mixColor(from: string, to: string, t: number): string {
  const a = channels(from)
  const b = channels(to)
  if (!a || !b) return t < 0.5 ? from : to
  const k = clamp(t, 0, 1)
  const hex = (i: number): string =>
    Math.round(a[i] + (b[i] - a[i]) * k)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(0)}${hex(1)}${hex(2)}`
}
