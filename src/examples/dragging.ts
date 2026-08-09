import type { Example } from './types'

export const dragging: Example = {
  id: 'dragging',
  title: 'Dragging',
  blurb:
    'A press inside a .onDrag() view captures the pointer: every move belongs to that ' +
    'gesture until release, even once the pointer leaves the view or the window. Read ' +
    'the total displacement (tx, ty) against state snapshotted in onStart rather than ' +
    'summing each step, so a dropped move cannot make it drift. The bar sits inside a ' +
    'component() because its width is a number, not a thunk: only a component rebuilds.',

  code: `const w = signal(120)
let from = 0

const handle = Rectangle().fill('#52525b')
  .frame(8, 46)
  .onDrag({
    onStart: () => { from = w() },
    onMove: d =>
      w.set(clamp(from + d.tx, 40, 320)),
  }, 'col-resize')

return VStack({ spacing: 12, align: 'leading' },
  Text(() => \`\${Math.round(w())} px\`)
    .font({ size: 20, weight: 700 }),

  component('bar', () =>
    HStack({ spacing: 0 },
      Rectangle().fill('#2563eb').frame(w(), 46),
      handle,
    )),

  Text('drag the grey handle sideways')
    .font({ size: 12 })
    .foreground('#71717a'),
)`,
}
