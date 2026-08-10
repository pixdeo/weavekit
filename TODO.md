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

- **Only `.offset()` and `.opacity()` read lazily.** Layout-affecting
  modifiers — `frame`, `padding`, stack spacing — still take plain numbers, so
  animating a size means wrapping it in a `component()`. Widening them wants
  one consistent decision across all of them.
- **Numbers only.** `mixColor()` covers colours by composition; there is no
  interpolation of rects, insets or anything else, and adding it should stay
  composition rather than a generic value type.

**2. Camera.** Pan and zoom as a transform applied to the root rect, with zoom
anchored at the cursor. Draw ops and hit rects both need the transform, which
is the same shape of problem clipping already solved — see `Ctx.emit`. Pinch
belongs here too: `mount` tracks pointers concurrently, but a two-finger scale
has nothing to apply itself to until the transform exists.

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

- **No multi-pointer gestures.** Pointers are tracked concurrently, but each
  one is a gesture on its own: nothing combines two of them. Pinch, rotate and
  two-finger pan all need a recogniser above `mount` that owns a *set* of
  pointers over one view and reports scale and rotation rather than a
  displacement. Pinch-to-zoom in particular belongs with Camera (item 2) —
  without a transform on the root there is nothing for it to drive.
- **Neither a pan nor a wheel chains mid-gesture.** A `ScrollView` with
  nothing to scroll still hands the input outwards, but one that *runs out*
  part-way through keeps it and bands. For a pan that is forced — it owns the
  pointer and a capture cannot be transferred — and for the wheel it is a
  choice, matching native scroll latching. Worth revisiting together if either
  ever needs to hand over. `views/scroll.ts`.
- **No drag threshold, and no way to cancel.** A press starts the gesture
  immediately, so a view cannot both tap and drag on the same press; there is
  also no Escape-to-revert. Both belong in `mount`, not in each handler.
- **Only `ScrollView` flings.** `Drag` carries a release velocity and
  `project()` turns it into a landing point, but nothing else uses either. A
  draggable object thrown across a canvas still stops dead.
- **A fling stops at the end rather than bouncing off it.** Dragging past an
  end bands and springs back, but a *thrown* offset clamps its target, so the
  content never overshoots on its own. A spring with damping below 1 already
  overshoots and the viewport already renders out-of-range offsets, so this is
  a matter of choosing the target, not new machinery. `views/scroll.ts`.
- **The end of a wheel gesture is inferred, not observed.** There is no event
  for a trackpad being released, so momentum is told from a hand by the fact
  that it decays. It is the one heuristic in the scrolling path, and it would
  become unnecessary if the platform ever exposed a phase on `WheelEvent`.
  `views/scroll.ts`.
- **The bounce shares the axis's spring with the fling.** One spec covers
  both, so a deliberately lazy fling drags the bounce out with it. Apple keeps
  them separate. Would want a second spec on `ScrollView` rather than on the
  axis, since it is the viewport's behaviour and not the value's.
- **No smoothing for a discrete mouse wheel.** Every input lands 1:1, which is
  right for a trackpad and leaves a notched wheel a little steppy. Smoothing
  only that needs the two devices told apart — `deltaMode` and delta size are
  the usual hints, and neither is reliable. `views/scroll.ts`.
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

- **No CI badge, and no remote.** `.github/workflows/ci.yml` runs on push and
  pull request, but the project has never been pushed anywhere, so nothing has
  ever run it on a server.
- **A real test runner.** `src/dev/layout-check.ts` is a bespoke script with a
  hand-rolled `check()`. It works and it is fast, but it has no filtering, no
  watch mode and no per-file isolation.
- **CONTRIBUTING.md.** The README covers the rules in three bullets; split them
  out if the project takes contributions.
