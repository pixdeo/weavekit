import type { Example } from './types'

export const flexibility: Example = {
  id: 'flexibility',
  title: 'Flexibility',
  blurb:
    'Stacks hand out room in order of increasing flexibility. Rigid children take their ' +
    'ideal size first; Spacer and .expand() absorb the surplus. Drop the Spacer, or change ' +
    'the 340 to something narrow, to see the compression path take over.',

  code: `VStack({ spacing: 12, align: 'leading' },
  HStack({ spacing: 8 },
    Text('Spacer pushes'),
    Spacer(),
    Text('to the edges'),
  ).frame(340, null),

  HStack({ spacing: 8 },
    Rectangle().fill('#3f3f46').frame(90, 26),
    Rectangle().fill('#2563eb')
      .frame(null, 26)
      .expand('h'),
  ).frame(340, null),

  Text('the blue bar takes what grey leaves')
    .font({ size: 12 })
    .foreground('#71717a'),
)`,
}
