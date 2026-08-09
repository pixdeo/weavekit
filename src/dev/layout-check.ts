/**
 * Headless layout assertions. Stubs canvas text measurement, runs real layout
 * passes and checks the resulting rects. Run with `npm run check:layout`.
 */

export {}

const stub = globalThis as unknown as { document?: unknown }
stub.document = {
  createElement: () => ({
    getContext: () => {
      let size = 14
      return {
        set font(v: string) {
          size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(v)?.[1] ?? '14')
        },
        get font() {
          return `${size}px`
        },
        measureText: (s: string) => ({ width: s.length * size * 0.5 }),
      }
    },
  }),
}

const win = globalThis as unknown as {
  window?: unknown
  requestAnimationFrame?: unknown
}
win.window = { addEventListener: () => {}, removeEventListener: () => {}, devicePixelRatio: 1 }
// Synchronous frames keep the checks deterministic.
win.requestAnimationFrame = (cb: (t: number) => void) => {
  cb(0)
  return 0
}

const { hitTestable } = await import('../core/types')
const { Ctx } = await import('../core/ctx')
const { Text } = await import('../views/text')
const { VStack, HStack } = await import('../views/stack')
const { Spacer } = await import('../views/spacer')
const { Rectangle, RoundedRect } = await import('../views/shape')

let failures = 0

