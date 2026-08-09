export interface Example {
  id: string
  title: string
  blurb: string
  /**
   * The example, as source. This is the only definition — the rendered view is
   * produced by compiling this string, so the code shown and the result can
   * never drift apart, and the reader can edit it.
   *
   * Either a single expression, or statements ending in `return <view>`.
   * `SANDBOX` is what the editor puts in scope. Keep lines under 55 columns
   * for readability; `npm run check:layout` enforces it.
   */
  code: string
}
