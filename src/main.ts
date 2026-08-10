import {
  Circle,
  HStack,
  Rectangle,
  RoundedRect,
  ScrollView,
  Spacer,
  Text,
  VStack,
  clamp,
  component,
  createCanvasBackend,
  createDomBackend,
  dslToJs,
  jsToBlocks,
  mount,
  setNativeScrollLayer,
  signal,
} from './index'
import type { View } from './core/view'
import type { Mounted } from './core/mount'
import { examples, type Example } from './examples'
import { compileSource, type Compiled } from './gallery/compile'
import { createEditor } from './gallery/editor'

/* ------------------------------------------------------------------ state */

const current = signal(0)
/** Bumped on every recompile so the preview panel invalidates. */
const revision = signal(0)
const navScroll = signal(0)
const previewScroll = signal(0)
const sidebarWidth = signal(210)

const SIDEBAR_MIN = 150
const SIDEBAR_MAX = 360

/** Edited source per example id, in the style it was edited in. Absent means
    "still the original". */
type CodeStyle = 'js' | 'blocks'
const codeStyle = signal<CodeStyle>('js')
const edits = new Map<string, { style: CodeStyle; source: string }>()
const results = new Map<string, Compiled>()

/** The example's own code, in the style the editor is showing. */
const pristineOf = (example: Example): string =>
  codeStyle() === 'blocks' ? jsToBlocks(example.code) : example.code

const convert = (source: string, to: CodeStyle): string | null => {
  try {
    return to === 'blocks' ? jsToBlocks(source) : dslToJs(source).code
  } catch {
    return null // broken block syntax can't be shown as JavaScript
  }
}

const sourceOf = (example: Example): string => {
  const edit = edits.get(example.id)
  if (!edit) return pristineOf(example)
  if (edit.style === codeStyle()) return edit.source
  return convert(edit.source, codeStyle()) ?? edit.source
}
const isEdited = (example: Example): boolean => edits.has(example.id)

function recompile(example: Example): void {
  results.set(example.id, compileSource(sourceOf(example)))
  revision.set((n) => n + 1)
}

function resultFor(example: Example): Compiled {
  let result = results.get(example.id)
  if (!result) {
    result = compileSource(sourceOf(example))
    results.set(example.id, result)
  }
  return result
}

/* ------------------------------------------------------------- gallery ui */

// The gallery is built with the toolkit. Every panel is a component, so typing
// in the editor rebuilds the preview and leaves the rest cached.

const header = (): View =>
  component('header', () =>
    HStack(
      { spacing: 10, align: 'center' },
      Circle().fill('#22c55e').frame(9, 9),
      Text('canvasUI').font({ size: 15, weight: 700 }).foreground('#fafafa'),
      Text('examples').font({ size: 12 }).foreground('#71717a'),
      Spacer(),
      Text('declarative layout → draw ops → canvas')
        .font({ size: 12 })
        .foreground('#52525b'),
    )
      .padding({ t: 10, b: 10, l: 16, r: 16 })
      .background(Rectangle().fill('#111114')),
  )

const navRow = (example: Example, i: number): View =>
  component(`nav:${i}`, () =>
    HStack(
      { spacing: 9, align: 'center' },
      RoundedRect(2)
        .fill(current() === i ? '#22c55e' : '#3f3f46')
        .frame(6, 6),
      Text(example.title)
        .font({ size: 13, weight: current() === i ? 600 : 400 })
        .foreground(current() === i ? '#fafafa' : '#a1a1aa'),
      Spacer(),
    )
      .padding({ t: 7, b: 7, l: 9, r: 9 })
      .background(RoundedRect(7).fill(current() === i ? '#27272a' : 'transparent'))
      .onTap(() => selectExample(i)),
  )

const sidebar = (): View =>
  component('sidebar', () =>
    VStack(
      { spacing: 2, align: 'leading' },
      Text('EXAMPLES')
        .font({ size: 10, weight: 700 })
        .foreground('#52525b')
        .padding({ l: 9, b: 6 }),
      ScrollView({ y: navScroll }, VStack({ spacing: 2, align: 'leading' }, ...examples.map(navRow))),
    )
      .padding(10)
      .frame(sidebarWidth(), null)
      .background(Rectangle().fill('#151518')),
  )

/** A 7px grab strip drawn as a 1px rule; dragging it resizes the sidebar. */
const divider = (): View => {
  let from = 0
  return Rectangle()
    .fill('#232327')
    .frame(1, null)
    .padding({ l: 3, r: 3 })
    .onDrag(
      {
        onStart: () => {
          from = sidebarWidth()
        },
        onMove: (d) => sidebarWidth.set(clamp(from + d.tx, SIDEBAR_MIN, SIDEBAR_MAX)),
      },
      'col-resize',
    )
}

const panelLabel = (text: string): View =>
  Text(text).font({ size: 10, weight: 700 }).foreground('#52525b')

const resetButton = (example: Example): View =>
  Text('reset')
    .font({ size: 10, weight: 700 })
    .foreground('#a1a1aa')
    .padding({ t: 3, b: 3, l: 7, r: 7 })
    .background(RoundedRect(5).fill('#27272a'))
    .onTap(() => resetExample(example))

/* The editor speaks plain JavaScript and block syntax; this flips the view
   of the current source between the two. */
const styleOption = (label: string, style: CodeStyle): View =>
  Text(label)
    .font({ size: 10, weight: 700 })
    .foreground(codeStyle() === style ? '#fafafa' : '#71717a')
    .padding({ t: 3, b: 3, l: 7, r: 7 })
    .background(RoundedRect(5).fill(codeStyle() === style ? '#3f3f46' : 'transparent'))
    .onTap(() => setStyle(style))

