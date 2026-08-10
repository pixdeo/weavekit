export { View } from './core/view'
export type { Dynamic } from './core/view'
export { Ctx } from './core/ctx'
export { mount } from './core/mount'
export { signal } from './core/signal'
export type { Signal } from './core/signal'
export {
  advanceAnimations,
  animated,
  easeIn,
  easeInOut,
  easeOut,
  linear,
  mixColor,
  project,
  spring,
  tween,
} from './core/animation'
export type { Animated, AnimationSpec, Easing, SpringOpts, TweenOpts } from './core/animation'
export { component, ComponentCache } from './core/component'
export type { CacheStats } from './core/component'
export { dslToJs, jsToBlocks, DslSyntaxError } from './core/dsl'
export type { DslOutput } from './core/dsl'
export type {
  Align,
  Drag,
  DragHandlers,
  DrawOp,
  Font,
  Hit,
  Insets,
  PointerType,
  Proposal,
  Rect,
  ScrollRegion,
  Size,
} from './core/types'
export { clamp, pointerTypeOf } from './core/types'

export { Text, Code, MONO } from './views/text'
export type { TextOpts } from './views/text'
export { VStack, HStack, ZStack } from './views/stack'
export { ScrollView } from './views/scroll'
export type { ScrollAxis, ScrollOffset } from './views/scroll'
export { NativeScrollView, setNativeScrollLayer } from './views/native-scroll'
export { Spacer } from './views/spacer'
export { Rectangle, RoundedRect, Circle, Ellipse, Shape } from './views/shape'
export { Button } from './views/button'

export { createCanvasBackend } from './render/canvas'
export { createDomBackend } from './render/dom'
export type { Backend, PointerCallback } from './render/backend'
