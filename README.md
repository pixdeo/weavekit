# canvasUI

A declarative, SwiftUI-shaped UI toolkit that renders to `<canvas>`.

Canvas gives you full control over pixels but takes away everything else:
layout, hit testing, text wrapping, invalidation. canvasUI puts those back,
using the layout model SwiftUI popularised — views describe themselves, parents
propose space, children answer with a size.

```ts
VStack({ spacing: 8, align: 'leading' },
  Text('Node A').font({ size: 24, weight: 700 }),
  HStack({ spacing: 8 },
    Circle().fill('#22c55e').frame(10, 10),
    Text('Online').opacity(0.6),
    Spacer(),
    Button('Edit', () => selected.set(id)),
  ),
)
  .padding(16)
  .background(RoundedRect(12).fill('#18181b'))
```

**Status: early.** The layout engine, the two renderers, scrolling and the
invalidation model work and are covered by checks. There is no npm package yet
and no animation. See [Roadmap](#roadmap).

## Project status and contributing

This is an open source project. Issues and pull requests are welcome.

- Everything — code, comments, docs, commit messages — is written in English.
- Every behavioural change needs a check in `src/dev/layout-check.ts`. The
  checks run headless in a couple of seconds; there is no browser needed.
- `npm run check && npm run check:layout` must pass before a pull request.

[TODO.md](TODO.md) lists what is missing and where to start on each item.

## Getting started

```bash
npm install
npm run dev          # examples gallery at http://localhost:5173
npm run check        # typecheck
npm run check:layout # headless layout and invalidation assertions
```

Visual feedback without leaving the terminal — with `npm run dev` running:

```bash
./scripts/shot.sh canvas out.png 1280 800   # production renderer
./scripts/shot.sh dom    out.png 900 600    # debug renderer, every rect outlined
```

## Use it in your own page

There is no npm package yet — see [Roadmap](#roadmap) item 5. Until there is,
consume it by working inside this repo, or by copying `src/` into your project
and importing from `src/index.ts`.

Three pieces: an element to host the canvas, a backend, and a function that
builds the view tree.

```html
<body>
  <div id="app" style="position: absolute; inset: 0"></div>
  <script type="module" src="/src/app.ts"></script>
</body>
```

```ts
import { mount, createCanvasBackend, VStack, Text, Button, signal } from './index'

const count = signal(0)

const mounted = mount(document.getElementById('app')!, createCanvasBackend(), () =>
  VStack(
    { spacing: 8, align: 'leading' },
    Text(() => `count: ${count()}`),
    Button('+1', () => count.set((n) => n + 1)),
  ).padding(20),
)
```

The build function runs once per frame, so it can read signals directly; a
write schedules the next frame. `mount` returns `{ invalidate, unmount, stats,
history }` — call `unmount()` when the host goes away.

**The host must have a size.** `mount` lays out against `host.clientWidth` and
`host.clientHeight`, so an element with no CSS height renders nothing. It also
re-lays out on `window`'s resize event, and nothing else — if the host resizes
on its own, call `invalidate()`.

Swap `createCanvasBackend()` for `createDomBackend(true)` to inspect every
layout rect in DevTools. Both take over the host element: `mount` replaces its
children with the backend's own.

### DOM on top of the canvas

Anything the toolkit does not draw — text inputs, video, an iframe — goes in a
sibling overlay, positioned from the rect the layout assigns it:

```ts
Rectangle().fill('transparent').expand().onLayout((rect) => input.setRect(rect))
```

`.onLayout()` fires during `place` with the view's final rect. That is how the
gallery's `<textarea>` stays aligned with a canvas-laid-out panel; see
`src/gallery/editor.ts`. Give the overlay `pointer-events: none` so clicks
still reach the canvas, and re-enable it on the elements that need it.

## Examples gallery

`npm run dev` opens a gallery: a sidebar of examples, each showing its source
next to the live result. It starts on a hello-world intro and works up through
stacks, modifier order, flexibility and interaction, and ends on
[embedding the toolkit in a page](#use-it-in-your-own-page).

**The code is editable.** Type in the left panel and the canvas on the right
re-renders as you go, like the Svelte tutorial. Broken code shows the error and
leaves the rest of the page running. `reset` restores the original, and edits
are kept per example while you browse.

The gallery itself is built with canvasUI — the sidebar, the panels and the
preview are all views, so it doubles as the largest example.

Deep-link an example with `?example=<id>`, e.g. `?example=flexibility`.

### How the live editor works

An example is *only* source. The rendered view is produced by compiling that
string, so the code you read and the result you see cannot drift apart, and the
reader can edit either into the other.

- `src/gallery/sandbox.ts` puts the toolkit surface in scope. It is a
  convenience, not a security boundary: `new Function` bodies still reach the
  page's globals. The gallery runs the reader's own code in the reader's own
  browser, the same trade every in-page playground makes.
- `src/gallery/compile.ts` evaluates it with `new Function`, accepting either a
  single expression or statements ending in `return <view>`. The result is laid
  out once in a throwaway context before being adopted, so a snippet that
  throws during measure or place cannot take down the frame rendering it. Every
  failure comes back as a message.
- `src/gallery/editor.ts` is a plain `<textarea>` positioned over the canvas.
  Text editing needs a caret, selection, IME and native scrolling — none of
  which the toolkit has. The preview stays on canvas.

The textarea is lined up using `.onLayout(rect => ...)`, a modifier that
reports a view's final rect during `place`. That is the general way to line a
DOM element up with a canvas-laid-out region.

`new Function` means the gallery needs a CSP that permits it. That applies to
the gallery only — the toolkit itself never evaluates strings.

### Adding an example

Drop a file in `src/examples/` and add it to the array in
`src/examples/index.ts`:

```ts
export const myExample: Example = {
  id: 'my-example',
  title: 'My example',
  blurb: 'One or two sentences on what this shows and why it matters.',
  code: `Text('this string is the example')
  .padding(12)`,
}
```

Keep code lines under 55 columns. That is a readability rule, not a rendering
one — the textarea scrolls horizontally, but a reader should not have to. The
rendered example can be any height; the preview panel is a `ScrollView`.

`npm run check:layout` compiles every example, asserts it draws something, and
enforces the column limit.

## How it works

Three ideas, nothing else.

**1. Every view answers two questions.**

```ts
measure(proposal, ctx) -> Size   // "given this much room, how big do you want to be?"
place(rect, ctx)       -> void   // "here is your final rect; position children, emit draw ops"
```

This is SwiftUI's Layout protocol. `Proposal` uses `null` for "unspecified, pick
your ideal size" and `Infinity` for "as much as you want".

**2. Modifiers are just views that wrap a child.**

`.padding()` returns a `Padding` view holding the original. That is why
`.padding().background()` differs from `.background().padding()` without any
special-casing — the wrapping order *is* the semantics.

**3. Stacks distribute space in order of increasing flexibility.**

Each child is probed to learn its range: its ideal size (unspecified proposal)
and how much it would take if offered the whole row.

- **When everything fits**, each child keeps its ideal size and only the greedy
  ones — `Spacer()`, `.expand()` — share the surplus, least flexible first.
- **When it does not fit**, the room is split evenly among the children not yet
  measured, again least flexible first, so rigid children settle before the
  elastic ones compress.

The first branch is what makes `Text` next to a `Spacer` behave. Splitting the
room evenly in both cases hands the text half a row it did not need and wraps
it for no reason — see the regression check in `src/dev/layout-check.ts`.

## Architecture

```
View tree  ──measure/place──>  DrawOp[] + Hit[] + ScrollRegion[]  ──>  Backend
 (throwaway descriptions)      (flat, backend-agnostic)      canvas 2D | DOM debug
```

The layout engine never touches a canvas or the DOM. It produces a flat list of
draw ops, which any backend consumes:

- `createCanvasBackend()` — Canvas 2D, DPR-aware. Production.
- `createDomBackend(true)` — absolutely positioned elements, one per op, with
  outlines. Use it to inspect every layout rect in DevTools.

Both share one cached text measurer, so layout is identical across backends.
Toggle between them in the demo toolbar, or with `?backend=dom`.

Hit testing falls out of layout: `.onTap()` records its final rect during
`place`, and the mount loop scans the list back-to-front.

Cursor feedback rides the same list. `.onTap()` sets `pointer` by default;
`.cursor('col-resize')` registers a cursor-only region with no handler, which
is what drag handles and resize edges need. The cursor is also re-evaluated
after every rebuild, so it stays correct when the layout moves under a
stationary pointer.

```ts
Button('Save', save)                              // cursor: pointer
Rectangle().frame(7, null).cursor('col-resize')   // cursor only, not clickable
Text('Drag me').onTap(pick, 'grab')               // explicit cursor
```

## Clipping and scrolling

`.clip()` confines a view to its own rect — everything it draws and everything
it responds to. It goes on the outside, on whatever defines the window:

```ts
tallThing.frame(200, 60).clip()   // clips to 200×60
tallThing.clip().frame(200, 60)   // clips to the tall thing; does nothing useful
```

There is no clip stack in the backends. The context intersects clips as it
descends and stamps the result onto each draw op and hit rect as they are
emitted, so a backend applies one rect per op and a cached subtree replays
correctly with no extra bookkeeping.

`ScrollView` is a viewport onto a taller or wider child:

```ts
const y = signal(0)
ScrollView({ y }, VStack({ spacing: 2 }, ...rows)).frame(320, 190)
```

The offset lives in signals **you** own, one per scrollable axis — an absent
axis does not scroll. That makes scroll position ordinary state: readable,
restorable, animatable, and writing it invalidates exactly the component that
read it, so a scroll re-places that subtree and nothing else.

Two details that matter once viewports nest:

- A viewport registers its scroll region **before** placing its child, so
  inner viewports land later in the list and win the wheel.
- A region that cannot move in the requested direction reports that it did not
  consume the wheel, and it chains outwards. Without this, an outer viewport
  with nothing to scroll silently swallows every wheel event aimed at an inner
  one.

## State and invalidation

```ts
const count = signal(0)
count.set(n => n + 1)          // schedules one rebuild on the next frame
Text(() => `${count()}`)       // views can read signals lazily
```

Rebuilding a view tree is cheap — views are throwaway descriptions, not
retained widgets — but re-measuring one is not. Text measurement and the stack
probes dominate, and both scale with the size of the tree.

`component(key, builder)` caches a subtree:

```ts
const nodeRow = (name: string, i: number) =>
  component(`node:${i}`, () =>
    HStack({ spacing: 9 },
      Text(name).foreground(selected() === i ? '#fafafa' : '#a1a1aa'),
      Spacer(),
    ).onTap(() => selected.set(i)),
  )
```

Signal reads are tracked while a component builds, measures and places itself,
so the component learns exactly which signals its subtree depends on. Each
write bumps that signal's version; a component whose deps are all unchanged
replays its cached size, draw ops and hit rects instead of doing any of that
work again.

In the demo, clicking the counter rebuilds **1 of 8** components — the sidebar,
its five rows and the content panel all replay from cache. Selecting a node
rebuilds 7, because the header does not read that signal.

Two things worth knowing:

- **Ancestors invalidate with their children.** A parent's cached draw ops
  embed its children's, so a dirty leaf invalidates the chain above it.
  The saving comes from *siblings*, which is where the width is in a real tree.
- **Keys must be unique and stable across frames.** Node ids, route names, list
  item ids. Entries whose component did not appear in the last frame are swept.

Versions rather than a shared dirty set: a dirty set has to be cleared by
whoever consumed it, which breaks as soon as two trees are mounted — the first
to render clears it out from under the second.

`mounted.stats()` and `mounted.history()` expose per-frame cache activity;
the demo publishes them as `window.canvasUIStats` / `window.canvasUIHistory`.

## Roadmap

In rough order of value. [TODO.md](TODO.md) has the full list, including the
known gaps behind each item.

1. **Animation.** Give views structural identity (plus an explicit `.id()`),
   diff rects between frames, interpolate. Momentum scrolling falls out of it.
2. **Camera.** Pan/zoom as a transform applied to the root rect, with zoom
   anchored at the cursor.
3. **Spatial index for hit testing.** A quadtree once the scene passes a few
   hundred nodes; the current linear scan is fine below that.
4. **Virtualised lists.** `ScrollView` measures and places its whole child, so
   a very long list costs the whole list. Skipping what falls outside the
   viewport needs a list view that knows its item extents.
5. **Drag on the scrollbar.** The bars are indicators today; they do not accept
   a pointer. Needs pointer capture, which the toolkit has no notion of yet.
6. **Packaging.** A library build and an npm release, so the toolkit can be
   consumed outside this repo.

Deliberately not planned: canvas-native text editing. The gallery's editor is
a DOM textarea and should stay one — a caret, selection and IME are a project
of their own, and the browser already ships a good implementation.

## License

MIT.
