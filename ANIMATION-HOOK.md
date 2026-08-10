# The animation hook for `mount`

`src/core/animation.ts` is complete and checked, but nothing drives it yet:
`advanceAnimations(nowMs)` is only ever called by `src/dev/layout-check.ts`,
with fake timestamps. Until this patch lands, an `animated()` value moves only
when something else invalidates the tree, so the animation example renders
correctly and sits still.

The patch is deliberately small and confined to `src/core/mount.ts`, which is
owned by the multi-touch branch — hence a diff rather than an edit.

## The patch

```diff
--- a/src/core/mount.ts
+++ b/src/core/mount.ts
@@
 import { Ctx } from './ctx'
 import type { View } from './view'
 import type { Drag, Hit, ScrollRegion } from './types'
 import { hitTestable } from './types'
 import { subscribe } from './signal'
+import { advanceAnimations } from './animation'
 import { ComponentCache, type CacheStats } from './component'
 import type { Backend } from '../render/backend'
@@
-  const frame = (): void => {
+  const frame = (now = 0): void => {
     queued = false
     if (!alive) return
 
+    // Before anything is built: the tree about to be measured has to see the
+    // values as of this timestamp, not the previous frame's.
+    const animating = advanceAnimations(now)
+
     const w = host.clientWidth
     const h = host.clientHeight
     cache.beginFrame()
@@
     backend.resize(w, h)
     backend.draw(ctx.ops)
     // The layout may have moved under a stationary pointer. A drag in flight
     // owns the cursor, so leave it alone.
     if (pointer && !gesture) updateCursor(pointer.x, pointer.y)
+
+    // An animation that ticked without changing its value writes nothing, so
+    // it notifies nobody and would strand itself one frame short. The driver's
+    // own answer is what keeps the loop alive.
+    if (animating) invalidate()
   }
```

`requestAnimationFrame` already passes the timestamp as the callback's first
argument, so `requestAnimationFrame(frame)` needs no change — `frame` simply
starts receiving it. The one direct call, `frame()` at the end of `mount`, is
what the `now = 0` default is for.

## Where it goes, and why there

**Before `build()`, `measure()` and `place()`.** Advancing writes the animated
signals, which bumps their versions, which is what makes the components that
read them stale. Do it after the build and every frame draws the previous
tick's value: the write would invalidate a tree that has already been placed,
queue another frame, and the display would trail the clock by exactly one
frame forever — visible as sluggishness on short animations and as a
permanently missed final frame on all of them.

**Above `cache.beginFrame()`.** Nothing in the driver touches the cache, so
this is not load-bearing for correctness, but it keeps the frame readable as
*advance the clock, then render the world* and guarantees that no component
can consult `isStale` against a half-advanced clock. If the multi-touch branch
has moved things around, anywhere above `const root = build()` is correct.

**The re-request goes last, after the draw.** It must not be the thing that
decides whether the *current* frame happens, only whether another one follows.

## Why the returned boolean is needed at all

A signal write already notifies `invalidate`, so in the common case the next
frame is requested as a side effect of the value moving. That is not enough:

- `signal.set` suppresses no-op writes with `Object.is`, so a tick that lands
  on the same value schedules nothing and the animation stops one frame short
  of its target.
- A spring at the top of its arc genuinely does not move for a frame.

`advanceAnimations` returning "yes, something is still in flight" is the only
statement that does not depend on a value having changed.

## Interaction with the initial synchronous frame

`mount` calls `frame()` once, synchronously, with no timestamp — so the
driver's clock starts at 0 and the first real rAF timestamp produces a huge
delta. That is already handled: `advanceAnimations` caps a single step at
`MAX_STEP` (64ms), which is the same guard that stops a backgrounded tab from
teleporting everything on its first frame back.

## The checks already expect it

`src/dev/layout-check.ts` was adjusted for this patch, so nothing there needs
touching when it lands. Two things it had to grow:

- Its stubbed `requestAnimationFrame` runs frames synchronously, which this
  patch turns into infinite recursion: the frame asks for the next frame from
  inside itself. A request made *during* a frame is now parked instead of
  nested, and the animation checks run it explicitly.
- Frames are handed a shared fake clock rather than a hard-coded `0`, so the
  driver sees the same timestamp whether the checks step it directly or the
  mount loop does.

Both changes are inert until the patch lands. The patch itself was applied to
a scratch copy of `mount.ts` and all 160 checks pass with and without it.

## Two mounts

The driver is module-level and shares one clock. Two mounts advancing on the
same rAF timestamp is harmless — the second call computes a zero delta, so the
world still moves exactly once per frame, and both mounts render the same
state.
