import {
  Button,
  Circle,
  Code,
  Ellipse,
  HStack,
  Rectangle,
  RoundedRect,
  ScrollView,
  Spacer,
  Text,
  VStack,
  ZStack,
  signal,
} from '../index'

/**
 * The toolkit surface put in scope for example code.
 *
 * This is a convenience, not a security boundary: `new Function` bodies still
 * reach the page's globals. It runs the reader's own code in the reader's own
 * browser, which is the same trade every in-page playground makes.
 */
export const SANDBOX = {
  VStack,
  HStack,
  ZStack,
  ScrollView,
  Text,
  Code,
  Spacer,
  Rectangle,
  RoundedRect,
  Circle,
  Ellipse,
  Button,
  signal,
} as const

export const SANDBOX_NAMES = Object.keys(SANDBOX)
export const SANDBOX_VALUES = Object.values(SANDBOX)
