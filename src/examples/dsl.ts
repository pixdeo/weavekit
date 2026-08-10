import type { Example } from './types'

export const dsl: Example = {
  id: 'dsl',
  title: 'Block syntax',
  blurb:
    'The same tree, written with SwiftUI-style blocks instead of calls. Options are ' +
    '`key: value` lines, children go one per line, and modifiers chain off the closing ' +
    'brace. The editor takes either syntax — mix them freely.',

  code: `VStack {
  spacing: 6
  align: 'leading'
  Text('Hello, world')
    .font({ size: 28, weight: 700 })
    .foreground('#fafafa')
  Text('blocks, not brackets — edit me live')
    .font({ size: 13 })
    .foreground('#bfdbfe')
  HStack {
    spacing: 5
    Circle().fill('#4ade80').frame(8, 8)
    Text('nested, comma-free')
      .font({ size: 12 })
      .foreground('#93c5fd')
  }
}
  .padding(22)
  .background(RoundedRect(14).fill('#1d4ed8'))`,
}
