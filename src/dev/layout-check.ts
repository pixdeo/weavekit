/**
 * Headless layout assertions. Stubs canvas text measurement, runs real layout
 * passes and checks the resulting rects. Run with `npm run check:layout`.
 */

export {}

const stub = globalThis as unknown as { document?: unknown }
stub.document = {
  /**
   * Enough of an element for both users of `createElement` here: the text
   * measurer, which only wants a 2D context, and the canvas backend, which
   * wants a style bag and a bitmap it can size.
   */
  createElement: () => {
    let size = 14
    let w = 0
    let h = 0
    const el = {
      style: {} as Record<string, string>,
      /** Assignments to `width`. A bitmap reallocation is what this counts. */
      writes: 0,
      addEventListener: () => {},
      remove: () => {},
      setPointerCapture: () => {},
      hasPointerCapture: () => false,
      releasePointerCapture: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      getContext: () => ({
        set font(v: string) {
          size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(v)?.[1] ?? '14')
        },
        get font() {
          return `${size}px`
        },
        measureText: (s: string) => ({ width: s.length * size * 0.5 }),
        setTransform: () => {},
        clearRect: () => {},
      }),
    }
    Object.defineProperty(el, 'width', {
      get: () => w,
      set: (v: number) => {
        w = v
        el.writes++
      },
    })
    Object.defineProperty(el, 'height', { get: () => h, set: (v: number) => (h = v) })
    return el
  },
}

const win = globalThis as unknown as {
  window?: unknown
  requestAnimationFrame?: unknown
}
/** Listeners the mount loop registered on the stub window, so the checks can
    dispatch `keydown`/`resize` events at it. */
const winListeners = new Map<string, ((e: unknown) => void)[]>()
win.window = {
  addEventListener: (type: string, cb: (...args: never[]) => void) => {
    const list = winListeners.get(type) ?? []
    list.push(cb as (e: unknown) => void)
    winListeners.set(type, list)
  },
  removeEventListener: (type: string, cb: (...args: never[]) => void) => {
    const list = winListeners.get(type) ?? []
    winListeners.set(type, list.filter((f) => f !== cb))
  },
  devicePixelRatio: 1,
}
/** Dispatches a keydown to whatever the mount loop registered. */
const keydown = (e: unknown): void => {
  for (const cb of winListeners.get('keydown') ?? []) cb(e)
}
/**
 * A fake frame clock. Frames are handed its current value, and the animation
 * checks step it, so the mount loop and the animation driver agree on the
 * time without either one reading a real one.
 */
let clock = 0
const advanceClock = (ms: number): number => (clock += ms)

let inFrame = false
let parked: ((t: number) => void) | null = null

const runFrame = (cb: (t: number) => void): void => {
  inFrame = true
  try {
    cb(clock)
  } finally {
    inFrame = false
  }
}

/**
 * Synchronous frames keep the checks deterministic. A frame requested from
 * *inside* a frame is parked rather than nested: once `mount` drives the
 * animation driver it asks for the next frame from within the current one, and
 * running that inline would recurse until the stack gave out.
 */
win.requestAnimationFrame = (cb: (t: number) => void) => {
  if (inFrame) parked = cb
  else runFrame(cb)
  return 0
}

/**
 * Runs a parked frame, if there is one. Deliberately one at a time: an
 * animation in flight parks a fresh frame every time it runs, so draining to
 * empty would never finish.
 */
const flushFrame = (): void => {
  const cb = parked
  parked = null
  if (cb) runFrame(cb)
}

