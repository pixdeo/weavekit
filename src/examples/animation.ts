import type { Example } from './types'

export const animation: Example = {
  id: 'animation',
  title: 'Animation',
  blurb:
    'An animated() value reads exactly like a signal, except .set() interpolates toward ' +
    'the target instead of jumping. Nothing else has to know: whatever reads it is ' +
    'invalidated as it moves. The spring carries its velocity across a retarget, so ' +
    'tapping a second stop mid-flight bends the path rather than restarting it. Note ' +
    '.offset(() => x(), 0) — a plain number would be frozen when the view was built.',

  code: `const x = animated(0, spring({
  response: 460, damping: 0.55,
}))
const fade = animated(1, tween({
  duration: 260, easing: easeOut,
}))

const stop = (to, o, label) =>
  Button(label, () => {
    x.set(to)
    fade.set(o)
  })

const dot = Circle().fill('#2563eb')
  .frame(30, 30)
  .offset(() => x(), 0)
  .opacity(() => fade())

return VStack({ spacing: 14, align: 'leading' },
  HStack({ spacing: 0 }, dot, Spacer())
    .frame(320, 30),

  HStack({ spacing: 8 },
    stop(0, 1, 'left'),
    stop(145, 0.4, 'middle'),
    stop(290, 1, 'right'),
    Spacer(),
  ),

  Text(() =>
    x.animating() ? 'in flight' : 'at rest')
    .font({ size: 12 })
    .foreground('#71717a'),
)`,
}
