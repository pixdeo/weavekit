import type { View } from '../core/view'
import { Text } from './text'
import { RoundedRect } from './shape'

export interface ButtonStyle {
  fg?: string
  bg?: string
  radius?: number
}

/** Not a primitive: just a composition of Text, padding, background and onTap. */
export function Button(label: string | (() => string), onTap: () => void, style: ButtonStyle = {}): View {
  return Text(label)
    .font({ size: 13, weight: 600 })
    .foreground(style.fg ?? '#fafafa')
    .padding({ t: 7, b: 7, l: 12, r: 12 })
    .background(RoundedRect(style.radius ?? 8).fill(style.bg ?? '#3f3f46'))
    .onTap(onTap)
}
