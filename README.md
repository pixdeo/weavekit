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

**Status: early.** The layout engine, the two renderers, scrolling, dragging,
multi-touch and the invalidation model work and are covered by checks. There is
no npm package yet and no animation. See [Roadmap](#roadmap).

## Project status and contributing

This is an open source project. Issues and pull requests are welcome.

- Everything — code, comments, docs, commit messages — is written in English.
- Every behavioural change needs a check in `src/dev/layout-check.ts`. The
  checks run headless in a couple of seconds; there is no browser needed.
- `npm run check && npm run check:layout` must pass before a pull request.
  CI runs both, plus the build, on Node 20 for every push and pull request.

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

## Dragging

`.onDrag()` captures the pointer. From the press until the release, every move
belongs to that gesture — the pointer can leave the view, leave the canvas and
leave the window, and the handler still receives it. That is what a resize
handle, a slider or a draggable object needs, and it is the reason the browser
has `setPointerCapture` at all.

```ts
let from = 0

divider.onDrag(
  {
    onStart: () => { from = sidebarWidth() },
    onMove: (d) => sidebarWidth.set(clamp(from + d.tx, 150, 360)),
  },
  'col-resize',
)

// Move-only gestures can pass a bare function.
knob.onDrag((d) => angle.set(d.ty / 100))
```

Each sample carries `dx`/`dy` (the step since the previous one) and `tx`/`ty`
(the total since the press). **Prefer the totals.** Map them onto state you
snapshotted in `onStart`, as above: a coalesced or dropped move then costs
nothing, whereas summing `dx` accumulates the loss. `onEnd` also fires when the
gesture is cancelled, so it is a safe place to settle state.

The mount loop holds the `Hit` it captured at pointerdown, not a fresh lookup
per move. The tree is rebuilt under the pointer while the drag runs — often
*because* of the drag — and the gesture has to survive that. The practical
consequence is that a drag handler must not read this frame's layout; it reads
what it closed over at `onStart`.

### Several pointers at once

Gestures are keyed by pointer id. Each pointer hit-tests at its own pointerdown,
takes its own capture and runs its own handlers, so two fingers drive two
objects — or the same object twice, which is the handler's problem and not the
loop's. A `pointercancel` terminates that pointer's gesture and leaves the
others alone, and unmounting releases whatever captures are still held.

The cursor is the exception, because there is only one of it. Touch and pen
gestures never set it: nothing is drawn under a finger, and the mouse may be
hovering something else entirely. Among mouse gestures the first to start keeps
the cursor until it ends, so a stray second pointer cannot yank the feedback out
of a drag in flight. With no mouse gesture running it follows hover, as before.

### Pointer type

Every sample carries `pointerType`, one of `'mouse' | 'touch' | 'pen'` — a
backend that cannot classify a pointer reports `'mouse'`. It is constant for the
lifetime of a gesture.

A handler can also refuse a type outright:

```ts
viewport.onDrag({ pointerTypes: ['touch', 'pen'], onMove: pan })
```

A press of any other type is **not** consumed. The hit test skips that entry and
carries on into whatever sits beneath it, so the same rect can pan under a
finger and stay inert under a mouse.

A `ScrollView` uses both halves of this. Its bars are real thumbs you can drag,
sized to a grabbable target rather than to the 4px they draw; and the content
itself pans under a finger, which the next section covers.

## Animation

`animated()` is a signal whose writes take time:

```ts
const x = animated(0, spring({ response: 400, damping: 0.7 }))
const fade = animated(1, tween({ duration: 250, easing: easeOut }))

x.set(280)          // interpolates toward 280 instead of jumping
x.settle()          // lands on it now, at rest
x.animating()       // true while in flight
```

Reading it registers a dependency exactly like a signal read, which is why
there is no animation support anywhere else in the toolkit. Whatever reads an
animated value is invalidated as it moves; a cached component that does not
read it stays cached; the frame loop is the same frame loop. Nothing about the
view tree had to learn what an animation is.

This is deliberately *not* "animate the layout". Interpolating a rect from
where a view was last frame to where it is now needs views to have identity
across frames, and here they are throwaway descriptions with no identity at
all — see the [roadmap](#roadmap). What you get is the layer underneath that
one, which is the layer momentum, transitions and easing actually run on.

A plain number is captured when the view is built, so a value that moves every
frame has to be read lazily. `.offset()` and `.opacity()` take a thunk for
this, the same way `Text(() => …)` already does; anything else goes inside a
`component()`, which re-reads when it rebuilds:

```ts
Circle().frame(30, 30).offset(() => x(), 0).opacity(() => fade())

component('bar', () => Rectangle().frame(w(), 46))   // frame() takes numbers
```

### Springs, and why response and damping

Springs are parameterised as **response** (milliseconds, roughly how long the
move takes) and **damping ratio** (1 stops dead on the target, below 1
overshoots) rather than as stiffness, damping and mass. The three physical
constants are coupled — raising the mass slows the spring *and* makes it
bouncier — so tuning one property always damages another. Response and damping
ratio are the same system written in the two terms anyone actually wants to
choose, and they are orthogonal. Mass disappears because it is redundant with
response once the system is expressed through its natural frequency.

Each step is the closed-form solution of the damped oscillator rather than a
numerical integration, so a step of any size is exact: a 200ms stall produces
the same state as ten 20ms frames, with no drift and no sub-stepping.

The part that matters in use is that a spring **carries its velocity across a
retarget**. Set a new target mid-flight and the path bends; it does not
restart. That is the whole reason to prefer a spring over an easing curve for
anything a finger is driving. `set(to, velocity)` also injects a velocity,
which is how a fling hands over its release speed — see [Momentum](#momentum).

Tweens have no velocity state, so a retarget re-runs the curve from wherever
the value currently is. Continuous in value, discontinuous in speed. That is
inherent to tweens, not an oversight: use one for a fade, a spring for a move.

### The driver

Animations are stepped by a module-level driver:

```ts
advanceAnimations(nowMs)   // -> true while anything is still in flight
```

The timestamp is injected, never read from a clock inside. That is what lets
the headless checks step animations with fake time and assert real numbers,
and it is what a record/replay layer would need later. `mount` calls it once
per frame with the `requestAnimationFrame` timestamp and keeps requesting
frames while it answers true — the boolean is load-bearing, because a tick
that happens to land on the same value writes nothing and would otherwise
strand the animation a frame short of its target.

A single step is capped at 64ms. A backgrounded tab delivers one frame after
an arbitrary gap, and integrating that honestly would teleport everything.

### Colours

`mixColor(from, to, t)` blends two hex colours, so a colour animation is one
animated number and a mapping:

```ts
Rectangle().fill(mixColor('#2563eb', '#f43f5e', t()))
```

Kept as a plain function rather than folded into `animated`: making the value
type generic would buy a runtime type switch and a worse signature for the
case that is 95% of the traffic. The mix is in sRGB, like CSS has always done
it — not perceptually even, but it is what the numbers in a palette were
picked against.

### Momentum

A fling is two halves that meet here. The drag layer measures how fast the
pointer was moving when it was released; the animation layer knows how to
carry a velocity. Neither is much use alone.

Every `Drag` sample carries `vx`/`vy` in units per second, measured over a
100ms trailing window rather than from the last two points. The window is the
whole trick: it survives one jittery final sample, and — the case that
actually matters — a pointer held still before release measures as stopped, so
letting go of a paused drag throws nothing.

A velocity does not name a target, though, and a spring animates *to* one. So
`project()` closes the gap: it integrates an exponential deceleration to the
point a flick would coast to.

```ts
const y = animated(0, spring({ response: 420, damping: 1 }))

// on release, with `v` the offset's velocity
y.set(clamp(project(y(), v), 0, max), v)
```

Clamping the projected point rather than the motion is what makes hitting the
end of a list feel like arriving: the spring still gets the release velocity,
it just has less distance to spend it over.

`ScrollView` does exactly this, and it is why an axis may be an `animated()`
as well as a plain signal — only an `animated()` can be handed a velocity. A
plain signal still scrolls; it simply stops when the finger does. Pressing
again during a coast settles it where it is, so the content never slides out
from under a finger that has caught it.

One rule falls out of the distinction and is worth stating: **a gesture writes
the offset without animating it.** `set` on an `animated()` interpolates, which
is right for a wheel notch and wrong for a finger — content that springs toward
the pointer lags behind it, and direct manipulation means it does not. Drags
and thumbs write through `settle`; only the wheel and the release animate.

### Rubber-banding

Reaching an end does not stop dead. The offset is allowed outside the content,
moving by a fraction of the input that shrinks the further it is pushed, and
springs back afterwards. This is why the viewport reads its offset unclamped:
a bounce that is clipped away is not a bounce.

It applies to the wheel as much as to a finger, which matters more than it
sounds — a trackpad is how most people will meet a scroll view, and a bounce
only touch devices can see is a bounce nobody sees. The wheel has no release
event to hang it off, though: there is no "the fingers left the trackpad", and
a momentum phase keeps delivering deltas long after they did. So the end of a
wheel gesture is inferred from a 100ms gap. That is the one piece of this that
is a heuristic rather than a consequence.

Wheel deltas also accumulate onto where the axis is **heading**, not where it
is. An animated axis is mid-flight for most of a scroll, so measuring from the
current value quietly loses part of every notch after the first.

The resistance curve is Apple's, and so is its useful property — displacement
asymptotes at `viewport / 0.55`, so however hard the content is pulled it can
never be dragged clean off the screen.

The inverse of that curve matters as much as the curve. Grabbing content
mid-bounce has to resume from the raw distance the visible offset stands for;
resisting an already-resisted value makes the content jump under the finger at
the exact moment someone is trying to catch it.

Banding needs somewhere to spring back to, so it also applies only to an
`animated()` axis. A plain signal stops at the end, as it always did.

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
- A region with **nothing to scroll** reports that it did not consume the
  wheel, and it chains outwards. Without this, an outer viewport with nothing
  to scroll silently swallows every wheel event aimed at an inner one.
- A region that has scrollable content but has reached its end **keeps** the
  wheel and bands, rather than handing it outwards mid-gesture. That is what a
  native nested scroller does: once a gesture is in a region, it stays there.
  A plain (non-animated) axis has no band, so it still chains at its end.

A finger dragging the content pans it 1:1 — drag down, the content comes down.
A mouse does not, because a mouse press on content is a press: taps and text
selection have to keep working. That is a `pointerTypes: ['touch', 'pen']` drag
registered over the viewport before its child, so draggable content and the
thumbs both win the press ahead of it, and with no cursor of its own, so a mouse
hovering the content sees no change.

Chaining works differently for a pan than for the wheel, and only half of it
survives. A viewport with nothing to move registers no pan hit at all, so the
press falls through to an enclosing viewport that does have room — that is the
wheel's rule. But a pan that runs out of room *mid-gesture* cannot hand over: it
already owns the pointer, and the browser has no way to transfer a capture. It
clamps and holds until release. Chaining a live drag outwards would need the
gesture to be re-targetable, which capture deliberately prevents.

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

1. **View transitions.** Animatable state exists — see
   [Animation](#animation) — but interpolating *layout* does not. A view
   sliding from where it was last frame to where it is now needs structural
   identity plus an explicit `.id()`, then a diff of rects between frames.
2. **Camera.** Pan/zoom as a transform applied to the root rect, with zoom
   anchored at the cursor. Pinch-to-zoom lands here: pointers are already
   tracked concurrently, but without a transform there is nothing to drive.
3. **Spatial index for hit testing.** A quadtree once the scene passes a few
   hundred nodes; the current linear scan is fine below that.
4. **Virtualised lists.** `ScrollView` measures and places its whole child, so
   a very long list costs the whole list. Skipping what falls outside the
   viewport needs a list view that knows its item extents.
5. **Packaging.** A library build and an npm release, so the toolkit can be
   consumed outside this repo.

Deliberately not planned: canvas-native text editing. The gallery's editor is
a DOM textarea and should stay one — a caret, selection and IME are a project
of their own, and the browser already ships a good implementation.

## License

MIT.
