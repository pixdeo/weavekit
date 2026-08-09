import type { Example } from './types'

export const stacks: Example = {
  id: 'stacks',
  title: 'Stacks',
  blurb:
    'VStack goes down, HStack goes across, ZStack overlaps. Each takes a spacing and a ' +
    'cross-axis alignment, and nests inside any other. Try changing align to "center" or ' +
    '"trailing".',

  code: `VStack({ spacing: 12, align: 'leading' },
  Text('VStack lays children out downwards'),

  HStack({ spacing: 8 },
    Circle().fill('#22c55e').frame(12, 12),
    Text('HStack lays them out across'),
  ),

  ZStack(
    RoundedRect(8).fill('#27272a'),
    Text('ZStack overlaps them').padding(11),
  ).frame(220, 40),
)`,
}
