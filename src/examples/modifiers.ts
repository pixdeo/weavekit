import type { Example } from './types'

export const modifiers: Example = {
  id: 'modifiers',
  title: 'Modifier order',
  blurb:
    'Modifiers wrap, so order changes the result. Padding before a background grows the ' +
    'painted box; padding after it leaves the box tight and adds space outside. No special ' +
    'case in the engine makes this happen — it falls out of the nesting. Swap the two lines ' +
    'and watch them trade places.',

  code: `VStack({ spacing: 10, align: 'leading' },
  HStack({ spacing: 18, align: 'leading' },
    Text('padding then background')
      .padding(12)
      .background(RoundedRect(8).fill('#1d4ed8')),

    Text('background then padding')
      .background(RoundedRect(8).fill('#3f3f46'))
      .padding(12),
  ),

  Text('same two views, opposite order')
    .font({ size: 12 })
    .foreground('#71717a'),
)`,
}
