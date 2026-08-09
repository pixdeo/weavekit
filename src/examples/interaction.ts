import type { Example } from './types'

export const interaction: Example = {
  id: 'interaction',
  title: 'Interaction',
  blurb:
    'Hit testing falls out of layout: .onTap() records its final rect during the layout ' +
    'pass. Cursor feedback rides the same list, and .cursor() registers a region that ' +
    'changes the pointer without swallowing clicks. This snippet declares state, so it ' +
    'ends in a `return` — editing it starts the counter over.',

  code: `const clicks = signal(0)

return VStack({ spacing: 12, align: 'leading' },
  Text(() => \`clicked \${clicks()} times\`)
    .font({ size: 20, weight: 700 }),

  HStack({ spacing: 8 },
    Button('Add', () => clicks.set(n => n + 1),
      { bg: '#2563eb' }),
    Button('Reset', () => clicks.set(0)),
  ),

  Rectangle().fill('#232327')
    .frame(200, 8)
    .cursor('col-resize'),

  Text('the bar only changes the cursor')
    .font({ size: 12 })
    .foreground('#71717a'),
)`,
}
