# TODO

What is missing, why it matters, and where to start. The short version lives in
the README [Roadmap](README.md#roadmap); this is the full list.

## Next up

**1. View transitions.** Animatable state now exists: `core/animation.ts` has
easings, springs, `animated()` and a driver, and an `animated()` value is a
signal whose writes interpolate, so anything that reads one already animates.
What does not exist is interpolating *layout*. A view sliding from where it was
last frame to where it is now needs structural identity plus an explicit
`.id()`, then a diff of rects between frames — and views are deliberately
throwaway descriptions with no identity at all, so that is a real change to
`core/component.ts`, not a modifier.

Left behind by the animation work:

- **`mount` does not drive the driver yet.** `advanceAnimations(nowMs)` is
  called only by the checks. The frame loop has to pass the rAF timestamp and
  keep requesting frames while it answers true; the patch is written out in
  `ANIMATION-HOOK.md` and held back only because `core/mount.ts` was being
  edited on another branch.
- **No momentum or fling.** `animated().set(to, velocity)` accepts a release
  velocity and a spring carries it, so the animation half is done — but
  `onEnd` still reports no velocity, so nothing can hand one over. See *No
  inertia* below; it is now a drag-layer gap, not an animation one.
- **Only `.offset()` and `.opacity()` read lazily.** Layout-affecting
  modifiers — `frame`, `padding`, stack spacing — still take plain numbers, so
  animating a size means wrapping it in a `component()`. Widening them wants
  one consistent decision across all of them.
- **Numbers only.** `mixColor()` covers colours by composition; there is no
  interpolation of rects, insets or anything else, and adding it should stay
  composition rather than a generic value type.

**2. Camera.** Pan and zoom as a transform applied to the root rect, with zoom
anchored at the cursor. Draw ops and hit rects both need the transform, which
is the same shape of problem clipping already solved — see `Ctx.emit`.

**3. Spatial index for hit testing.** `mount` scans the hit list linearly. Fine
below a few hundred nodes, wrong above it. A quadtree rebuilt per frame, or
kept incrementally alongside the component cache.

**4. Virtualised lists.** `ScrollView` measures and places its entire child, so
a 10,000-row list costs 10,000 rows every frame. Skipping what falls outside
the viewport needs a list view that knows its item extents up front.
`views/scroll.ts`.

**5. Packaging.** No library build and no npm package — the only way to consume
the toolkit is to copy `src/`. Needs a `vite build --lib` config, an `exports`
map and a release process.

## Known gaps

### Input

- **One gesture at a time.** `mount` tracks a single active pointer, so a
  second finger is ignored rather than starting its own drag. Multi-touch and
  pinch both need the gesture state keyed by pointer id. `core/mount.ts`.
- **No drag threshold, and no way to cancel.** A press starts the gesture
  immediately, so a view cannot both tap and drag on the same press; there is
  also no Escape-to-revert. Both belong in `mount`, not in each handler.
- **No inertia.** A drag stops dead on release. `onEnd` gets no velocity, so a
  handler cannot fling even though `animated().set(to, velocity)` is waiting
  for one. `mount` would have to keep a short history of samples and fit a
  velocity over the last few, discarding a stale tail so a pause before
  release reads as a stop. `core/mount.ts`.
- **No keyboard, no focus.** No focus ring, no tab order, no arrow-key or
  page-up/down scrolling.
- **No accessibility.** A canvas is opaque to screen readers. The usual answer
  is a parallel DOM tree of ARIA nodes positioned off-screen; `.onLayout()`
  already gives the rects needed to build one.

### Text and drawing

- **Greedy wrapping only.** No hyphenation, no bidi, no shaping. One font per
  `Text`, so no inline bold or links.
- **No truncation.** Nothing offers an ellipsis when text does not fit.
- **The canvas baseline is approximated** as `size * 0.36` rather than read
  from font metrics, so line boxes are slightly off for some faces.
  `render/canvas.ts`.
- **No images or gradients.** `DrawOp` covers rects, ellipses and text.

### Layout and caching

- **Ancestors invalidate with their children.** A parent's cached ops embed its
  children's, so a dirty leaf dirties the chain above it. The saving comes from
  siblings. Fixing it means composing cached op ranges instead of copying them.
- **The measure cache holds 8 proposals per component** and clears wholesale on
  overflow. Fine for the stack probe pattern, arbitrary otherwise.
- **`mount` only watches `window`'s resize event.** A host that resizes on its
  own needs a manual `invalidate()`. A `ResizeObserver` would remove the
  footgun. `core/mount.ts`.

### Gallery

- **No syntax highlighting** in the editor, and no TypeScript checking of
  example code — a snippet is only validated by running it.
- **Preview scroll position is shared** across examples and reset on switch,
  rather than kept per example. `src/main.ts`.
- **The 55-column limit on example code** is enforced by a check but has to be
  respected by hand.

## Project chores

- **CI.** `npm run check && npm run check:layout` runs in seconds and nothing
  runs it automatically. A GitHub Actions workflow on push and pull request.
- **A real test runner.** `src/dev/layout-check.ts` is a bespoke script with a
  hand-rolled `check()`. It works and it is fast, but it has no filtering, no
  watch mode and no per-file isolation.
- **CONTRIBUTING.md.** The README covers the rules in three bullets; split them
  out if the project takes contributions.
