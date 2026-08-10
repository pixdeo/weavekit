import type { Example } from './types'

export const text: Example = {
  id: 'text',
  title: 'Text',
  blurb:
    'Text measures itself and wraps to the width it is offered, re-flowing as ' +
    'the space changes. Code is the monospace, whitespace-preserving sibling. ' +
    'Fonts, weights, colors and line height are per-instance modifiers.',

  code: `VStack({ spacing: 14, align: 'leading' },
  Text('Type sizes').font({ size: 11, weight: 700 })
    .foreground('#52525b'),
  HStack({ spacing: 16, align: 'center' },
    Text('S').font({ size: 12 }),
    Text('M').font({ size: 20 }),
    Text('L').font({ size: 34, weight: 700 }),
  ),

  Text('Weights').font({ size: 11, weight: 700 })
    .foreground('#52525b'),
  HStack({ spacing: 16, align: 'center' },
    Text('Light').font({ size: 16, weight: 300 }),
    Text('Bold').font({ size: 16, weight: 700 }),
  ),

  Text('Colors').font({ size: 11, weight: 700 })
    .foreground('#52525b'),
  HStack({ spacing: 16, align: 'center' },
    Text('green').foreground('#22c55e'),
    Text('blue').foreground('#60a5fa'),
    Text('muted').foreground('#71717a'),
  ),

  Text('Wrapping').font({ size: 11, weight: 700 })
    .foreground('#52525b'),
  Text('A line wraps to the width it is offered,')
    .font({ size: 13 })
    .frame(250, null),
  Text('re-flowing as the panel resizes.')
    .font({ size: 13 })
    .frame(250, null),

  Text('Code keeps its whitespace')
    .font({ size: 11, weight: 700 })
    .foreground('#52525b'),
  Code('const greet = () => "hi"')
    .foreground('#7dd3fc')
    .padding(10)
    .background(RoundedRect(6).fill('#101014')),
)`,
}
