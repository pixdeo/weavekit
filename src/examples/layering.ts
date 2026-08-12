import type { Example } from './types'

export const layering: Example = {
  id: 'layering',
  title: 'Layering',
  blurb:
    'A ZStack proposes its whole rect to every child and then places each at the size it ' +
    'answered with: a shape or an .expand() fills the stack, a .frame() keeps its own size. ' +
    'Where that smaller child lands is the align option — centred by default, or pinned to a ' +
    'corner, which is what turns an .offset() into a position. Panels nest the other way ' +
    'round: padding then background, over and over, each background painting the box the ' +
    'padding just grew. That is how you get a frame around a frame.',

  code: `HStack({ spacing: 20, align: 'center' },
  // Concentric panels: every .padding() grows
  // the box, every .background() paints it.
  VStack({ spacing: 4, align: 'leading' },
    Text('12:04').font({ size: 20 }),
    Text('focus').font({ size: 11 })
      .foreground('#a1a1aa'),
  )
    .frame(110, 54)
    .padding(4)
    .background(RoundedRect(4).fill('#3f3f46'))
    .padding(14)
    .background(
      RoundedRect(12)
        .fill('#18181b')
        .stroke('#52525b', 1),
    ),

  // The dot keeps its 16px inside the stack.
  // Drop the align and it centres instead.
  ZStack({ align: 'topLeading' },
    RoundedRect(10).fill('#27272a'),
    Circle().fill('#22c55e').frame(16, 16)
      .offset(8, 8),
  ).frame(120, 96),
)`,
}
