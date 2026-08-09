import type { Example } from './types'

export const hello: Example = {
  id: 'hello',
  title: 'Hello, world',
  blurb:
    'A view describes itself; a modifier wraps it in another view. Chaining is nesting, ' +
    'so the order you write modifiers in is the order they apply. The code on the left is ' +
    'live — edit it and the panel on the right re-renders as you type.',

  code: `VStack({ spacing: 6, align: 'leading' },
  Text('Hello, world')
    .font({ size: 28, weight: 700 })
    .foreground('#fafafa'),
  Text('edit me — this panel is live')
    .font({ size: 13 })
    .foreground('#bfdbfe'),
)
  .padding(22)
  .background(RoundedRect(14).fill('#1d4ed8'))`,
}
