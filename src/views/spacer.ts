import { View } from '../core/view'
import type { Proposal, Rect, Size } from '../core/types'

/**
 * Grows along the parent stack's axis. The axis is injected by the stack that
 * owns it, which keeps Spacer from having to guess its orientation.
 */
export class SpacerView extends View {
  axis: 'v' | 'h' = 'v'

  constructor(private min = 0) {
    super()
  }

  measure(p: Proposal): Size {
    const along = this.axis === 'v' ? p.h : p.w
    const size = along == null ? this.min : Math.max(this.min, along)
    return this.axis === 'v' ? { w: 0, h: size } : { w: size, h: 0 }
  }

  place(_rect: Rect): void {
    // Nothing to draw.
  }
}

export function Spacer(min = 0): View {
  return new SpacerView(min)
}
