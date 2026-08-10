import type { Example } from './types'

export const nativeScroll: Example = {
  id: 'native-scroll',
  title: 'Native scroll',
  blurb:
    'The same list three ways. A plain signal stops dead at the ends. An animated() one ' +
    'adds the toolkit’s own fling and rubber band — close, but the end of a wheel gesture ' +
    'is inferred, and resting fingers let go of the band. The third is a prototype: a ' +
    'hidden native scroller overlays the viewport and owns the gesture, so momentum, ' +
    'timing and the band are the browser’s, and the offset is read back into a signal ' +
    'you own. Its cost: the overlay swallows taps meant for the content beneath it.',

  code: `const spec = spring({ response: 190, damping: 1 })
const plain = signal(0)
const own = animated(0, spec)
const native = signal(0)

const rows = () =>
  VStack({ spacing: 2, align: 'leading' },
    ...Array.from({ length: 20 }, (_, i) =>
      Text('row ' + i).padding(8)))

const col = (label, view) =>
  VStack({ spacing: 6, align: 'leading' },
    Text(label)
      .font({ size: 11 })
      .foreground('#71717a'),
    view
      .frame(190, 140)
      .background(RoundedRect(10).fill('#141417')))

return HStack({ spacing: 16 },
  col('plain signal',
    ScrollView({ y: plain }, rows())),
  col('own physics',
    ScrollView({ y: own }, rows())),
  col('native scroller',
    NativeScrollView({ y: native }, rows())),
)`,
}
