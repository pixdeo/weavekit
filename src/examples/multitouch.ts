import type { Example } from './types'

export const multitouch: Example = {
  id: 'multitouch',
  title: 'Multi-touch',
  blurb:
    'Gestures are keyed by pointer id, so every finger hit-tests, captures and runs its ' +
    'handlers on its own — put three fingers down and all three pucks move at once. Each ' +
    'sample also says what is driving it: pointerType is mouse, touch or pen, and a ' +
    'handler can declare pointerTypes to accept only some of them, letting a press it ' +
    'refuses fall through to whatever sits underneath.',

  code: `const live = signal(0)
const kind = signal('nothing yet')

const puck = (key, color) => {
  const x = signal(0)
  const y = signal(0)
  let fx = 0
  let fy = 0

  return component(key, () =>
    Circle().fill(color).frame(58, 58)
      .onDrag({
        onStart: d => {
          fx = x()
          fy = y()
          kind.set(d.pointerType)
          live.set(n => n + 1)
        },
        onMove: d => {
          x.set(clamp(fx + d.tx, -70, 70))
          y.set(clamp(fy + d.ty, -44, 44))
        },
        onEnd: () => live.set(n => n - 1),
      })
      .offset(x(), y()))
}

return VStack({ spacing: 18, align: 'leading' },
  component('readout', () =>
    Text(() => \`\${live()} down · \${kind()}\`)
      .font({ size: 20, weight: 700 })),

  HStack({ spacing: 18 },
    puck('blue', '#2563eb'),
    puck('amber', '#f59e0b'),
    puck('green', '#22c55e'),
  ).frame(null, 150),

  Text('drag a puck — on a touchscreen, drag three')
    .font({ size: 12 })
    .foreground('#71717a'),
)`,
}