function check(name: string, got: unknown, want: unknown): void {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a === b) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}\n       got  ${a}\n       want ${b}`)
  }
}

const round = (r: { x: number; y: number; w: number; h: number }) => ({
  x: Math.round(r.x),
  y: Math.round(r.y),
  w: Math.round(r.w),
  h: Math.round(r.h),
})

/* 1. Spacer absorbs the leftover room, rigid children keep their size. */
{
  const ctx = new Ctx()
  const v = VStack(
    { spacing: 10 },
    Rectangle().fill('#f00').frame(null, 20),
    Spacer(),
    Rectangle().fill('#00f').frame(null, 30),
  )
  v.measure({ w: 200, h: 200 }, ctx)
  v.place({ x: 0, y: 0, w: 200, h: 200 }, ctx)
  const rects = ctx.ops.map((o) => round(o.rect))
  check('vstack: first child pinned to top', rects[0], { x: 0, y: 0, w: 200, h: 20 })
  check('vstack: spacer pushes last child to the bottom', rects[1], { x: 0, y: 170, w: 200, h: 30 })
}

/* 2. Sidebar keeps its fixed width, .expand() takes the rest. */
{
  const ctx = new Ctx()
  const row = HStack(
    { spacing: 0 },
    Rectangle().fill('#111').frame(210, null),
    Rectangle().fill('#222').expand(),
  )
  row.measure({ w: 800, h: 400 }, ctx)
  row.place({ x: 0, y: 0, w: 800, h: 400 }, ctx)
  const rects = ctx.ops.map((o) => round(o.rect))
  check('hstack: fixed sidebar', rects[0], { x: 0, y: 0, w: 210, h: 400 })
  check('hstack: expanding content', rects[1], { x: 210, y: 0, w: 590, h: 400 })
}

/* 3. Background paints exactly the padded box; modifier order matters. */
{
  const ctx = new Ctx()
  const v = Text('hi').font({ size: 20 }).padding(10).background(RoundedRect(4).fill('#000'))
  const size = v.measure({ w: null, h: null }, ctx)
  v.place({ x: 5, y: 5, w: size.w, h: size.h }, ctx)
  const bg = round(ctx.ops[0].rect)
  const text = round(ctx.ops[1].rect)
  check('background covers the padded box', bg, { x: 5, y: 5, w: 40, h: 47 })
  check('text sits inside the padding', text, { x: 15, y: 15, w: 20, h: 27 })
}

/* 4. Text wraps to the proposed width. */
{
  const ctx = new Ctx()
  const t = Text('one two three four five six seven eight nine ten').font({ size: 12 })
  const narrow = t.measure({ w: 120, h: null }, ctx)
  const wide = t.measure({ w: 600, h: null }, ctx)
  check('narrow text wraps taller', narrow.h > wide.h, true)
  check('narrow text respects the proposal', narrow.w <= 120, true)
}

/* 5. Tap targets land on the final rect, innermost last. */
{
  const ctx = new Ctx()
  const v = VStack(
    { spacing: 0 },
    Rectangle()
      .fill('#111')
      .frame(null, 40)
      .onTap(() => {}),
    Rectangle()
      .fill('#222')
      .frame(null, 40)
      .onTap(() => {}),
  )
  v.measure({ w: 100, h: 80 }, ctx)
  v.place({ x: 0, y: 0, w: 100, h: 80 }, ctx)
  check('hit rects follow layout', ctx.hits.map((h) => round(h.rect)), [
    { x: 0, y: 0, w: 100, h: 40 },
    { x: 0, y: 40, w: 100, h: 40 },
  ])
  check('tap targets default to the pointer cursor', ctx.hits.map((h) => h.cursor), [
    'pointer',
    'pointer',
  ])
}

/* 6. Cursor-only regions register a hit with no handler. */
{
  const ctx = new Ctx()
  const v = Rectangle().fill('#111').frame(7, null).cursor('col-resize')
  v.measure({ w: 7, h: 100 }, ctx)
  v.place({ x: 20, y: 0, w: 7, h: 100 }, ctx)
  check('cursor region rect', ctx.hits.map((h) => round(h.rect)), [{ x: 20, y: 0, w: 7, h: 100 }])
  check('cursor region has no tap handler', ctx.hits[0].handler === undefined, true)
  check('cursor region carries its cursor', ctx.hits[0].cursor, 'col-resize')
}

/* 7. A Text next to a Spacer keeps its natural width instead of being handed
      an even share of the row and wrapping for no reason. */
{
  const row = () =>
    HStack(
      { spacing: 9, align: 'center' },
      Rectangle().fill('#fff').frame(6, 6),
      Text('Gaussian Blur').font({ size: 13 }),
      Spacer(),
    )

  const wide = new Ctx()
  const wideSize = row().measure({ w: 172, h: null }, wide)
  check('wide row does not wrap the label', Math.round(wideSize.h), 18)

  const narrow = new Ctx()
  const narrowSize = row().measure({ w: 60, h: null }, narrow)
  check('narrow row still compresses and wraps', narrowSize.h > wideSize.h, true)
}

/* 8. Cursor feedback: drive the real mount loop through a recording backend. */
{
  const { mount } = await import('../core/mount')
  const { Button } = await import('../views/button')

  let cursor = ''
  let move: (x: number, y: number) => void = () => {}
  let down: (x: number, y: number) => void = () => {}
  let taps = 0

  const backend = {
    el: {},
    resize: () => {},
    draw: () => {},
    onPointerDown: (cb: (x: number, y: number) => void) => {
      down = cb
    },
    onPointerMove: (cb: (x: number, y: number) => void) => {
      move = cb
    },
    onPointerUp: () => {},
    capturePointer: () => {},
    releasePointer: () => {},
    onWheel: () => {},
    setCursor: (c: string) => {
      cursor = c
    },
    destroy: () => {},
  }

  const host = { clientWidth: 300, clientHeight: 100, replaceChildren: () => {} }

  mount(
    host as unknown as HTMLElement,
    backend as unknown as Parameters<typeof mount>[1],
    () =>
      HStack(
        { spacing: 0 },
        Button('Save', () => {
          taps++
        }),
        Rectangle().fill('#111').frame(7, null).cursor('col-resize'),
        Rectangle().fill('#222').expand(),
      ),
  )

  // With the stubbed metrics the button is 50px wide and vertically centred in
  // the 100px row, so the 7px grab strip occupies x 50..57.
  move(20, 50)
  check('pointer cursor over a button', cursor, 'pointer')

  move(53, 50)
  check('resize cursor over the grab strip', cursor, 'col-resize')

  move(250, 50)
  check('default cursor over empty space', cursor, 'default')

  move(20, 5)
  check('default cursor above the centred button', cursor, 'default')

  down(20, 50)
  check('tap fires on the button', taps, 1)

  down(53, 50)
  check('cursor-only region swallows no taps', taps, 1)
}

/* 9. Fine-grained invalidation: a write rebuilds only the components that read
      the signal, while siblings replay their cached size and draw ops. */
{
  const { mount } = await import('../core/mount')
  const { component } = await import('../core/component')
  const { signal } = await import('../core/signal')

  const left = signal(0)
  const right = signal(0)

  let ops: { t: string; lines?: string[] }[] = []
  const backend = {
    el: {},
    resize: () => {},
    draw: (o: typeof ops) => {
      ops = o
    },
    onPointerDown: () => {},
    onPointerMove: () => {},
    onPointerUp: () => {},
    capturePointer: () => {},
    releasePointer: () => {},
    onWheel: () => {},
    setCursor: () => {},
    destroy: () => {},
  }
  const host = { clientWidth: 400, clientHeight: 100, replaceChildren: () => {} }

  const mounted = mount(
    host as unknown as HTMLElement,
    backend as unknown as Parameters<typeof mount>[1],
    () =>
      VStack(
        { spacing: 0 },
        component('left', () => Text(() => `left ${left()}`)),
        component('right', () => Text(() => `right ${right()}`)),
      ),
  )

  const texts = () => ops.filter((o) => o.t === 'text').map((o) => o.lines!.join(''))

  check('first frame builds every component', mounted.stats().built, 2)
  check('first frame draws both', texts(), ['left 0', 'right 0'])

  left.set(7)
  check('a write rebuilds only its reader', mounted.stats().built, 1)
  check('the sibling replays cached draw ops', mounted.stats().reusedPlace, 1)
  check('the sibling skips re-measuring', mounted.stats().reusedMeasure > 0, true)
  check('both subtrees still draw', texts(), ['left 7', 'right 0'])

  right.set(3)
  check('the other direction rebuilds only its reader', mounted.stats().built, 1)
  check('output stays correct', texts(), ['left 7', 'right 3'])

  // A no-op write must not invalidate anything.
  right.set(3)
  check('setting an unchanged value rebuilds nothing', mounted.stats().built, 1)

  mounted.unmount()
}

/* 10. The demo's shape: a header, a sidebar of rows and a content panel.
       Shows both the win and its limit — ancestors of a dirty component are
       invalidated too, because their cached ops embed the child's. */
{
  const { mount } = await import('../core/mount')
  const { component } = await import('../core/component')
  const { signal } = await import('../core/signal')

  const names = ['a', 'b', 'c', 'd', 'e']
  const selected = signal(0)
  const taps = signal(0)

  const backend = {
    el: {},
    resize: () => {},
    draw: () => {},
    onPointerDown: () => {},
    onPointerMove: () => {},
    onPointerUp: () => {},
    capturePointer: () => {},
    releasePointer: () => {},
    onWheel: () => {},
    setCursor: () => {},
    destroy: () => {},
  }
  const host = { clientWidth: 400, clientHeight: 300, replaceChildren: () => {} }

  const mounted = mount(
    host as unknown as HTMLElement,
    backend as unknown as Parameters<typeof mount>[1],
    () =>
      VStack(
        { spacing: 0 },
        component('header', () => Text(() => `taps ${taps()}`)),
        component('sidebar', () =>
          VStack(
            { spacing: 0 },
            ...names.map((name, i) =>
              component(`row:${i}`, () => Text(`${name}${selected() === i ? ' *' : ''}`)),
            ),
          ),
        ),
        component('content', () => Text(() => names[selected()])),
      ),
  )

  check('mount builds header, sidebar, 5 rows and content', mounted.stats().built, 8)

  taps.set(1)
  check('the counter rebuilds the header alone', mounted.stats().built, 1)

  selected.set(2)
  check('selection rebuilds the sidebar, its rows and content', mounted.stats().built, 7)
  check('the header survives a selection change', mounted.stats().reusedPlace, 1)

  mounted.unmount()
}

/* 11. Clipping confines both drawing and hit testing to the clipping rect. */
{
  const { ScrollView } = await import('../views/scroll')
  const { signal } = await import('../core/signal')

  // `.clip()` clips to the rect of the view it is applied to, so it goes on
  // the outside — on whatever defines the window.
  {
    const ctx = new Ctx()
    const v = Rectangle().fill('#111').frame(200, 200).frame(200, 60).clip()
    v.measure({ w: 200, h: 60 }, ctx)
    v.place({ x: 0, y: 0, w: 200, h: 60 }, ctx)
    check('the op still overflows', round(ctx.ops[0].rect), { x: 0, y: -70, w: 200, h: 200 })
    check('but it carries the clip window', round(ctx.ops[0].clip!), {
      x: 0,
      y: 0,
      w: 200,
      h: 60,
    })
  }

  {
    const ctx = new Ctx()
    const v = Rectangle()
      .fill('#111')
      .frame(100, 100)
      .onTap(() => {})
      .frame(100, 40)
      .clip()
    v.measure({ w: 100, h: 40 }, ctx)
    v.place({ x: 0, y: 0, w: 100, h: 40 }, ctx)
    const hit = ctx.hits[0]
    check('a hit inside the clip is live', hitTestable(hit.rect, hit.clip, 50, 20), true)
    check('a hit outside the clip is dead', hitTestable(hit.rect, hit.clip, 50, 60), false)
  }

  /* A scroll view shifts its child, clips it, and clamps the offset. */
  {
    const y = signal(0)
    const rows = VStack({ spacing: 0 }, ...Array.from({ length: 10 }, () => Rectangle().frame(100, 20)))

    const place = () => {
      const ctx = new Ctx()
      const v = ScrollView({ y }, rows)
      v.measure({ w: 100, h: 100 }, ctx)
      v.place({ x: 0, y: 0, w: 100, h: 100 }, ctx)
      return ctx
    }

    const first = place()
    check('unscrolled content starts at the top', round(first.ops[0].rect).y, 0)
    check('the viewport registers a scroll region', first.scrolls.length, 1)

    check('the wheel moves the offset', first.scrolls[0].scroll(0, 60), true)
    check('the offset followed', y(), 60)
    check('scrolled content shifts up', round(place().ops[0].rect).y, -60)

    // Content is 200 tall in a 100 viewport, so 100 is the far end.
    place().scrolls[0].scroll(0, 999)
    check('the offset is clamped to the content', y(), 100)

    // At the end, the wheel is not consumed — it chains out to any enclosing
    // viewport instead of being swallowed.
    check('a spent region does not consume the wheel', place().scrolls[0].scroll(0, 10), false)

    place().scrolls[0].scroll(0, -999)
    check('the offset is clamped at the top', y(), 0)
  }
}

/* 12. Every gallery example lays out and draws something, and its code panel
       fits the 430px column. Catches a broken example before the browser does. */
{
  const { examples } = await import('../examples')
  const { compileView } = await import('../gallery/compile')

  check('the gallery has examples', examples.length > 0, true)

  // A readability limit, not a rendering one: the editor is a textarea and
  // scrolls horizontally, but a reader should not have to.
  //   (430px panel - 32px padding) / ~7.2px per char at 12px ≈ 55
  const MAX_CODE_COLUMNS = 55

  for (const example of examples) {
    const result = compileView(example.code)
    check(
      `example "${example.id}" compiles`,
      result.ok ? true : `compile failed: ${result.error}`,
      true,
    )
    if (!result.ok) continue

    const ctx = new Ctx()
    result.view.measure({ w: 600, h: 400 }, ctx)
    result.view.place({ x: 0, y: 0, w: 600, h: 400 }, ctx)
    check(`example "${example.id}" draws something`, ctx.ops.length > 0, true)

    const longest = Math.max(...example.code.split('\n').map((l) => l.length))
    check(
      `example "${example.id}" code fits ${MAX_CODE_COLUMNS} columns (longest ${longest})`,
      longest <= MAX_CODE_COLUMNS,
      true,
    )
  }

  // Broken source must come back as a message, never as an exception.
  const broken = compileView('VStack(')
  check('a syntax error is reported, not thrown', broken.ok, false)
  const notAView = compileView('42')
  check('a non-view result is reported', notAView.ok, false)
}

/* 13. Pointer capture: a drag keeps the pointer after it leaves the view, and
       keeps the handler it started with even as the tree rebuilds under it. */
{
  const { mount } = await import('../core/mount')
  const { signal } = await import('../core/signal')

  let cursor = ''
  let move: (x: number, y: number, id: number) => void = () => {}
  let down: (x: number, y: number, id: number) => void = () => {}
  let up: (x: number, y: number, id: number) => void = () => {}
  let captured: number | null = null

  const backend = {
    el: {},
    resize: () => {},
    draw: () => {},
    onPointerDown: (cb: typeof down) => {
      down = cb
    },
    onPointerMove: (cb: typeof move) => {
      move = cb
    },
    onPointerUp: (cb: typeof up) => {
      up = cb
    },
    capturePointer: (id: number) => {
      captured = id
    },
    releasePointer: () => {
      captured = null
    },
    onWheel: () => {},
    setCursor: (c: string) => {
      cursor = c
    },
    destroy: () => {},
  }
  const host = { clientWidth: 300, clientHeight: 100, replaceChildren: () => {} }

  // A resizable divider: the width the drag started from is snapshotted in
  // `onStart`, and every move maps the gesture's total onto it.
  const width = signal(100)
  const log: string[] = []

  const mounted = mount(
    host as unknown as HTMLElement,
    backend as unknown as Parameters<typeof mount>[1],
    () => {
      let from = 0
      return HStack(
        { spacing: 0 },
        Rectangle().fill('#111').frame(width(), null),
        Rectangle()
          .fill('#222')
          .frame(10, null)
          .onDrag(
            {
              onStart: () => {
                from = width()
                log.push('start')
              },
              onMove: (d) => width.set(from + d.tx),
              onEnd: () => log.push('end'),
            },
            'col-resize',
          ),
        Rectangle().fill('#333').expand(),
      )
    },
  )

  move(105, 50, 1)
  check('the divider shows its cursor on hover', cursor, 'col-resize')

  down(105, 50, 1)
  check('pressing the divider captures the pointer', captured, 1)
  check('onStart fired once', log, ['start'])

  move(145, 50, 1)
  check('the drag moved the divider', width(), 140)

  // Past the divider's own rect, and past the whole element. Without capture
  // both of these would be lost.
  move(400, 50, 1)
  check('the drag survives leaving the view', width(), 395)
  check('the gesture keeps its cursor off-view', cursor, 'col-resize')

  // A different pointer must not steer someone else's gesture.
  move(20, 50, 2)
  check('another pointer does not drive the drag', width(), 395)

  up(400, 50, 1)
  check('release frees the pointer', captured, null)
  check('onEnd fired once', log, ['start', 'end'])

  // `from` was read once at onStart, so a second drag starts from the new
  // width rather than replaying the first one.
  down(400, 50, 1)
  move(380, 50, 1)
  up(380, 50, 1)
  check('a second drag starts from where the first left off', width(), 375)

  // Moving with no gesture in flight goes back to plain hover feedback.
  move(20, 50, 1)
  check('the cursor returns to the view under the pointer', cursor, 'default')

  mounted.unmount()
}

/* 14. A scroll view's bar is a real thumb: dragging it scrolls the content. */
{
  const { ScrollView } = await import('../views/scroll')
  const { signal } = await import('../core/signal')

  const y = signal(0)
  const rows = VStack({ spacing: 0 }, ...Array.from({ length: 10 }, () => Rectangle().frame(100, 20)))

  const ctx = new Ctx()
  const v = ScrollView({ y }, rows)
  v.measure({ w: 100, h: 100 }, ctx)
  v.place({ x: 0, y: 0, w: 100, h: 100 }, ctx)

  const thumb = ctx.hits.find((h) => h.drag)
  check('the vertical bar registers a draggable thumb', thumb != null, true)
  check('the thumb is grabbable at more than its 4px width', thumb!.rect.w > 4, true)
  check('the thumb offers a grab cursor', thumb!.cursor, 'grab')

  // Content is 200 tall in a 100 viewport: the thumb is 50 tall with 50 of
  // travel, so a pixel of thumb is two pixels of content.
  const drag = (ty: number) => ({ x: 0, y: ty, dx: 0, dy: ty, tx: 0, ty, startX: 0, startY: 0 })
  thumb!.drag!.onStart!(drag(0))
  thumb!.drag!.onMove!(drag(10))
  check('dragging the thumb scrolls twice as far', y(), 20)

  thumb!.drag!.onMove!(drag(999))
  check('the thumb drag clamps at the end', y(), 100)

  thumb!.drag!.onMove!(drag(-999))
  check('the thumb drag clamps at the top', y(), 0)

  // Nothing to scroll means nothing to grab.
  const still = new Ctx()
  const fits = ScrollView({ y: signal(0) }, Rectangle().frame(100, 50))
  fits.measure({ w: 100, h: 100 }, still)
  fits.place({ x: 0, y: 0, w: 100, h: 100 }, still)
  check('content that fits registers no thumb', still.hits.length, 0)
}

console.log(failures === 0 ? '\nall layout checks passed' : `\n${failures} check(s) failed`)
if (failures > 0) process.exitCode = 1
