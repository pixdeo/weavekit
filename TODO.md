# TODO

What is missing, why it matters, and where to start. The short version lives in
the README [Roadmap](README.md#roadmap); this is the full list.

## Next up

**1. Animation.** Views have no identity across frames, so nothing can be
interpolated. Needs structural identity plus an explicit `.id()`, then a diff
of rects between frames. Momentum scrolling and view transitions both fall out
of it. Touches `core/component.ts` and `core/mount.ts`.

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

- **No pointer capture, so no drag.** The backends report `pointerdown`,
  `pointermove` and `wheel`; there is no down/move/up gesture with capture.
  This blocks scrollbar dragging, sliders, and moving anything on a canvas.
  Probably the single biggest hole for a canvas toolkit.
- **The gallery's column divider is cosmetic.** It shows a `col-resize` cursor
  and resizes nothing. Blocked on pointer capture above. `src/main.ts`.
- **No touch.** Wheel scrolling works; touch dragging and pinch do not.
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

- **Decide the copyright holder.** `LICENSE` says "The canvasUI Authors" as a
  placeholder. Swap in a name if you want one.
- **CI.** `npm run check && npm run check:layout` runs in seconds and nothing
  runs it automatically. A GitHub Actions workflow on push and pull request.
- **A real test runner.** `src/dev/layout-check.ts` is a bespoke script with a
  hand-rolled `check()`. It works and it is fast, but it has no filtering, no
  watch mode and no per-file isolation.
- **CONTRIBUTING.md.** The README covers the rules in three bullets; split them
  out if the project takes contributions.
