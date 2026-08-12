import type { Example } from './types'

export const figma: Example = {
  id: 'figma',
  title: 'Design canvas (Figma-like)',
  section: 'APPS',
  blurb:
    'A canvas with a toolbar: tap a text frame to select it, drag to move it, ' +
    'type to edit, Delete to remove. Typing works because the whole example ' +
    'is one component() — the root carries .onKey(), the press focuses it, and ' +
    'every edit bumps a signal that rebuilds the tree.',

  code: `const tick = signal(0)
let sel = -1
let fx = 0
let fy = 0
let frames = [
  { x: 36, y: 28, text: 'WeaveKit' },
  { x: 36, y: 84, text: 'design canvas' },
]

const bump = () => tick.set(n => n + 1)
const select = i => { sel = i; bump() }

const onKey = k => {
  if (sel < 0 || k.isComposing) return
  const f = frames[sel]
  if (k.key === 'Backspace')
    f.text = f.text.slice(0, -1)
  else if (k.key === 'Delete') {
    frames.splice(sel, 1)
    sel = -1
  } else if (k.key.length === 1 && !k.ctrlKey
      && !k.metaKey && !k.altKey) {
    f.text += k.key
  }
  bump()
}

const toolBtn = (label, on, fn) =>
  Text(label)
    .font({ size: 12, weight: 600 })
    .foreground(on ? '#fafafa' : '#a1a1aa')
    .padding({ t: 4, b: 4, l: 9, r: 9 })
    .background(RoundedRect(6).fill(
      on ? '#3f3f46' : 'transparent'))
    .onTap(fn)

// Built inside the component below, so a bump of tick
// re-reads frames and sel — edits show next frame,
// like the dragging example's bar.

const toolbar = () =>
  HStack({ spacing: 8, align: 'center' },
    Text('canvas').font({ size: 10, weight: 700 })
      .foreground('#52525b'),
    toolBtn('Add text', false, () => {
      const y = 60 + frames.length % 5 * 26
      frames.push({ x: 36, y, text: 'Text' })
      sel = frames.length - 1
      bump()
    }),
    toolBtn('Delete', sel >= 0, () => {
      if (sel < 0) return
      frames.splice(sel, 1)
      sel = -1
      bump()
    }),
    Spacer(),
    Text(() => sel >= 0
      ? 'type to edit · drag to move'
      : 'tap a frame to select')
      .font({ size: 11 })
      .foreground('#71717a'),
  )
    .padding({ t: 8, b: 8, l: 10, r: 10 })
    .background(Rectangle().fill('#16161a'))

const canvas = () =>
  // topLeading anchors every frame to the canvas
  // corner, so an offset reads as a position.
  ZStack({ align: 'topLeading' },
    Rectangle().fill('#0d0d10'),
    ...frames.map((f, i) =>
      Text(f.text)
        .font({ size: 14 })
        .foreground('#e4e4e7')
        .padding({ t: 5, b: 5, l: 8, r: 8 })
        .background(RoundedRect(4).fill(i === sel
          ? '#16325f' : 'transparent'))
        .onTap(() => select(i))
        .onDrag({
          onStart: () => {
            fx = f.x
            fy = f.y
            select(i)
          },
          onMove: d => {
            f.x = clamp(fx + d.tx, 0, 300)
            f.y = clamp(fy + d.ty, 0, 190)
            bump()
          },
        })
        .offset(f.x, f.y),
    ),
  ).frame(null, 250)

const footer = () =>
  Text(() => sel >= 0
    ? \`editing: \${frames[sel].text}\`
    : 'nothing selected')
    .font({ size: 11 })
    .foreground('#71717a')
    .padding({ t: 6 })

return component('figma', () => {
  tick()
  return VStack({ spacing: 0 },
    toolbar(),
    canvas(),
    footer(),
  ).onKey(onKey)
})`,
}
