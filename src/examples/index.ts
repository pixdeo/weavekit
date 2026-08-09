import type { Example } from './types'
import { hello } from './hello'
import { stacks } from './stacks'
import { modifiers } from './modifiers'
import { flexibility } from './flexibility'
import { interaction } from './interaction'
import { scrolling } from './scrolling'
import { embedding } from './embedding'

/** Gallery order. The first entry is what a newcomer lands on. */
export const examples: Example[] = [
  hello,
  stacks,
  modifiers,
  flexibility,
  interaction,
  scrolling,
  embedding,
]

export type { Example }
