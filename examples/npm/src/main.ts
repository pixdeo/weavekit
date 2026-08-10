import {
  Button,
  Circle,
  HStack,
  RoundedRect,
  Spacer,
  Text,
  VStack,
  createCanvasBackend,
  mount,
  signal,
} from '@pixdeo/weavekit'

// Everything is a view. `app` describes the whole UI; mount draws it into the
// host canvas and keeps it in sync with state.
const clicks = signal(0)

const app = () =>
  VStack({ spacing: 14, align: 'leading' },
    HStack({ spacing: 10, align: 'center' },
      Circle().fill('#22c55e').frame(10, 10),
      Text('WeaveKit').font({ size: 18, weight: 700 }),
      Spacer(),
      Button('Reset', () => clicks.set(0)),
    ),

    Text(() => `clicked ${clicks()} times`)
      .font({ size: 26, weight: 700 })
      .foreground('#fafafa'),

    HStack({ spacing: 8 },
      Button('Click me', () => clicks.set((n) => n + 1),
        { bg: '#2563eb' }),
      Button('Larger', () => clicks.set((n) => n + 5),
        { bg: '#7c3aed', radius: 16 }),
    ),

    Text('Buttons, text, shapes and layout — '
      + 'all WeaveKit views, mounted here.')
      .font({ size: 13 })
      .foreground('#a1a1aa')
      .padding({ t: 6 }),
  )
    .padding(22)
    .background(RoundedRect(14).fill('#151518'))
    .frame(420, null)

mount(document.getElementById('app')!, createCanvasBackend(), app)
