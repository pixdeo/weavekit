import type { Example } from './types'

export const spreadsheet: Example = {
  id: 'spreadsheet',
  title: 'Spreadsheet',
  section: 'APPS',
  blurb:
    'A tiny grid, on purpose: tap a cell to select it, type to enter a value, ' +
    'Enter moves down, Backspace clears. The formula bar sums a column live, ' +
    'so the data visibly does something. All editing is one .onKey() handler ' +
    'on the root and a two-dimensional array of plain strings.',

  code: `const tick = signal(0)
const ROWS = 6
const COLS = 5
let selR = 0
let selC = 1
const cells = [
  ['', '', '', '', ''],
  ['', '3', '', '', ''],
  ['', '7', '', '', ''],
  ['', '5', '', '', ''],
  ['', '', '', '', ''],
  ['', '', '', '', ''],
]

const bump = () => tick.set(n => n + 1)
const ref = () =>
  String.fromCharCode(65 + selC) + (selR + 1)
const sumB = () =>
  [1, 2, 3].reduce((s, r) =>
    s + (parseFloat(cells[r][1]) || 0), 0)

const onKey = k => {
  if (k.isComposing || k.ctrlKey || k.metaKey) return
  if (k.key === 'Enter')
    selR = Math.min(selR + 1, ROWS - 1)
  else if (k.key === 'Backspace')
    cells[selR][selC] = ''
  else if (k.key.length === 1)
    cells[selR][selC] += k.key
  else return
  bump()
}

const colHead = c =>
  Text(String.fromCharCode(65 + c))
    .font({ size: 11, weight: 700 })
    .foreground('#71717a')
    .frame(52, 24)
    .background(Rectangle().fill('#121216'))

const rowHead = r =>
  Text(\`\${r + 1}\`)
    .font({ size: 11, weight: 700 })
    .foreground('#71717a')
    .frame(24, 26)
    .background(Rectangle().fill('#121216'))

const cell = (r, c) => {
  const on = selR === r && selC === c
  return ZStack(
    Rectangle().fill(on ? '#1e3a5f' : '#0d0d10')
      .stroke(on ? '#60a5fa' : '#232327', 1),
    Text(() => cells[r][c])
      .font({ size: 12 })
      .foreground('#e4e4e7')
      .padding({ l: 6 })
      .offset(0, 5),
  )
    .frame(52, 26)
    .onTap(() => { selR = r; selC = c; bump() })
}

const formula = () =>
  HStack(
    { spacing: 10, align: 'center' },
    Text(() => \`=\${ref()}\`)
      .font({ size: 12, weight: 600 })
      .foreground('#22c55e')
      .frame(52, null),
    Text(() => cells[selR][selC] || '—')
      .font({ size: 12 })
      .foreground('#e4e4e7'),
    Spacer(),
    Text(() => \`=SUM(B2:B4) → \${sumB()}\`)
      .font({ size: 12 })
      .foreground('#a1a1aa'),
  )
    .padding({ t: 7, b: 7, l: 10, r: 10 })
    .background(Rectangle().fill('#16161a'))

// Built inside the component below so selection fill
// and stroke follow selR/selC — cell text is a thunk,
// but a plain value read at build needs rebuild that
// a bump of tick triggers.
const grid = () =>
  VStack({ spacing: 0 },
    HStack({ spacing: 0 },
      Rectangle().fill('#121216').frame(24, 24),
      ...Array.from({ length: COLS },
        (_, c) => colHead(c)),
    ),
    ...Array.from({ length: ROWS }, (_, r) =>
      HStack({ spacing: 0 },
        rowHead(r),
        ...Array.from({ length: COLS },
          (_, c) => cell(r, c)),
      )),
  )

return component('sheet', () => {
  tick()
  return VStack({ spacing: 0 },
    formula(),
    grid(),
    Text('tap · type · Enter · Backspace')
      .font({ size: 11 })
      .foreground('#71717a')
      .padding({ t: 8, b: 2 }),
  )
    .padding(12)
    .onKey(onKey)
})`,
}
