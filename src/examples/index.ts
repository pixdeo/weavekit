import type { Example } from './types'
import { hello } from './hello'
import { dsl } from './dsl'
import { stacks } from './stacks'
import { modifiers } from './modifiers'
import { flexibility } from './flexibility'
import { interaction } from './interaction'
import { dragging } from './dragging'
import { multitouch } from './multitouch'
import { scrolling } from './scrolling'
import { nativeScroll } from './native-scroll'
import { animation } from './animation'
import { embedding } from './embedding'
import { desktop } from './desktop'

/** Gallery order. The first entry is what a newcomer lands on. */
export const examples: Example[] = [
  hello,
  dsl,
  stacks,
  modifiers,
  flexibility,
  interaction,
  dragging,
  multitouch,
  scrolling,
  nativeScroll,
  animation,
  embedding,
  desktop,
]

export type { Example }
