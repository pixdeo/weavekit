import type { Example } from './types'

export const spreadsheet: Example = {
  id: 'spreadsheet',
  title: 'Spreadsheet',
  section: 'APPS',
  blurb:
    'An infinite sheet that fills the panel edge to edge. Scroll any direction — ' +
    'only the cells in view are drawn, so a 500 by 500 sheet costs no more than ' +
    'a small one. Tap a cell to select it, type to enter, Enter moves down, ' +
    'Backspace clears. The formula bar sums a column live.',

  code: `const tick = signal(0)
const ox = signal(0)
const oy = signal(0)
const cellW = 64
const cellH = 26
const rowHeadW = 40
const colHeadH = 24
const ROWS = 500
const COLS = 500
let selR = 0
let selC = 1
let vw = 600
let vh = 400
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
  const x = rowHeadW + selC * cellW
  const y = colHeadH + selR * cellH
  const loX = ox()
  if (x < loX) ox.set(x)
  else if (x + cellW > loX + vw)
    ox.set(x + cellW - vw)
  const loY = oy()
  if (y < loY) oy.set(y)
  else if (y + cellH > loY + vh)
    oy.set(y + cellH - vh)
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
  ).frame(cellW, cellH)
  // The tap is inside the HStack: a ZStack would
  // hand an outer handler the whole sheet rect.
  return HStack({ spacing: 0, align: 'leading' },
    inner.onTap(() => { selR = r; selC = c; bump() }))
      .offset(rowHeadW + c * cellW,
        colHeadH + r * cellH)
}

const colHead = c =>
  HStack({ spacing: 0, align: 'leading' },
    Text(colName(c))
      .font({ size: 11, weight: 700 })
      .foreground('#71717a')
      .frame(cellW, colHeadH)
      .background(Rectangle().fill('#121216')),
  )
    .offset(rowHeadW + c * cellW, 0)

const rowHead = r =>
  HStack({ spacing: 0, align: 'leading' },
    Text(\`\${r + 1}\`)
      .font({ size: 11, weight: 700 })
      .foreground('#71717a')
      .frame(rowHeadW, cellH)
      .background(Rectangle().fill('#121216')),
  )
    .offset(0, colHeadH + r * cellH)

// Only the cells in view are drawn, over a fixed
// 500x500 backdrop that sets the scroll extent.
const grid = () =>
  component('grid', () => {
    ox()
    oy()
    tick()
    const x0 = ox() - rowHeadW
    const y0 = oy() - colHeadH
    const c0 = clamp(Math.floor(x0 / cellW),
      0, COLS - 1)
    const c1 = clamp(Math.ceil((x0 + vw) / cellW),
      0, COLS)
    const r0 = clamp(Math.floor(y0 / cellH),
      0, ROWS - 1)
    const r1 = clamp(Math.ceil((y0 + vh) / cellH),
      0, ROWS)
    const items = []
    for (let c = c0; c < c1; c++)
      items.push(colHead(c))
    for (let r = r0; r < r1; r++) {
      items.push(rowHead(r))
      for (let c = c0; c < c1; c++)
        items.push(cell(r, c))
    }
    return ZStack(
      Rectangle().fill('#0d0d10')
        .frame(rowHeadW + COLS * cellW,
          colHeadH + ROWS * cellH),
      ...items,
    )
  })

const sheet = () =>
  ScrollView({ x: ox, y: oy }, grid())
    .frame(null, 520)
    .onLayout(r => {
      if (r.w !== vw || r.h !== vh) {
        vw = r.w
        vh = r.h
        tick.set(n => n + 1)
      }
    })

return component('sheet', () => {
  tick()
  return VStack({ spacing: 0 },
    formula(),
    sheet(),
  ).onKey(onKey)
})`,
}