const { hitTestable } = await import('../core/types')
const { Ctx } = await import('../core/ctx')
const { Text } = await import('../views/text')
const { VStack, HStack, ZStack } = await import('../views/stack')
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
  const { compileSource, compileView } = await import('../gallery/compile')

  check('the gallery has examples', examples.length > 0, true)

  // A readability limit, not a rendering one: the editor is a textarea and
  // scrolls horizontally, but a reader should not have to.
  //   (430px panel - 32px padding) / ~7.2px per char at 12px ≈ 55
  const MAX_CODE_COLUMNS = 55

  for (const example of examples) {
    const result = compileSource(example.code)
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

/* 12b. The spreadsheet model: the view reads, the actions write. Tap, type,
       Enter, Backspace — each flows through the model into a rebuilt frame,
       so the live sum and the selection highlight follow. */
{
  const { examples } = await import('../examples')
  const { compileSource } = await import('../gallery/compile')
  const { mount } = await import('../core/mount')

  const ex = examples.find((e) => e.id === 'spreadsheet')!
  const result = compileSource(ex.code)
  if (result.ok) {
    let ops: InstanceType<typeof Ctx>['ops'] = []
    const draws: InstanceType<typeof Ctx>['ops'][] = []
    let down: (x: number, y: number, id: number) => void = () => {}
    const backend = {
      el: {},
      resize: () => {},
      draw: (o: InstanceType<typeof Ctx>['ops']) => {
        ops = o
        draws.push(o)
      },
      onPointerDown: (cb: typeof down) => {
        down = cb
      },
      onPointerMove: () => {},
      onPointerUp: () => {},
      capturePointer: () => {},
      releasePointer: () => {},
      onWheel: () => {},
      setCursor: () => {},
      destroy: () => {},
    }
    const host = { clientWidth: 600, clientHeight: 560, replaceChildren: () => {} }
    mount(
      host as unknown as HTMLElement,
      backend as unknown as Parameters<typeof mount>[1],
      () => result.view,
    )

    const press = (k: string): void =>
      keydown({
        key: k,
        code: '',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        repeat: false,
        isComposing: false,
        target: null,
      })

    const sum = (): string =>
      ops.filter((o) => o.t === 'text')
        .map((o) => o.lines[0])
        .find((t) => t.startsWith('=SUM')) ?? 'none'

    const hl = (): [number, number] => {
      const r = ops.find((o) => o.t === 'rect' && o.fill === '#1e3a5f')
      return r ? [Math.round(r.rect.x), Math.round(r.rect.y)] : [-1, -1]
    }

    // Seeds B2=3, B3=7, B4=5 -> =SUM(B2:B4) → 15
    check('spreadsheet seeds sum to 15', sum(), '=SUM(B2:B4) → 15')

    // The compile-time layout leaves vw at the throwaway 480px. The onLayout
    // reporter must invalidate with the real size: at least one settled frame
    // renders the full 600px viewport (A..I), not the stale A..G.
    const fullViewport = (): boolean =>
      draws.some((o) =>
        o.filter((op) => op.t === 'text')
          .map((op) => op.lines[0])
          .filter((t) => /^[A-Z]+$/.test(t))
          .join('') === 'ABCDEFGHI')
    check('a frame fills the viewport after the size is learned', fullViewport(), true)

    // Tap B2 (x = 40 + 64 + 32, y = formula + 24 + 26 + 13) and type "4".
    down(136, 94, 1)
    check('tapping a cell moves the highlight', hl(), [104, 80])
    press('4')
    check('typing appends to the selected cell', sum(), '=SUM(B2:B4) → 46')

    // Enter moves the selection to B3; typing "2" gives "72" -> 111.
    press('Enter')
    check('Enter moves the highlight down a row', hl(), [104, 106])
    press('2')
    check('Enter moves down and typing follows', sum(), '=SUM(B2:B4) → 111')

    // Backspace clears the selected cell: 34 + 5 = 39.
    press('Backspace')
    check('backspace clears the selected cell', sum(), '=SUM(B2:B4) → 39')

    const highlighted = ops.filter((o) => o.t === 'rect' && o.fill === '#1e3a5f').length
    check('exactly one cell is highlighted', highlighted, 1)
  }
}

/* 12c. A signal written mid-pass (an onLayout reporter) must still invalidate
       the component next frame. The old post-pass stamp masked such writes —
       the spreadsheet's size-correction never rebuilt. */
{
  const { mount } = await import('../core/mount')
  const { component } = await import('../core/component')
  const { signal } = await import('../core/signal')

  let builds = 0
  let done = false
  const tick = signal(0)
  const view = component('reactive', () => {
    builds++
    tick()
    return Rectangle().fill('#111').frame(50, 50)
      .onLayout(() => {
        if (!done) {
          done = true
          tick.set(n => n + 1)
        }
      })
  })

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
  const host = { clientWidth: 100, clientHeight: 100, replaceChildren: () => {} }
  const mounted = mount(
    host as unknown as HTMLElement,
    backend as unknown as Parameters<typeof mount>[1],
    () => view,
  )

  check('an onLayout write still rebuilds next frame', builds, 2)

  mounted.invalidate()
  check('...and the component settles afterwards', builds, 2)
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

/* 13b. Keyboard focus: pressing a .onKey() view routes keydown to it, like an
       input's focus — and a press elsewhere blurs it. Keys aimed at a DOM
       textarea (the gallery's code editor) must never be stolen. */
{
  const { mount } = await import('../core/mount')

  const log: string[] = []
  let down: (x: number, y: number, id: number) => void = () => {}

  const backend = {
    el: {},
    resize: () => {},
    draw: () => {},
    onPointerDown: (cb: typeof down) => {
      down = cb
    },
    onPointerMove: () => {},
    onPointerUp: () => {},
    capturePointer: () => {},
    releasePointer: () => {},
    onWheel: () => {},
    setCursor: () => {},
    destroy: () => {},
  }
  const host = { clientWidth: 300, clientHeight: 80, replaceChildren: () => {} }

  const press = (k: string): void =>
    keydown({
      key: k,
      code: '',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false,
      isComposing: false,
      target: null,
    })

  const mounted = mount(
    host as unknown as HTMLElement,
    backend as unknown as Parameters<typeof mount>[1],
    () =>
      HStack(
        { spacing: 0 },
        Rectangle().fill('#111').frame(100, null).onKey((k) => log.push(`a:${k.key}`)),
        Rectangle().fill('#222').frame(100, null),
        Rectangle().fill('#333').expand().onKey((k) => log.push(`c:${k.key}`)),
      ),
  )

  down(10, 10, 1) // press the first rect → it is focused
  press('x')
  check('the pressed view receives keys', log, ['a:x'])

  down(150, 10, 1) // press the plain rect → nothing is focused
  press('y')
  check('a press on no key view blurs', log, ['a:x'])

  down(250, 10, 1) // press the third rect → focus moves
  press('z')
  check('focus follows the press', log, ['a:x', 'c:z'])

  // A key-capable leaf wins over its key-capable parent: both wrap the same
  // rect, and the inner KeyMod lands later in the hit list.
  mounted.unmount()

  const innerMount = mount(
    host as unknown as HTMLElement,
    backend as unknown as Parameters<typeof mount>[1],
    () =>
      HStack({ spacing: 0 },
        Rectangle().fill('#111').expand().onKey((k) => log.push(`outer:${k.key}`)),
        Rectangle().fill('#222').frame(40, null).onKey((k) => log.push(`inner:${k.key}`)),
      ),
  )
  down(10, 10, 1) // inside the outer rect, outside the inner one
  press('o')
  check('the outer view is focused outside its child', log, ['a:x', 'c:z', 'outer:o'])

  down(280, 10, 1) // inside the inner rect
  press('i')
  check('a key-capable leaf wins over its parent', log, ['a:x', 'c:z', 'outer:o', 'inner:i'])

  // Plain data passes through whole: repeat, modifiers and isComposing.
  down(10, 10, 1) // refocus the outer
  keydown({
    key: 'Enter',
    code: 'Enter',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: true,
    repeat: true,
    isComposing: false,
    target: null,
  })
  check(
    'repeat and modifiers pass through to the handler',
    log[log.length - 1],
    'outer:Enter',
  )

  innerMount.unmount()

  // The guard: a keydown aimed at a DOM textarea must not reach the view.
  const textareaMount = mount(
    host as unknown as HTMLElement,
    backend as unknown as Parameters<typeof mount>[1],
    () => Rectangle().fill('#111').expand().onKey((k) => log.push(`t:${k.key}`)),
  )
  down(10, 10, 1)
  keydown({
    key: 'q',
    code: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    target: { tagName: 'TEXTAREA' },
  })
  check('keys aimed at a textarea are not routed', log[log.length - 1] !== 't:q', true)

  textareaMount.unmount()
}

/* 13c. A handler on a ZStack child with .offset() keeps the child's rect:
       the ZStack would otherwise hand it the whole stack, and the last
       child would swallow every tap. */
{
  const ctx = new Ctx()
  const v = ZStack(
    Rectangle().fill('#111').frame(200, 100),
    HStack({ spacing: 0, align: 'leading' },
      Rectangle().fill('#222').frame(30, 20).onTap(() => {}),
    ).offset(40, 50),
    HStack({ spacing: 0, align: 'leading' },
      Rectangle().fill('#333').frame(60, 15).onTap(() => {}),
    ).offset(120, 10),
  )
  v.measure({ w: 200, h: 100 }, ctx)
  v.place({ x: 0, y: 0, w: 200, h: 100 }, ctx)
  const taps = ctx.hits.filter((h) => h.handler)
  check('both offset taps register', taps.length, 2)
  check('an offset tap keeps its own rect', taps[0].rect, { x: 40, y: 50, w: 30, h: 20 })
  check('the next offset tap lands too', taps[1].rect, { x: 120, y: 10, w: 60, h: 15 })
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

  // The viewport also registers a pan hit; the thumb is the one with a cursor.
  const thumb = ctx.hits.find((h) => h.drag && h.cursor)
  check('the vertical bar registers a draggable thumb', thumb != null, true)
  check('the thumb is grabbable at more than its 4px width', thumb!.rect.w > 4, true)
  check('the thumb offers a grab cursor', thumb!.cursor, 'grab')

  // Content is 200 tall in a 100 viewport: the thumb is 50 tall with 50 of
  // travel, so a pixel of thumb is two pixels of content.
  const drag = (ty: number) =>
    ({
      x: 0, y: ty, dx: 0, dy: ty, tx: 0, ty,
      startX: 0, startY: 0, vx: 0, vy: 0, pointerType: 'mouse',
    }) as const
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

/* 15. Multi-touch: gestures are keyed by pointer id, so several pointers run
       their own handlers at the same time. Driven through the real mount loop
       with a recording backend, because that loop is the whole feature. */
{
  const { mount } = await import('../core/mount')
  const { signal } = await import('../core/signal')

  type Pointer = (x: number, y: number, id: number, type?: string) => void

  /** A backend that records the cursor and the captures it was asked for. */
  const harness = () => {
    let cursor = ''
    const captured = new Set<number>()
    const fns = {
      down: (() => {}) as Pointer,
      move: (() => {}) as Pointer,
      up: (() => {}) as Pointer,
    }
    const backend = {
      el: {},
      resize: () => {},
      draw: () => {},
      onPointerDown: (cb: Pointer) => {
        fns.down = cb
      },
      onPointerMove: (cb: Pointer) => {
        fns.move = cb
      },
      onPointerUp: (cb: Pointer) => {
        fns.up = cb
      },
      capturePointer: (id: number) => {
        captured.add(id)
      },
      releasePointer: (id: number) => {
        captured.delete(id)
      },
      onWheel: () => {},
      setCursor: (c: string) => {
        cursor = c
      },
      destroy: () => {},
    }
    return { backend, captured, fns, cursor: () => cursor }
  }

  const host = { clientWidth: 300, clientHeight: 100, replaceChildren: () => {} }
  const boot = (h: ReturnType<typeof harness>, build: () => import('../core/view').View) =>
    mount(host as unknown as HTMLElement, h.backend as unknown as Parameters<typeof mount>[1], build)

  /* Two draggable objects side by side: a spans x 0..100, b spans 100..200. */
  {
    const h = harness()
    const ax = signal(0)
    const bx = signal(0)
    const starts: string[] = []
    const ends: string[] = []
    let fromA = 0
    let fromB = 0

    const mounted = boot(h, () =>
      HStack(
        { spacing: 0 },
        Rectangle()
          .fill('#111')
          .frame(100, null)
          .onDrag({
            onStart: (d) => {
              fromA = ax()
              starts.push(`a:${d.pointerType}`)
            },
            onMove: (d) => ax.set(fromA + d.tx),
            onEnd: () => ends.push('a'),
          }),
        Rectangle()
          .fill('#222')
          .frame(100, null)
          .onDrag({
            onStart: (d) => {
              fromB = bx()
              starts.push(`b:${d.pointerType}`)
            },
            onMove: (d) => bx.set(fromB + d.tx),
            onEnd: () => ends.push('b'),
          }),
        Rectangle().fill('#333').expand(),
      ),
    )

    h.fns.down(20, 50, 1, 'touch')
    h.fns.down(150, 50, 2, 'touch')
    check('a second finger starts its own gesture', starts, ['a:touch', 'b:touch'])
    check('both pointers are captured', [...h.captured], [1, 2])

    h.fns.move(60, 50, 1, 'touch')
    check('the first finger drives its own object', [ax(), bx()], [40, 0])

    h.fns.move(120, 50, 2, 'touch')
    check('the second finger drives the other', [ax(), bx()], [40, -30])

    h.fns.move(10, 50, 1, 'touch')
    check('neither gesture disturbs the other', [ax(), bx()], [-10, -30])

    h.fns.up(10, 50, 1, 'touch')
    check('releasing one frees only its pointer', [...h.captured], [2])
    check('and ends only its handler', ends, ['a'])

    h.fns.move(200, 50, 2, 'touch')
    check('the surviving gesture keeps going', bx(), 50)

    h.fns.move(300, 50, 1, 'touch')
    check('the released pointer no longer drives anything', ax(), -10)

    mounted.unmount()
    check('unmount releases the captures it still holds', [...h.captured], [])
  }

  /* Two fingers on the same view. Each gets its own gesture; what that means
     is the handler's decision, not the loop's. */
  {
    const h = harness()
    const totals: number[] = []
    const mounted = boot(h, () =>
      Rectangle()
        .fill('#111')
        .expand()
        .onDrag((d) => totals.push(d.tx)),
    )

    h.fns.down(10, 50, 1, 'touch')
    h.fns.down(200, 50, 2, 'touch')
    check('one view can hold two gestures at once', [...h.captured], [1, 2])

    h.fns.move(40, 50, 1, 'touch')
    h.fns.move(150, 50, 2, 'touch')
    check('each keeps its own origin', totals, [30, -50])

    mounted.unmount()
  }

  /* A cancel arrives as an up, so the gesture terminates either way. */
  {
    const h = harness()
    const log: string[] = []
    let moves = 0
    const mounted = boot(h, () =>
      Rectangle()
        .fill('#111')
        .expand()
        .onDrag({ onMove: () => moves++, onEnd: () => log.push('end') }),
    )

    h.fns.down(10, 50, 4, 'touch')
    h.fns.up(10, 50, 4, 'touch') // pointercancel is routed here by the backend
    check('a cancelled gesture ends', log, ['end'])
    check('and gives the pointer back', [...h.captured], [])

    h.fns.move(80, 50, 4, 'touch')
    check('moves after a cancel go nowhere', moves, 0)

    mounted.unmount()
  }

  /* One cursor, several pointers. Touch and pen never touch it; among mouse
     gestures the first to start holds it until it ends. */
  {
    const h = harness()
    const mounted = boot(h, () =>
      HStack(
        { spacing: 0 },
        Rectangle()
          .fill('#111')
          .frame(100, null)
          .onDrag(() => {}, 'grabbing'),
        Rectangle().fill('#222').expand().cursor('crosshair'),
      ),
    )

    h.fns.move(150, 50, 1, 'mouse')
    check('hover shows the region under the mouse', h.cursor(), 'crosshair')

    h.fns.down(20, 50, 2, 'touch')
    h.fns.move(60, 50, 2, 'touch')
    check('a touch gesture leaves the cursor where the mouse is', h.cursor(), 'crosshair')

    h.fns.up(60, 50, 2, 'touch')
    check('and releasing it changes nothing', h.cursor(), 'crosshair')

    h.fns.down(20, 50, 1, 'mouse')
    h.fns.move(250, 50, 1, 'mouse')
    check('a mouse gesture owns the cursor off its view', h.cursor(), 'grabbing')

    h.fns.down(150, 50, 3, 'touch')
    h.fns.move(160, 50, 3, 'touch')
    check('a finger cannot take it from a mouse drag', h.cursor(), 'grabbing')

    h.fns.up(250, 50, 1, 'mouse')
    check('release hands the cursor back to hover', h.cursor(), 'crosshair')

    mounted.unmount()
  }

  /* `pointerTypes` does not swallow the press it refuses: the scan carries on
     into whatever sits beneath. */
  {
    const h = harness()
    const log: string[] = []
    const mounted = boot(h, () =>
      Rectangle()
        .fill('#111')
        .expand()
        .onDrag({ onStart: () => log.push('under') })
        .overlay(
          Rectangle()
            .fill('transparent')
            .expand()
            .onDrag({ pointerTypes: ['touch'], onStart: () => log.push('touch only') }),
        ),
    )

    h.fns.down(50, 50, 1, 'touch')
    check('a touch press takes the touch-only surface', log, ['touch only'])
    h.fns.up(50, 50, 1, 'touch')

    h.fns.down(50, 50, 2, 'mouse')
    check('a mouse press falls through to the layer beneath', log, ['touch only', 'under'])
    h.fns.up(50, 50, 2, 'mouse')

    mounted.unmount()
  }
}

/* 16. Touch panning: a finger dragging the content scrolls it, a mouse does
       not, and the bars still win the press. */
{
  const { ScrollView } = await import('../views/scroll')
  const { signal } = await import('../core/signal')

  const rows = () => VStack({ spacing: 0 }, ...Array.from({ length: 10 }, () => Rectangle().frame(100, 20)))

  {
    const y = signal(0)
    const content = rows()
    const place = () => {
      const ctx = new Ctx()
      const v = ScrollView({ y }, content)
      v.measure({ w: 100, h: 100 }, ctx)
      v.place({ x: 0, y: 0, w: 100, h: 100 }, ctx)
      return ctx
    }

    const pan = place().hits[0]
    check('the pan hit is registered first, so children win the press', round(pan.rect), {
      x: 0,
      y: 0,
      w: 100,
      h: 100,
    })
    check('the pan accepts only touch and pen', pan.drag!.pointerTypes, ['touch', 'pen'])
    check('the pan contributes no cursor', pan.cursor === undefined, true)

    const drag = (ty: number) =>
      ({
      x: 0, y: ty, dx: 0, dy: ty, tx: 0, ty,
      startX: 0, startY: 0, vx: 0, vy: 0, pointerType: 'touch',
    }) as const

    // Content is 200 tall in a 100 viewport, so the offset runs 0..100.
    pan.drag!.onStart!(drag(0))
    pan.drag!.onMove!(drag(-30))
    check('dragging up moves the content up, 1:1', y(), 30)

    pan.drag!.onMove!(drag(-999))
    check('the pan clamps at the end', y(), 100)

    pan.drag!.onMove!(drag(999))
    check('the pan clamps at the top', y(), 0)

    // A fresh gesture snapshots the offset again rather than replaying.
    y.set(40)
    const next = place().hits[0]
    next.drag!.onStart!(drag(0))
    next.drag!.onMove!(drag(25))
    check('dragging down moves the content down from where it was', y(), 15)
  }

  // The wheel's chaining rule, in the form a captured gesture can express: a
  // viewport with nothing to move registers no pan, so the press reaches an
  // enclosing one instead of being swallowed.
  {
    const ctx = new Ctx()
    const fits = ScrollView({ y: signal(0) }, Rectangle().frame(100, 50))
    fits.measure({ w: 100, h: 100 }, ctx)
    fits.place({ x: 0, y: 0, w: 100, h: 100 }, ctx)
    check('a viewport with nothing to scroll registers no pan', ctx.hits.length, 0)
  }

  /* Through the real loop: pointer type decides, and the thumb still wins. */
  {
    const { mount } = await import('../core/mount')

    type Pointer = (x: number, y: number, id: number, type?: string) => void
    let down: Pointer = () => {}
    let move: Pointer = () => {}
    let up: Pointer = () => {}

    const backend = {
      el: {},
      resize: () => {},
      draw: () => {},
      onPointerDown: (cb: Pointer) => {
        down = cb
      },
      onPointerMove: (cb: Pointer) => {
        move = cb
      },
      onPointerUp: (cb: Pointer) => {
        up = cb
      },
      capturePointer: () => {},
      releasePointer: () => {},
      onWheel: () => {},
      setCursor: () => {},
      destroy: () => {},
    }
    const host = { clientWidth: 100, clientHeight: 100, replaceChildren: () => {} }

    const y = signal(0)
    const content = rows()
    const mounted = mount(
      host as unknown as HTMLElement,
      backend as unknown as Parameters<typeof mount>[1],
      () => ScrollView({ y }, content),
    )

    down(50, 50, 1, 'mouse')
    move(50, 20, 1, 'mouse')
    check('a mouse drag over the content does not pan', y(), 0)
    up(50, 20, 1, 'mouse')

    down(50, 50, 2, 'touch')
    move(50, 20, 2, 'touch')
    check('a finger dragging the content pans it', y(), 30)
    up(50, 20, 2, 'touch')

    // The thumb is placed after the pan hit, so it wins the back-to-front
    // scan: x 86..104, and at offset 30 it spans y 15..65.
    down(93, 40, 3, 'touch')
    move(93, 50, 3, 'touch')
    check('a finger on the thumb drags the thumb, not the content', y(), 50)
    up(93, 50, 3, 'touch')

    mounted.unmount()
  }
}

/* 17. Animation. The clock is injected, so these step it by hand rather than
       waiting on real frames — which is the whole reason it is injected. */
{
  const {
    advanceAnimations,
    animated,
    easeIn,
    easeInOut,
    easeOut,
    linear,
    mixColor,
    spring,
    tween,
  } = await import('../core/animation')
  const { track } = await import('../core/signal')

  const approx = (v: number, places = 4): number => {
    const f = 10 ** places
    return Math.round(v * f) / f
  }

  /**
   * One frame of fake time. Shares the harness clock with `requestAnimation-
   * Frame`, so that once `mount` advances the driver itself the two agree and
   * the same moment is never stepped twice. `flushFrame` covers that case too:
   * a mount that asked for another frame from inside one gets it here.
   */
  const tick = (ms = 16): boolean => {
    const running = advanceAnimations(advanceClock(ms))
    flushFrame()
    return running
  }

  /* Easings. */
  check('linear is the identity', [linear(0), linear(0.5), linear(1)], [0, 0.5, 1])
  check('every easing pins both ends', [easeIn(0), easeIn(1), easeOut(0), easeOut(1)], [0, 1, 0, 1])
  check('ease-in starts slow', easeIn(0.5) < 0.5, true)
  check('ease-out starts fast', easeOut(0.5) > 0.5, true)
  check('ease-in-out is symmetric about the midpoint', approx(easeInOut(0.5)), 0.5)

  /* An idle driver reports nothing in flight and does not throw. */
  check('an idle driver reports no animations', tick(), false)

  /* A tween walks its curve, lands exactly, and reports completion. */
  {
    const a = animated(0, tween({ duration: 100, easing: linear }))
    check('a fresh value reads its initial', a(), 0)
    check('a fresh value is not animating', a.animating(), false)

    a.set(100)
    check('setting a target does not jump', a(), 0)
    check('the target is readable before the value gets there', a.target(), 100)
    check('setting a target puts it in flight', a.animating(), true)

    check('the driver reports work in progress', tick(20), true)
    check('a linear tween is 20% in after 20ms of 100', approx(a()), 20)
    tick(30)
    check('and halfway again at 50ms', approx(a()), 50)

    // Overshooting the duration clamps rather than extrapolating.
    check('the last step reports completion', tick(60), false)
    check('a finished tween sits exactly on its target', a(), 100)
    check('a finished tween stops animating', a.animating(), false)

    // Nothing left in the registry, so further ticks are free and idempotent.
    tick(100)
    check('a settled value stays put', a(), 100)
  }

  /* Retargeting mid-flight is continuous in value. */
  {
    const a = animated(0, tween({ duration: 200, easing: easeInOut }))
    a.set(100)
    tick(60)
    const before = a()
    a.set(-50)
    check('a retarget leaves the value where it was', a(), before)
    check('a retarget updates the target', a.target(), -50)
    // The tween re-runs its curve from here, so the next step moves the other
    // way rather than continuing toward the abandoned target.
    tick(16)
    check('a retarget reverses direction', a() < before, true)
    a.settle()
    check('settling a tween lands on the live target', a(), -50)
  }

  /* A spring carries its velocity across a retarget — the whole point. */
  {
    const a = animated(0, spring({ response: 300, damping: 1 }))
    a.set(200)
    tick(16)
    tick(16)
    const value = a()
    const velocity = a.velocity()
    check('a spring is moving after two frames', velocity > 0, true)

    a.set(400)
    check('a retargeted spring keeps its value', a(), value)
    check('a retargeted spring keeps its velocity', a.velocity(), velocity)
    check('the new target is live', a.target(), 400)

    // And it is still continuous one step later: no discontinuity in speed,
    // which a restart would produce.
    const stepped = a()
    tick(16)
    check('it carries on in the same direction', a() > stepped, true)
    // Left running, it would keep the driver busy for the blocks below.
    a.settle()
  }

  /* Critical damping converges without overshooting; below 1 it overshoots. */
  {
    const a = animated(0, spring({ response: 200, damping: 1 }))
    a.set(100)
    let peak = 0
    let frames = 0
    while (tick() && frames < 600) {
      peak = Math.max(peak, a())
      frames++
    }
    check('a critically damped spring never overshoots', peak <= 100, true)
    check('it comes to rest exactly on the target', a(), 100)
    check('and reports itself at rest', a.animating(), false)
    check('within a plausible number of frames', frames > 5 && frames < 100, true)

    const b = animated(0, spring({ response: 200, damping: 0.4 }))
    b.set(100)
    let over = false
    let n = 0
    while (tick() && n < 600) {
      if (b() > 100) over = true
      n++
    }
    check('an underdamped spring overshoots', over, true)
    check('and still lands on the target', b(), 100)

    // The third closed form. Above 1 the two exponentials are real and the
    // slow one dominates, so the same move takes noticeably longer.
    const c = animated(0, spring({ response: 200, damping: 2 }))
    c.set(100)
    let slow = 0
    while (tick() && slow < 900) slow++
    check('an overdamped spring lands on the target', c(), 100)
    check('and takes longer than the critically damped one', slow > frames, true)
  }

  /* Velocity can be injected — this is what a fling would hand over. */
  {
    const a = animated(0, spring({ response: 300, damping: 1 }))
    a.set(0, -400)
    check('a kick with no change of target still animates', a.animating(), true)
    check('the injected velocity is visible immediately', a.velocity(), -400)
    tick(16)
    check('it travels away from the target first', a() < 0, true)
    let n = 0
    while (tick() && n < 600) n++
    check('and comes back to rest on it', a(), 0)
  }

  /* Settling is instant, at rest, and skips the rest of the curve. */
  {
    const a = animated(0, spring())
    a.set(500)
    tick(16)
    check('mid-flight the value is short of the target', a() < 500, true)
    a.settle()
    check('settle lands immediately', a(), 500)
    check('settle stops the animation', a.animating(), false)
    check('settle leaves no velocity', a.velocity(), 0)
    check('the driver has nothing left to advance', tick(), false)

    a.settle(-20)
    check('settle can name its own value', a(), -20)
    check('and it becomes the target', a.target(), -20)
  }

  /* Reads register dependencies, and the value and the phase are separate
     signals so a target readout is not rebuilt sixty times a second. */
  {
    const a = animated(0, spring())
    check('reading the value registers a dependency', track(() => a()).reads.size, 1)
    check('reading animating() registers a dependency', track(() => a.animating()).reads.size, 1)
    const valueDep = [...track(() => a()).reads][0][0]
    const phaseDep = [...track(() => a.target()).reads][0][0]
    check('the value and the phase are different signals', valueDep !== phaseDep, true)
  }

  /* Independent animations share one driver. */
  {
    const quick = animated(0, tween({ duration: 40, easing: linear }))
    const slow = animated(0, tween({ duration: 400, easing: linear }))
    quick.set(10)
    slow.set(10)
    tick(50)
    check('the short tween has finished', quick.animating(), false)
    check('the long one has not', slow.animating(), true)
    check('the driver still reports work while one runs', tick(16), true)
    check('the finished one is untouched by further ticks', quick(), 10)
    slow.settle()
  }

  /* A stalled tab delivers one enormous frame; the step is capped so the
     animation lags rather than teleporting. */
  {
    const a = animated(0, tween({ duration: 1000, easing: linear }))
    a.set(1000)
    tick(5000)
    check('a huge frame gap advances by at most one capped step', approx(a()), 64)
    a.settle()
  }

  /* Colour mixing, the one non-numeric thing worth having. */
  check('mixColor at the midpoint', mixColor('#000000', '#ffffff', 0.5), '#808080')
  check('mixColor at zero returns the start', mixColor('#102030', '#ffffff', 0), '#102030')
  check('mixColor expands three-digit hex', mixColor('#000', '#fff', 1), '#ffffff')
  check('mixColor clamps out-of-range t', mixColor('#000', '#fff', 9), '#ffffff')
  check('mixColor falls back on unparseable input', mixColor('red', '#fff', 0.9), '#fff')

  /* The signal contract holds end to end: advancing the driver invalidates
     exactly the component that reads the animated value. */
  {
    const { mount } = await import('../core/mount')
    const { component } = await import('../core/component')

    let ops: { rect: { x: number } }[] = []
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

    const x = animated(0, tween({ duration: 100, easing: linear }))
    const mounted = mount(
      host as unknown as HTMLElement,
      backend as unknown as Parameters<typeof mount>[1],
      () =>
        VStack(
          { spacing: 0 },
          component('moving', () => Rectangle().fill('#111').frame(20, 20).offset(() => x(), 0)),
          component('still', () => Text('static')),
        ),
    )

    check('the first frame builds both components', mounted.stats().built, 2)
    check('the box starts unoffset', approx(ops[0].rect.x), 190)

    // Naming a target moves nothing yet, and nothing reads the target here.
    x.set(100)
    flushFrame()
    check('naming a target rebuilds nothing', mounted.stats().built, 0)
    check('both components replay from cache', mounted.stats().reusedPlace, 2)

    // Every tick writes the value, which notifies the mount; the harness makes
    // requestAnimationFrame synchronous, so the frame has already happened.
    tick(20)
    check('a tick rebuilds only the reader', mounted.stats().built, 1)
    check('the sibling stays cached', mounted.stats().reusedPlace, 1)
    check('the animated value advanced', approx(x()), 20)
    check('and the drawn box moved with it', approx(ops[0].rect.x), 210)

    x.settle()
    flushFrame()
    check('settling redraws at the target', approx(ops[0].rect.x), 290)
    mounted.unmount()
  }
}

/* 18. Fling: the release velocity `mount` measures, and the coast it drives. */
{
  const { mount } = await import('../core/mount')
  const { ScrollView } = await import('../views/scroll')
  const { advanceAnimations, animated, project, spring } = await import('../core/animation')
  const { signal } = await import('../core/signal')

  const tick = (ms = 16): boolean => {
    const running = advanceAnimations(advanceClock(ms))
    flushFrame()
    return running
  }

  /* Velocity is measured by the mount loop from the event timestamps, so this
     half has to go through it. */
  {
    type Pointer = (x: number, y: number, id: number, type: string, t: number) => void
    const fns = {
      down: (() => {}) as Pointer,
      move: (() => {}) as Pointer,
      up: (() => {}) as Pointer,
    }
    const backend = {
      el: {},
      resize: () => {},
      draw: () => {},
      onPointerDown: (cb: Pointer) => {
        fns.down = cb
      },
      onPointerMove: (cb: Pointer) => {
        fns.move = cb
      },
      onPointerUp: (cb: Pointer) => {
        fns.up = cb
      },
      capturePointer: () => {},
      releasePointer: () => {},
      onWheel: () => {},
      setCursor: () => {},
      destroy: () => {},
    }
    const host = { clientWidth: 200, clientHeight: 200, replaceChildren: () => {} }

    let released: { vx: number; vy: number } | null = null
    const mounted = mount(
      host as unknown as HTMLElement,
      backend as unknown as Parameters<typeof mount>[1],
      () =>
        Rectangle()
          .fill('#111')
          .expand()
          .onDrag({
            onEnd: (d) => {
              released = { vx: Math.round(d.vx), vy: Math.round(d.vy) }
            },
          }),
    )

    // 100px right and 50px down over 100ms is 1000 and 500 units per second.
    fns.down(10, 10, 1, 'mouse', 1000)
    fns.move(60, 35, 1, 'mouse', 1050)
    fns.up(110, 60, 1, 'mouse', 1100)
    check('release velocity is measured over the trailing window', released, {
      vx: 1000,
      vy: 500,
    })

    // The same flick, then held still for longer than the window before
    // letting go. Releasing from a standstill must not throw anything.
    fns.down(10, 10, 2, 'mouse', 2000)
    fns.move(110, 10, 2, 'mouse', 2100)
    fns.move(110, 10, 2, 'mouse', 2300)
    fns.up(110, 10, 2, 'mouse', 2400)
    check('a pause before release reports a standstill', released, { vx: 0, vy: 0 })

    // Only samples inside the window count, so a long slow drag reports the
    // speed it ended at, not its average.
    fns.down(10, 10, 3, 'mouse', 3000)
    fns.move(20, 10, 3, 'mouse', 3500)
    fns.move(120, 10, 3, 'mouse', 3550)
    fns.up(120, 10, 3, 'mouse', 3550)
    check('older samples fall out of the window', released, { vx: 2000, vy: 0 })

    mounted.unmount()
  }

  /* Projection: where a release coasts to. */
  {
    check('a standstill projects to where it already is', project(40, 0), 40)
    check('a faster flick lands further', project(0, 2000) > project(0, 1000), true)
    check('direction is preserved', project(0, -1000) < 0, true)
    // 1000 units/s is 1 unit/ms, and 0.998/(1 - 0.998) is 499 of them.
    check('projection matches the deceleration rate', Math.round(project(0, 1000)), 499)
  }

  /* The coast itself. A plain signal cannot fling — there is nothing to hand
     a velocity to — so the offset has to be an animated() for it to happen. */
  {
    const rows = VStack({ spacing: 0 }, ...Array.from({ length: 10 }, () => Rectangle().frame(100, 20)))
    // Content 200 tall in a 100 viewport, so the offset runs 0..100.
    const place = (axis: Parameters<typeof ScrollView>[0]) => {
      const ctx = new Ctx()
      const v = ScrollView(axis, rows)
      v.measure({ w: 100, h: 100 }, ctx)
      v.place({ x: 0, y: 0, w: 100, h: 100 }, ctx)
      return ctx
    }
    const panOf = (ctx: InstanceType<typeof Ctx>) =>
      ctx.hits.find((h) => h.drag?.pointerTypes)!.drag!
    const flick = (vy: number) => ({
      x: 0, y: 0, dx: 0, dy: 0, tx: 0, ty: 0,
      startX: 0, startY: 0, vx: 0, vy, pointerType: 'touch' as const,
    })

    const plain = signal(0)
    panOf(place({ y: plain })).onEnd!(flick(-800))
    check('a plain signal does not fling', plain(), 0)

    // Dragging up (negative vy) scrolls down, so the offset goes positive.
    const y = animated(0, spring({ response: 200, damping: 1 }))
    panOf(place({ y })).onEnd!(flick(-800))
    check('an animated offset flings', y.animating(), true)
    check('it heads where the flick projects, clamped to the content', y.target(), 100)

    let frames = 0
    while (tick() && frames < 400) frames++
    check('the fling comes to rest', y.animating(), false)
    check('and lands on the end of the content', Math.round(y()), 100)
    check('the driver stopped rather than spinning', frames < 400, true)

    // Too slow to be a flick: letting go leaves the content exactly there.
    y.settle(40)
    panOf(place({ y })).onEnd!(flick(-30))
    check('a slow release does not fling', [y.animating(), y()], [false, 40])

    // A press during a coast stops it where the content currently is.
    panOf(place({ y })).onEnd!(flick(-800))
    tick()
    tick()
    const caught = y()
    check('the coast is under way', y.animating() && caught > 40, true)
    panOf(place({ y })).onStart!(flick(0))
    check('pressing stops the fling dead', y.animating(), false)
    check('and leaves the content where it was caught', y(), caught)
  }
}

/* 19. Rubber-banding: past an end the content follows a shrinking fraction of
       the finger, and a release springs it back. */
{
  const { ScrollView } = await import('../views/scroll')
  const { advanceAnimations, animated, spring } = await import('../core/animation')
  const { signal } = await import('../core/signal')

  const tick = (ms = 16): boolean => {
    const running = advanceAnimations(advanceClock(ms))
    flushFrame()
    return running
  }

  // Content 200 tall in a 100 viewport: the offset runs 0..100.
  const rows = VStack({ spacing: 0 }, ...Array.from({ length: 10 }, () => Rectangle().frame(100, 20)))
  const place = (axis: Parameters<typeof ScrollView>[0]) => {
    const ctx = new Ctx()
    const v = ScrollView(axis, rows)
    v.measure({ w: 100, h: 100 }, ctx)
    v.place({ x: 0, y: 0, w: 100, h: 100 }, ctx)
    return ctx
  }
  const panOf = (ctx: InstanceType<typeof Ctx>) =>
    ctx.hits.find((h) => h.drag?.pointerTypes)!.drag!
  const at = (ty: number, vy = 0) => {
    return {
      x: 0, y: ty, dx: 0, dy: ty, tx: 0, ty,
      startX: 0, startY: 0, vx: 0, vy, pointerType: 'touch' as const,
    }
  }

  /* A plain signal has nowhere to spring back to, so it still stops dead. */
  {
    const y = signal(0)
    const pan = panOf(place({ y }))
    pan.onStart!(at(0))
    pan.onMove!(at(60))
    check('a plain signal stops at the end', y(), 0)
  }

  /* An animated one bands. */
  {
    const y = animated(0, spring({ response: 200, damping: 1 }))
    const pan = panOf(place({ y }))

    pan.onStart!(at(0))
    // Dragging down past the top: the offset would be -60 unbanded.
    pan.onMove!(at(60))
    const banded = y()
    check('past the end the offset goes out of range', banded < 0, true)
    check('but by less than the finger moved', banded > -60, true)

    // Twice the pull is well under twice the give.
    pan.onMove!(at(120))
    check('the band stiffens as it stretches', y() > banded * 2, true)

    // Whatever it is pulled by, it can never clear the viewport.
    pan.onMove!(at(100000))
    check('displacement is bounded by the viewport', y() > -100 / 0.55, true)

    pan.onEnd!(at(100000))
    check('releasing springs it back', y.animating(), true)
    check('and it heads for the end it left', y.target(), 0)

    let frames = 0
    while (tick() && frames < 400) frames++
    check('the bounce comes to rest', [y.animating(), y()], [false, 0])
  }

  /* A release out of range leaves at the speed the content was visibly moving
     at, which past an end is a fraction of the finger's. Handing the spring
     the finger's own velocity throws the band far past anywhere it ever let
     the content go, and the long trip back from there is what reads as an
     overshooting, sluggish bounce. */
  {
    const y = animated(0, spring({ response: 200, damping: 1 }))
    const pan = panOf(place({ y }))
    pan.onStart!(at(0))
    pan.onMove!(at(60))
    const stretched = y()

    // Still travelling hard outwards at the moment of release.
    pan.onEnd!(at(60, 900))
    let peak = stretched
    let frames = 0
    while (tick() && frames < 400) {
      peak = Math.min(peak, y())
      frames++
    }
    check('a fast release barely stretches the band further', peak > stretched * 1.25, true)
    check('and still comes home', [y.animating(), Math.round(y())], [false, 0])
  }

  /* Grabbing mid-bounce must not jump: the drag resumes from the raw distance
     the visible offset stands for, not from the resisted one. */
  {
    const y = animated(0, spring({ response: 200, damping: 1 }))
    const pan = panOf(place({ y }))
    pan.onStart!(at(0))
    pan.onMove!(at(80))
    const stretched = y()

    // Press again without moving. `mount` holds one Hit for a whole gesture,
    // so onStart and onMove run on the same closure here too.
    const regrab = panOf(place({ y }))
    regrab.onStart!(at(0))
    check('a press mid-band does not move the content', y(), stretched)
    regrab.onMove!(at(0))
    check('and neither does a zero-distance move', Math.round(y()), Math.round(stretched))
  }

  /* The thumb stays on its track while the band is stretched. */
  {
    const y = animated(0, spring({ response: 200, damping: 1 }))
    const track = place({ y }).ops.filter((o) => o.t === 'rect')
    const restingThumb = track[track.length - 1].rect.y

    panOf(place({ y })).onStart!(at(0))
    panOf(place({ y })).onMove!(at(80))
    const bandedOps = place({ y }).ops.filter((o) => o.t === 'rect')
    const bandedThumb = bandedOps[bandedOps.length - 1].rect
    check('the content moved out of range', y() < 0, true)
    check('the thumb stayed at the top of its track', bandedThumb.y, restingThumb)
    check('and inside the viewport', bandedThumb.y >= 0, true)
  }
}

/* 20. The wheel bands too. A trackpad is how most people meet a scroll view,
       and it has no release event to hang a bounce off — only a gap. */
{
  const { ScrollView } = await import('../views/scroll')
  const { advanceAnimations, animated, spring } = await import('../core/animation')
  const { signal } = await import('../core/signal')

  const tick = (ms = 16): boolean => {
    const running = advanceAnimations(advanceClock(ms))
    flushFrame()
    return running
  }
  /** Real time, because the bounce is scheduled on a real timer. */
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
  /** Longer than the band holds after a delta that looked like a hand. */
  const idle = () => pause(240)

  const rows = VStack({ spacing: 0 }, ...Array.from({ length: 10 }, () => Rectangle().frame(100, 20)))
  const regionFor = (axis: Parameters<typeof ScrollView>[0], child = rows) => {
    const ctx = new Ctx()
    const v = ScrollView(axis, child)
    v.measure({ w: 100, h: 100 }, ctx)
    v.place({ x: 0, y: 0, w: 100, h: 100 }, ctx)
    return ctx.scrolls[0]
  }

  /* A plain axis clamps and chains, exactly as before. */
  {
    const y = signal(0)
    check('a plain axis does not band past the top', regionFor({ y }).scroll(0, -50), false)
    check('and stays put', y(), 0)
  }

  /* In range, a wheel lands 1:1 and instantly — the spring is for coasting
     and bouncing, never for tracking. */
  {
    const y = animated(0, spring({ response: 200, damping: 1 }))
    regionFor({ y }).scroll(0, 40)
    check('a wheel in range moves exactly its delta', y(), 40)
    check('with nothing left animating', y.animating(), false)
    regionFor({ y }).scroll(0, 25)
    check('and the next one accumulates on it', y(), 65)
  }

  /* An animated one bands and keeps the wheel. */
  {
    const y = animated(0, spring({ response: 200, damping: 1 }))
    check('an animated axis consumes a wheel past the top', regionFor({ y }).scroll(0, -50), true)
    check('and goes out of range', y() < 0, true)

    // Apple's curve, capped: it leaves the edge at 0.55 and runs out at 0.3 of
    // the viewport, which is 30 for this 100-tall one.
    check('the first push is resisted from the outset', y() > -50 * 0.55, true)
    const first = y()
    regionFor({ y }).scroll(0, -50)
    check('a second push accumulates onto the first', y() < first, true)
    check('but bands harder, so it adds less', y() > first * 2, true)

    // However hard it is pushed, the stretch stops well short of the content
    // sliding off the viewport.
    for (let i = 0; i < 50; i++) regionFor({ y }).scroll(0, -500)
    check('the stretch is capped at a fraction of the viewport', y() > -30, true)
    check('and gets close to that cap under a big push', y() < -29, true)

    // Let the band actually get there, so the bounce is a real journey back
    // rather than a retarget from a value that never left zero.
    let frames = 0
    while (tick() && frames < 400) frames++
    check('the content sits out of range', y() < 0, true)

    await idle()
    check('going quiet springs it back', y.target(), 0)
    frames = 0
    while (tick() && frames < 400) frames++
    check('and it arrives', [y.animating(), Math.round(y())], [false, 0])
  }

  /* Nothing to scroll still chains out, elastic or not. This is what stops an
     enclosing viewport from swallowing a wheel aimed at something inside it. */
  {
    const y = animated(0, spring())
    const short = Rectangle().frame(100, 40)
    check('an elastic axis with nothing to scroll chains out', regionFor({ y }, short).scroll(0, -50), false)
    check('and does not band', y.target(), 0)
    await idle()
    check('nor schedule a bounce', y.animating(), false)
  }

  /* Momentum must not postpone the return, and a hand must.

     A wheel has no release event, so the two are told apart by the only thing
     that separates them: momentum decays and a hand does not. Getting this
     wrong is not subtle — waiting out a trackpad's tail leaves the content
     stretched and motionless for seconds. */
  {
    const y = animated(0, spring({ response: 200, damping: 1 }))
    // A flick: one hard delta, then a tail decaying 6% a frame, fed for far
    // longer than the deadline.
    regionFor({ y }).scroll(0, -60)
    let d = -60
    for (let i = 0; i < 14; i++) {
      d *= 0.94
      regionFor({ y }).scroll(0, d)
      await pause(15)
    }
    check('a decaying tail does not postpone the return', y.target(), 0)
  }

  {
    const y = animated(0, spring({ response: 200, damping: 1 }))
    // A hand: the same delta over and over, for just as long.
    for (let i = 0; i < 10; i++) {
      regionFor({ y }).scroll(0, -60)
      await pause(20)
    }
    check('a steady push holds the band open', y.target() < 0, true)
    await idle()
    check('and it returns once that stops', y.target(), 0)
  }

  /* Flick to the end, then keep pushing gently to hold the stretch open. The
     small deltas are deliberate, and reading them against the flick that
     preceded them files every one of them as a tail: the band lets go while
     the fingers are still moving. Against the delta before it instead,
     gentle-but-steady is not decay. */
  {
    const y = animated(0, spring({ response: 200, damping: 1 }))
    regionFor({ y }).scroll(0, -60)
    for (let i = 0; i < 8; i++) {
      regionFor({ y }).scroll(0, -6)
      await pause(16)
    }
    check('a gentle push after a hard one still reads as a hand', y.target() < 0, true)
    await idle()
    check('and lets go once it stops', y.target(), 0)
  }

  /* The tail outlasts the trip home by a long way. What is left of it once the
     content has landed must not stretch the band all over again — that is a
     wobble, not a bounce. */
  {
    const y = animated(0, spring({ response: 120, damping: 1 }))
    regionFor({ y }).scroll(0, -60)
    let d = -60
    let landed = false
    let wobbled = false
    for (let i = 0; i < 40; i++) {
      d *= 0.94
      regionFor({ y }).scroll(0, d)
      await pause(15)
      tick(15)
      if (!landed) landed = y() === 0 && !y.animating()
      else if (y() < 0) wobbled = true
    }
    check('the content comes home while the tail is still running', landed, true)
    check('and the rest of the tail never stretches it again', wobbled, false)
  }

  /* Once the return is under way, the rest of the tail is dropped rather than
     allowed to stretch the band again — otherwise it fights the whole way. */
  {
    const y = animated(0, spring({ response: 600, damping: 1 }))
    regionFor({ y }).scroll(0, -60)
    await idle()
    check('the bounce is under way', y.animating() && y() < 0, true)

    const mid = y()
    check('outward momentum is still consumed', regionFor({ y }).scroll(0, -60), true)
    check('but moves nothing', y(), mid)

    // Inward is a real intention, and takes over immediately.
    regionFor({ y }).scroll(0, 30)
    check('an inward wheel takes the bounce over', y() > mid, true)
  }

  /* Scrolling back inside under its own steam leaves nothing to return to. */
  {
    const y = animated(0, spring({ response: 200, damping: 1 }))
    regionFor({ y }).scroll(0, -40)
    check('out of range', y() < 0, true)
    // Enough to come back inside, not so much that it bands off the far end.
    regionFor({ y }).scroll(0, 60)
    check('and back inside', y() > 0 && y() < 100, true)
    await idle()
    check('no bounce was left pending', y.animating(), false)
  }

  /* A press cancels a pending wheel bounce rather than letting it fire under
     the finger. */
  {
    const y = animated(0, spring({ response: 200, damping: 1 }))
    const ctx = new Ctx()
    const v = ScrollView({ y }, rows)
    v.measure({ w: 100, h: 100 }, ctx)
    v.place({ x: 0, y: 0, w: 100, h: 100 }, ctx)
    ctx.scrolls[0].scroll(0, -50)
    let frames = 0
    while (tick() && frames < 400) frames++
    const banded = y.target()

    ctx.hits.find((h) => h.drag?.pointerTypes)!.drag!.onStart!({
      x: 0, y: 0, dx: 0, dy: 0, tx: 0, ty: 0,
      startX: 0, startY: 0, vx: 0, vy: 0, pointerType: 'touch' as const,
    })
    await idle()
    check('a press cancels the pending bounce', y.target(), banded)
    check('and nothing is animating', y.animating(), false)
  }
}

/* 21. The native-scroll prototype lays out like any viewport with no DOM
       layer set, and a cached subtree replays its claims. */
{
  const { NativeScrollView } = await import('../views/native-scroll')
  const { signal } = await import('../core/signal')
  const { View } = await import('../core/view')
  const { ComponentCache, component } = await import('../core/component')

  const rows = VStack({ spacing: 0 }, ...Array.from({ length: 10 }, () => Rectangle().frame(100, 20)))

  /* Headless there is no layer and nothing DOM happens: the view is layout
     only, and greedy like ScrollView. */
  {
    const y = signal(60)
    const ctx = new Ctx()
    const v = NativeScrollView({ y }, rows)
    check('a native viewport fills what it is offered', v.measure({ w: 100, h: 100 }, ctx), {
      w: 100,
      h: 100,
    })
    v.place({ x: 0, y: 0, w: 100, h: 100 }, ctx)
    check('places its child offset by the signal', round(ctx.ops[0].rect), { x: 0, y: -60, w: 100, h: 20 })
    check('clipped to the viewport', ctx.ops[0].clip, { x: 0, y: 0, w: 100, h: 100 })
    check('and registers no wheel region of its own', ctx.scrolls.length, 0)
  }

  /* A DOM-backed view claims its element during place; on a cache hit the
     claim has to be replayed, or the element looks gone the very next frame. */
  {
    class Claimer extends View {
      measure(): { w: number; h: number } {
        return { w: 10, h: 10 }
      }
      place(_rect: { x: number; y: number; w: number; h: number }, ctx: InstanceType<typeof Ctx>): void {
        ctx.claim('token')
      }
    }

    const cache = new ComponentCache()
    const pass = (): InstanceType<typeof Ctx> => {
      const ctx = new Ctx(cache)
      cache.beginFrame()
      const v = component('claimer', () => new Claimer())
      v.measure({ w: 10, h: 10 }, ctx)
      v.place({ x: 0, y: 0, w: 10, h: 10 }, ctx)
      cache.sweep()
      return ctx
    }
    check('a claim registers on a fresh place', pass().claims, ['token'])
    check('and replays out of the cache', pass().claims, ['token'])
  }
}

/* 22. Block syntax: `Name { ... }` rewrites to the calls the JavaScript API
       accepts, and the gallery compiler takes either form. */
{
  const { dslToJs } = await import('../core/dsl')
  const { compileSource, compileView } = await import('../gallery/compile')

  const sizeOf = (source: string, viaDsl: boolean) => {
    const result = viaDsl ? compileSource(source) : compileView(source)
    if (!result.ok) throw new Error(`check setup does not compile: ${result.error}`)
    const ctx = new Ctx()
    const size = result.view.measure({ w: 480, h: 320 }, ctx)
    result.view.place({ x: 0, y: 0, w: 480, h: 320 }, ctx)
    return { w: Math.round(size.w), h: Math.round(size.h), ops: ctx.ops.length }
  }

  /* Options, nested blocks and chained modifiers. */
  const asJs = sizeOf(
    `VStack({ spacing: 6, align: 'leading' },
  Text('hi'),
  HStack({ spacing: 2 }, Text('a'), Text('b')),
).padding(10)`,
    false,
  )
  const asBlocks = sizeOf(
    `VStack {
  spacing: 6
  align: 'leading'
  Text('hi')
  HStack {
    spacing: 2
    Text('a')
    Text('b')
  }
}
  .padding(10)`,
    true,
  )
  check('block syntax lays out like the JavaScript it rewrites to', asBlocks, asJs)

  /* Statements at the top level; the last expression returns implicitly. */
  const withState = compileSource(`const n = signal(2)

VStack {
  Text('n=' + n())
}`)
  check('statements plus an implicit return compile', withState.ok, true)

  /* A head with arguments takes its children from the block. */
  const scrolled = compileSource(`ScrollView({ y: signal(0) }) {
  Text('content')
}`)
  check('a block can add children to call arguments', scrolled.ok, true)

  /* Plain JavaScript without blocks is passed through untouched. */
  const plain = dslToJs(`Text('hi')`)
  check('no blocks means no rewrite', [plain.blocksFound, plain.code], [0, `Text('hi')`])

  /* Malformed input comes back as a positioned message, never an exception. */
  const unclosed = compileSource('VStack {')
  check('an unclosed block is an error, not a crash', unclosed.ok, false)
  check(
    'and the error carries its line',
    !unclosed.ok && unclosed.error.includes('unclosed block') && unclosed.error.includes('line 1'),
    true,
  )

  const lateOption = compileSource(`VStack {
  Text('hi')
  spacing: 6
}`)
  check('an option after the children is rejected', lateOption.ok, false)

  const innerStatement = compileSource(`VStack {
  const x = 1
}`)
  check('a statement inside a block is rejected', innerStatement.ok, false)

  /* A JavaScript error in block-free source keeps its original message. */
  const brokenJs = compileSource('VStack(')
  check('plain JavaScript errors are not rewritten', brokenJs.ok, false)
}

/* 23. Every example can be viewed as blocks: `jsToBlocks` rewrites it, and
       the rewrite compiles to exactly the view the JavaScript describes. */
{
  const { jsToBlocks, dslToJs } = await import('../core/dsl')
  const { compileSource, compileView } = await import('../gallery/compile')
  const { examples } = await import('../examples')

  const fingerprint = (result: ReturnType<typeof compileView>): string => {
    if (!result.ok) throw new Error(`check setup does not compile: ${result.error}`)
    const ctx = new Ctx()
    const size = result.view.measure({ w: 600, h: 400 }, ctx)
    result.view.place({ x: 0, y: 0, w: 600, h: 400 }, ctx)
    return JSON.stringify({ size, ops: ctx.ops }, (_k, v) =>
      typeof v === 'function' ? '[fn]' : v,
    )
  }

  for (const example of examples) {
    const asWritten = fingerprint(compileSource(example.code))
    const asBlocks = fingerprint(compileSource(jsToBlocks(example.code)))
    check(`example "${example.id}" lays out the same as blocks`, asBlocks, asWritten)
  }

  /* And a trip there and back lands on JavaScript that still compiles. */
  const roundTrip = dslToJs(jsToBlocks(examples[0].code))
  check('blocks survive a round trip back to JavaScript', compileView(roundTrip.code).ok, true)
}

/* 24. Four bugs that the checks above did not catch, and the guards that
       keep them fixed. */
{
  const { ComponentCache, component } = await import('../core/component')
  const { VStack, HStack } = await import('../views/stack')
  const { Spacer } = await import('../views/spacer')
  const { textWidth, textCacheSize } = await import('../core/text-measure')

  /* A cached subtree carries the clip its ops were recorded under, so the
     ambient clip has to be part of the key that decides whether to replay. */
  {
    // The child rect is identical either way — only the clip around it moves.
    const pass = (cache: InstanceType<typeof ComponentCache>, clipped: boolean) => {
      cache.beginFrame()
      const ctx = new Ctx(cache)
      const inner = component('c', () => Rectangle().fill('#f00').frame(200, 200))
      const root = clipped ? inner.frame(100, 100).clip() : inner.frame(100, 100)
      root.measure({ w: 100, h: 100 }, ctx)
      root.place({ x: 0, y: 0, w: 100, h: 100 }, ctx)
      cache.sweep()
      return ctx
    }

    const losing = new ComponentCache()
    pass(losing, true)
    check('losing a clip drops it from the replayed ops', pass(losing, false).ops[0].clip, undefined)

    const gaining = new ComponentCache()
    pass(gaining, false)
    // Read defensively: with the bug present there is no clip to round, and a
    // check that throws takes the rest of the suite down with it instead of
    // reporting one failure.
    const gained = pass(gaining, true).ops[0].clip
    check('gaining a clip stamps it on the replayed ops', gained ? round(gained) : null, {
      x: 0,
      y: 0,
      w: 100,
      h: 100,
    })

    // And the cache still does its job when nothing about the clip changed.
    const stable = new ComponentCache()
    pass(stable, true)
    pass(stable, true)
    check('an unchanged clip still replays from cache', stable.stats.reusedPlace, 1)
  }

  /* Measuring is memoised per pass, so nested stacks re-asking the same
     question cost nothing. Without it this grows exponentially with depth. */
  {
    const measuresAtDepth = (depth: number): number => {
      let reads = 0
      let v = Text(() => {
        reads++
        return 'label'
      })
      for (let i = 0; i < depth; i++) {
        v = i % 2 === 0 ? HStack({ spacing: 4 }, v, Spacer()) : VStack({ spacing: 4 }, v, Spacer())
      }
      const ctx = new Ctx()
      v.measure({ w: 300, h: 200 }, ctx)
      v.place({ x: 0, y: 0, w: 300, h: 200 }, ctx)
      return reads
    }

    const shallow = measuresAtDepth(3)
    const deep = measuresAtDepth(7)
    // Four more levels of nesting used to mean 27 → 724.
    check('a deep tree measures its leaf a linear number of times', deep < 40, true)
    check('and only a little more often than a shallow one', deep < shallow * 4, true)
  }

  /* The measurement cache is bounded: a counter or a clock produces a fresh
     string every frame, and every one of them used to be kept forever. */
  {
    const font = { size: 14, weight: 400, family: 'probe-only' }
    const before = textCacheSize()
    for (let i = 0; i < 30_000; i++) textWidth(`tick ${i}`, font)
    check('the text cache stays bounded', textCacheSize() < 25_000, true)
    check('and still measures correctly after a drop', textWidth('tick 1', font), 'tick 1'.length * 14 * 0.5)
    check('the probe reported a real cache', before >= 0, true)
  }

  /* `mount` resizes the backend every frame. Assigning `canvas.width` resets
     the bitmap and the whole 2D context state even when the value has not
     changed, so a still layout used to reallocate sixty times a second. */
  {
    const { createCanvasBackend } = await import('../render/canvas')
    const backend = createCanvasBackend()
    const canvas = backend.el as unknown as { writes: number }

    backend.resize(300, 200)
    check('the first resize sizes the bitmap', canvas.writes, 1)
    backend.resize(300, 200)
    check('resizing to the same size does not reallocate it', canvas.writes, 1)
    backend.resize(320, 200)
    check('a real size change does', canvas.writes, 2)
  }
}

console.log(failures === 0 ? '\nall layout checks passed' : `\n${failures} check(s) failed`)
if (failures > 0) process.exitCode = 1