const styleToggle = (): View =>
  HStack({ spacing: 2 }, styleOption('js', 'js'), styleOption('{ }', 'blocks'))
    .padding(2)
    .background(RoundedRect(7).fill('#27272a'))

// The panel draws its frame and label; the textarea overlaying the reported
// rect draws the text. Editing needs a caret, selection and IME — none of
// which the toolkit has.
const codePanel = (example: Example): View =>
  component(`code:${example.id}`, () => {
    revision() // the edited/pristine label and the reset button follow edits
    codeStyle() // and the toggle follows the style
    return VStack(
      { spacing: 10, align: 'leading' },
      HStack(
        { spacing: 8, align: 'center' },
        panelLabel(isEdited(example) ? 'CODE — EDITED' : 'CODE'),
        Spacer(),
        styleToggle(),
        ...(isEdited(example) ? [resetButton(example)] : []),
      ).expand('h'),
      Rectangle().fill('transparent').expand().onLayout((rect) => editor.setRect(rect)),
    )
      .padding(16)
      .expand('v')
      .frame(430, null)
      .background(RoundedRect(10).fill('#101013'))
  })

const errorPanel = (message: string): View =>
  VStack(
    { spacing: 6, align: 'leading' },
    Text('THIS CODE DOES NOT RUN').font({ size: 10, weight: 700 }).foreground('#f87171'),
    Text(message).font({ size: 12 }).foreground('#fca5a5'),
  )
    .padding(14)
    .expand('h')
    .background(RoundedRect(8).fill('#2a1215'))

const previewPanel = (example: Example): View =>
  component(`preview:${example.id}`, () => {
    revision() // recompiling this example re-renders the panel
    const result = resultFor(example)
    return VStack(
      { spacing: 14, align: 'leading' },
      panelLabel('RENDERS AS'),
      // The example may be taller than the panel; the viewport clips it.
      ScrollView(
        { y: previewScroll },
        result.ok ? result.view : errorPanel(result.error),
      ),
    )
      .padding(18)
      .expand()
      .background(RoundedRect(10).fill('#0e0e11'))
  })

const content = (): View =>
  component('content', () => {
    const example = examples[current()]
    return VStack(
      { spacing: 6, align: 'leading' },
      Text(example.title).font({ size: 22, weight: 700 }).foreground('#fafafa'),
      Text(example.blurb).font({ size: 13 }).foreground('#a1a1aa').padding({ b: 8 }),
      HStack({ spacing: 14 }, codePanel(example), previewPanel(example)).expand('v'),
    )
      .padding(22)
      .expand()
  })

const app = (): View =>
  VStack(
    { spacing: 0 },
    header(),
    HStack({ spacing: 0 }, sidebar(), divider(), content()).expand('v'),
  )
    .background(Rectangle().fill('#0b0b0e'))

/* ---------------------------------------------------------------- actions */

function selectExample(i: number): void {
  current.set(i)
  previewScroll.set(0)
  editor.setSource(sourceOf(examples[i]))
}

function resetExample(example: Example): void {
  edits.delete(example.id)
  editor.setSource(pristineOf(example))
  recompile(example)
}

/* Re-views the current source in the other style. Edits carry over — the
   toggle converts whatever is in the editor, not the pristine example. */
function setStyle(next: CodeStyle): void {
  if (codeStyle() === next) return
  const example = examples[current()]
  const converted = convert(editor.value(), next)
  if (converted === null) return
  codeStyle.set(next)
  if (converted === pristineOf(example)) edits.delete(example.id)
  else edits.set(example.id, { style: next, source: converted })
  recompile(example)
  editor.setSource(converted)
}

function onEdit(source: string): void {
  const example = examples[current()]
  if (source === pristineOf(example)) edits.delete(example.id)
  else edits.set(example.id, { style: codeStyle(), source })
  recompile(example)
}

/* ------------------------------------------------------------------ mount */

const host = document.getElementById('canvas-host') as HTMLElement
const overlay = document.getElementById('overlay') as HTMLElement
const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-backend]'))

const editor = createEditor(overlay, onEdit)
// The native-scroll prototype's hidden scrollers live in the same overlay as
// the editor: exactly over the canvas, inert to the pointer themselves.
setNativeScrollLayer(overlay)

let mounted: Mounted | null = null

function use(mode: string): void {
  mounted?.unmount()
  const backend = mode === 'dom' ? createDomBackend(true) : createCanvasBackend()
  mounted = mount(host, backend, app)
  for (const b of buttons) b.classList.toggle('on', b.dataset.backend === mode)
}

for (const b of buttons) b.addEventListener('click', () => use(b.dataset.backend!))

// Exposed so the cache can be inspected from the console or a headless check.
// `history` matters more than `stats`: an idle or resize frame can land after
// the one that did the work.
Object.defineProperty(window, 'canvasUIStats', { get: () => mounted?.stats() })
Object.defineProperty(window, 'canvasUIHistory', { get: () => mounted?.history() })

// `?backend=dom` picks the debug renderer; `?example=<id>` deep-links one.
const params = new URLSearchParams(location.search)
const wanted = examples.findIndex((e) => e.id === params.get('example'))
if (wanted >= 0) current.set(wanted)

editor.setSource(sourceOf(examples[current()]))
use(params.get('backend') ?? 'canvas')
