import type { Example } from './types'

export const embedding: Example = {
  id: 'embedding',
  title: 'Embedding in a page',
  blurb:
    'Everything else in this gallery is a view. This is the glue that puts one on a page: ' +
    'a host element, a backend, and a build function. The package is on npm — ' +
    '@pixdeo/weavekit. The snippet below is shown, not run: the editor sandbox reaches ' +
    'the view constructors and signal, and nothing else.',

  code: `VStack({ spacing: 12, align: 'leading' },
  Text('Mount into any element')
    .font({ size: 15, weight: 700 })
    .foreground('#fafafa'),
  Code(\`<div id="app"></div>

mount(
  document.getElementById('app'),
  createCanvasBackend(),
  () => Text('Hello').padding(20),
)\`)
    .foreground('#7dd3fc')
    .padding(14)
    .background(RoundedRect(8).fill('#08080a')),
  Text('The host must have a size — mount ' +
       'reads clientWidth and clientHeight.')
    .font({ size: 12 })
    .foreground('#a1a1aa'),
)`,
}
