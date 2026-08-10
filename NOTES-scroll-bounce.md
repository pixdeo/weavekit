# The wheel bounce is still not the real thing

Open problem. The rubber band on a trackpad is close but does not feel like
Apple's, and the reason is structural rather than a matter of tuning. Written
down because three rounds of tuning have now improved it without closing the
gap, and the next attempt should start from the cause instead of from the
constants.

Current state: `src/views/scroll.ts`. Checks in `src/dev/layout-check.ts`
section 20. Background in the README under
[Rubber-banding](README.md#rubber-banding).

## The cause

**A `WheelEvent` carries no phase.** Native scrolling on macOS knows four
things that never reach JavaScript:

| What the OS knows | What we get |
| --- | --- |
| the fingers touched down | nothing |
| the fingers are resting, not moving | nothing at all — no events |
| the fingers lifted | nothing |
| this delta is momentum, not a hand | a delta identical in shape to a hand's |

Everything below follows from that one hole. Chrome does have the phase — it
uses it for the page's own overscroll — and simply does not expose it. Safari
exposes nothing either. There is no flag, no `deltaMode` trick and no timing
signature that recovers it; `WheelEvent.wheelDeltaY` and friends are about
units, not phase.

So the end of a wheel gesture is *inferred*, and the whole feel of the bounce
rests on that inference being right.

## What is wrong, in the order it is noticeable

### 1. Fingers resting on the trackpad let go of the band

Overscroll, then hold the fingers still without lifting them. macOS sends no
events at all — resting fingers are not motion — so this is indistinguishable
from having lifted them. The band waits `HAND_HOLD` (180ms) and returns while
the fingers are still down.

Native does not do this: the stretch stays until the fingers actually leave.
This is the single most obvious remaining difference, and it is exactly the
thing no heuristic can fix, because the input is *silence*.

180ms is a compromise, and it is a bad one at both ends: long enough that a
release feels slightly late, short enough that a pause mid-gesture still
snatches the stretch away.

### 2. The countdown is a deadline, and native has no deadline

Native return begins at the instant the fingers lift — one event, no timer.
Ours begins some milliseconds after the last delta we believed. Every value of
that gap is wrong for some gesture, which is why tuning it goes in circles.

### 3. Momentum is discriminated statistically, so it is discriminated late

The current rule is three consecutive deltas each ≥3% down on the one before
(`DECAY`, `DECAYS`), reversed by anything ≥15% up (`RISE`). Momentum only ever
decays; a hand does not. That is sound but it costs three frames (~50ms) to
decide, on top of the countdown, and the first few frames of a tail still
stretch the band a little further than the fingers ever asked for. Measured
peak overshoot from a hard flick: ~45px against a ~30px cap.

### 4. Deltas are pre-accelerated and we cannot undo it

macOS applies its own acceleration curve to trackpad deltas before they arrive.
Two fingers moving at the same speed produce different deltas depending on
history, so "how far did the fingers actually travel" is not recoverable — and
that distance is what the band is supposed to resist. We resist the accelerated
number instead, which is why the stretch grows faster than a finger's would on
a real touchscreen and why `BAND_LIMIT` had to be pulled in to 0.3 of the
viewport when Apple's own curve runs to a full one.

### 5. One spring does the fling and the bounce

Already in [TODO](TODO.md) but it belongs here too: the axis's spec covers
both, so a deliberately lazy fling drags the bounce out with it. Apple keeps
them separate.

## What would actually close it

In rough order of how much it would buy:

1. **A phase, if the platform ever gives us one.** Everything in this file
   except #4 and #5 disappears the day `WheelEvent` carries a phase. Worth
   watching the spec; worth using immediately behind a feature test if it lands
   in one engine.
2. **Native scroll as the input.** Put a real scrolling element behind the
   canvas, let the browser do the overscroll, and read its offset. The browser
   has the phase and the acceleration curve, and it is the only way to get
   either. Cost: the offset stops being ours, which fights the design — scroll
   position is supposed to be ordinary state a caller owns — and nested
   viewports get complicated. Probably still the right answer, and worth
   prototyping before more tuning. **Prototyped:** `src/views/native-scroll.ts`
   (example `native-scroll` shows the three flavours side by side). The offset
   stays a caller-owned signal — the hidden scroller only reports into it — so
   the design cost is lower than feared. The real gaps: the overlay swallows
   presses meant for the content, a viewport whose content fits keeps the
   wheel instead of chaining out, and the band's visibility depends on the
   engine reporting out-of-range offsets mid-bounce.
3. **Predicting the tail rather than detecting it.** Momentum's decay rate is
   near-constant per platform. Fitting the curve after two or three deltas
   gives both an immediate classification *and* a prediction of the remaining
   tail, so the return could start at the fitted lift-off instant rather than a
   fixed gap after it. Fixes #2 and #3, not #1.
4. **Separate bounce spec on `ScrollView`.** Small, independent of the rest,
   and the only item here that is a straightforward piece of work.

Nothing on this list is worth doing by adjusting `HAND_HOLD`, `DECAY`, `DECAYS`
or `RISE` again. Those are at reasonable values; the residual is the missing
phase, not the numbers.

## Not the problem

Ruled out by measurement, so that no one spends the afternoon again:

- **The spring.** It is critically damped and monotone: from a stretch of 29px
  it comes home in 327ms without crossing zero. It was not the spring in any of
  the three rounds it was blamed for.
- **The resistance curve.** `resist(x) = c·x / (x·c/L + 1)`, Apple's, with the
  right slope at zero and a finite cap.
- **The release velocity on a finger drag.** It goes through the band's slope
  now and overshoots the release point by 0%.
- **The tail restarting the episode.** Fixed — the episode ends when the wheel
  goes quiet, not when the content lands.
