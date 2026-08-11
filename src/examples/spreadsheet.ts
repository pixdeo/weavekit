import type { Example } from './types'

export const spreadsheet: Example = {
  id: 'spreadsheet',
  title: 'Spreadsheet',
  section: 'APPS',
  blurb:
    'An infinite sheet that fills the panel edge to edge. Scroll any direction — ' +
    'only the cells in view are drawn, so a 500 by 500 sheet costs no more than ' +
    'a small one. The row and column headers stay pinned while the sheet moves ' +
    'under them. Tap a cell to select it, type to enter, Enter moves down, ' +
    'Backspace clears. The formula bar sums a column live.',

  code: `const tick = signal(0)
const ox = signal(0)
const oy = signal(0)
const cw = 64
const ch = 26
const rh = 40
const hh = 24
const ROWS = 500
const COLS = 500
let selR = 0
let selC = 1
let vw = 600
let vh = 520
const cells = new Map()
cells.set('1,1', '3')
cells.set('2,1', '7')
cells.set('3,1', '5')

const bump = () => tick.set(n => n + 1)
const keyOf = (r, c) => \`\${r},\${c}\`
const val = (r, c) => cells.get(keyOf(r, c)) || ''
const sumB = () =>
  [1, 2, 3].reduce((s, r) =>
    s + (parseFloat(cells.get(\`\${r},1\`)) || 0), 0)

const colName = n => {
  let s = ''
  n += 1
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// Keep the selected cell in view after it moves.
const ensureVisible = () => {
  const x = rh + selC * cw
  const y = hh + selR * ch
  const loX = ox()
  if (x < loX) ox.set(x)
  else if (x + cw > loX + vw)
    ox.set(x + cw - vw)
  const loY = oy()
  if (y < loY) oy.set(y)
  else if (y + ch > loY + vh)
    oy.set(y + ch - vh)
}

const onKey = k => {
  if (k.isComposing || k.ctrlKey || k.metaKey
      || k.altKey) return
  if (k.key === 'Enter')
    selR = Math.min(selR + 1, ROWS - 1)
  else if (k.key === 'Backspace')
    cells.set(keyOf(selR, selC), '')
  else if (k.key.length === 1) {
    const key = keyOf(selR, selC)
    cells.set(key, val(selR, selC) + k.key)
  } else return
  ensureVisible()
  bump()
}

const formula = () =>
  HStack(
    { spacing: 10, align: 'center' },
    Text(() => \`=\${colName(selC)}\${selR + 1}\`)
      .font({ size: 12, weight: 600 })
      .foreground('#22c55e'),
    Text(() => val(selR, selC) || '—')
      .font({ size: 12 })
      .foreground('#e4e4e7'),
    Spacer(),
    Text(() => \`=SUM(B2:B4) → \${sumB()}\`)
      .font({ size: 12 })
      .foreground('#a1a1aa'),
  )
    .padding({ t: 7, b: 7, l: 12, r: 12 })
    .background(Rectangle().fill('#16161a'))

const cell = (r, c) => {
  const on = selR === r && selC === c
  const inner = ZStack(
    Rectangle().fill(on ? '#1e3a5f' : '#0d0d10')
      .stroke(on ? '#60a5fa' : '#232327', 1),
    Text(() => val(r, c))
      .font({ size: 12 })
      .foreground('#e4e4e7')
      .padding({ l: 6 })
      .offset(0, 5),
  ).frame(cw, ch)
  // The tap is inside the HStack: a ZStack would
  // hand an outer handler the whole sheet rect.
  return HStack({ spacing: 0, align: 'leading' },
    inner.onTap(() => { selR = r; selC = c; bump() }))
      .offset(rh + c * cw, hh + r * ch)
}

const colHead = c =>
  HStack({ spacing: 0, align: 'leading' },
    Text(colName(c))
      .font({ size: 11, weight: 700 })
      .foreground('#71717a')
      .frame(cw, hh)
      .background(Rectangle().fill('#121216')),
  )

const rowHead = r =>
  HStack({ spacing: 0, align: 'leading' },
    Text(\`\${r + 1}\`)
      .font({ size: 11, weight: 700 })
      .foreground('#71717a')
      .frame(rh, ch)
      .background(Rectangle().fill('#121216')),
  )

const firstC = () => {
  const x0 = ox() - rh
  return clamp(Math.floor(x0 / cw), 0, COLS - 1)
}
const lastC = () => {
  const x0 = ox() - rh
  return clamp(Math.ceil((x0 + vw) / cw), 0, COLS)
}
const firstR = () => {
  const y0 = oy() - hh
  return clamp(Math.floor(y0 / ch), 0, ROWS - 1)
}
const lastR = () => {
  const y0 = oy() - hh
  return clamp(Math.ceil((y0 + vh) / ch), 0, ROWS)
}

// Headers are pinned: a strip above/left of the scroll
// viewport, translated by -ox/-oy to track the cells.
const corner = () =>
  HStack({ spacing: 0, align: 'leading' },
    Rectangle().fill('#121216').frame(rh, hh),
  )

const colHeaderStrip = () => {
  const heads = []
  for (let c = firstC(); c < lastC(); c++)
    heads.push(colHead(c).offset(c * cw - ox(), 0))
  return HStack({ spacing: 0, align: 'leading' },
    ZStack(
      Rectangle().frame(vw - rh, hh),
      ...heads,
    ).clip(),
  ).offset(rh, 0)
}

const rowHeaderStrip = () => {
  const heads = []
  for (let r = firstR(); r < lastR(); r++)
    heads.push(rowHead(r).offset(0, r * ch - oy()))
  return HStack({ spacing: 0, align: 'leading' },
    ZStack(
      Rectangle().frame(rh, vh - hh),
      ...heads,
    ).clip(),
  ).offset(0, hh)
}

// Only the cells in view are drawn, over a fixed
// 500x500 backdrop that sets the scroll extent.
const cellContent = () => {
  const items = []
  for (let r = firstR(); r < lastR(); r++)
    for (let c = firstC(); c < lastC(); c++)
      items.push(cell(r, c))
  return ZStack(
    Rectangle().fill('#0d0d10')
      .frame(rh + COLS * cw, hh + ROWS * ch),
    ...items,
  )
}

return component('sheet', () => {
  tick()
  return VStack({ spacing: 0 },
    formula(),
    ZStack(
      ScrollView({ x: ox, y: oy }, cellContent()),
      corner(),
      colHeaderStrip(),
      rowHeaderStrip(),
    )
      .frame(null, 520)
      .onLayout(r => {
        if (r.w !== vw || r.h !== vh) {
          vw = r.w
          vh = r.h
          tick.set(n => n + 1)
        }
      }),
  ).onKey(onKey)
})`,
}
