import type { Example } from './types'

export const scrolling: Example = {
  id: 'scrolling',
  title: 'Scrolling',
  blurb:
    'A ScrollView is a viewport onto a taller child. The offset lives in a signal you own, ' +
    'so scroll position is ordinary state — readable, restorable, animatable. Clipping is a ' +
    'separate modifier: .clip() confines both drawing and hit testing to a view’s rect. ' +
    'Because the offset here is an animated() rather than a plain signal, it can be handed ' +
    'a release velocity — so a flick on a touchscreen coasts. Swap it for signal(0) and ' +
    'everything still scrolls, just without momentum.',

  code: `const y = animated(0, spring({
  response: 190, damping: 1,
}))

const row = (i) =>
  HStack({ spacing: 10, align: 'center' },
    Circle().fill('#3f3f46').frame(8, 8),
    Text('row ' + i),
    Spacer(),
    Text(String(i * 11))
      .foreground('#52525b'),
  )
    .padding({ t: 8, b: 8, l: 12, r: 12 })

return ScrollView({ y },
  VStack({ spacing: 2, align: 'leading' },
    ...Array.from({ length: 20 }, (_, i) => row(i)),
  ),
)
  .frame(320, 190)
  .background(RoundedRect(10).fill('#141417'))`,
}
