import type { Example } from './types'

export const buttons: Example = {
  id: 'buttons',
  title: 'Buttons',
  blurb:
    'Button is a composition, not a primitive: Text, padding, a RoundedRect ' +
    'and onTap. Style is per instance — background, foreground, radius — and ' +
    'the callback is hit-tested against the button\u2019s final layout rect.',

  code: `const n = signal(0)

return VStack({ spacing: 14, align: 'leading' },
  Text('Style is per instance — nothing is global')
    .font({ size: 12 })
    .foreground('#71717a'),

  HStack({ spacing: 8 },
    Button('Primary', () => n.set(v => v + 1),
      { bg: '#2563eb' }),
    Button('Neutral', () => n.set(v => v + 1)),
    Button('Danger', () => n.set(v => v + 1),
      { bg: '#dc2626' }),
  ),

  Text(() => \`clicked \${n()} times\`)
    .font({ size: 20, weight: 700 }),

  HStack({ spacing: 8 },
    Button('Pill', () => {},
      { bg: '#7c3aed', radius: 18 }),
    Button('Square', () => {},
      { bg: '#0f766e', radius: 2 }),
    Button('Light', () => {},
      { bg: '#fafafa', fg: '#18181b' }),
  ),

  Text('A Button is Text, padding, a RoundedRect')
    .font({ size: 12 })
    .foreground('#71717a'),
  Text('and onTap — any look, no built-in state.')
    .font({ size: 12 })
    .foreground('#71717a'),
)`,
}
