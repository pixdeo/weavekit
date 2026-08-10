/**
 * Block syntax — a SwiftUI-flavoured way to write the same view trees the
 * JavaScript API accepts, without the parens and commas. `dslToJs` rewrites
 * it to plain JavaScript; everything else about compiling and running a
 * snippet stays the same.
 *
 *   VStack {
 *     spacing: 6              option lines come first and become { ... }
 *     align: 'leading'
 *
 *     Text('Hello, world')    one child per line
 *       .font({ size: 28 })   a chain continues while lines start with `.`
 *     HStack {                blocks nest
 *       Text('a')
 *       Text('b')
 *     }
 *   }
 *     .padding(22)            modifiers attach to the block like to any call
 *
 * becomes `VStack({ spacing: 6, align: 'leading' }, Text(...), HStack(...))`.
 *
 * A head can keep ordinary arguments — `ScrollView({ y: offset }) { ... }`
 * appends the block's children to them (but then options belong in the
 * arguments, not in the block). Everything outside a block is plain
 * JavaScript, and statements are allowed at the top level; the final
 * expression is returned implicitly:
 *
 *   const clicks = signal(0)
 *
 *   VStack {
 *     Text(() => `clicks: ${clicks()}`)
 *     Button('tap', () => clicks.set(clicks() + 1))
 *   }
 *
 * Two limitations, both from keeping the rewriter a single pass with no real
 * parser: regex literals are not recognised (write `new RegExp(...)`), and a
 * block body is line-oriented — a child expression fits on one line, or
 * continues inside unclosed `(...)` or on lines starting with `.`.
 */

export class DslSyntaxError extends Error {}

export interface DslOutput {
  /** Plain JavaScript: a single expression, or statements ending in a return. */
  code: string
  /** Blocks rewritten. Zero means the source was already plain JavaScript. */
  blocksFound: number
}

const ID_START = /[A-Za-z_$]/
const ID_CHAR = /[A-Za-z0-9_$]/
const STATEMENT =
  /^(?:const|let|var|return|if|for|while|switch|throw|try|do|function|class|import|export)\b/
const OPTION = /^[A-Za-z_$][A-Za-z0-9_$]*\s*:(?![:=])/

class Scanner {
  blocks = 0
  private i = 0

  constructor(private readonly src: string) {}

  private get atEnd(): boolean {
    return this.i >= this.src.length
  }

  private error(message: string, at = this.i): DslSyntaxError {
    let line = 1
    let col = 1
    for (let k = 0; k < at; k++) {
      if (this.src[k] === '\n') {
        line++
        col = 1
      } else {
        col++
      }
    }
    return new DslSyntaxError(`${message} (line ${line}, column ${col})`)
  }

  /* Whitespace, newlines and comments, from any position. */
  private skipBlankFrom(from: number): number {
    const s = this.src
    let i = from
    while (i < s.length) {
      const ch = s[i]
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        i++
        continue
      }
      if (ch === '/' && s[i + 1] === '/') {
        while (i < s.length && s[i] !== '\n') i++
        continue
      }
      if (ch === '/' && s[i + 1] === '*') {
        const end = s.indexOf('*/', i + 2)
        if (end < 0) throw this.error('unterminated comment', i)
        i = end + 2
        continue
      }
      break
    }
    return i
  }

  private skipBlank(): void {
    this.i = this.skipBlankFrom(this.i)
  }

  /* A quoted string. Template `${ ... }` expressions are skipped with brace
     counting, so their braces never reach the scanner. */
  private skipString(): void {
    const s = this.src
    const quote = s[this.i]
    this.i++
    while (this.i < s.length) {
      const ch = s[this.i]
      if (ch === '\\') {
        this.i += 2
        continue
      }
      if (ch === quote) {
        this.i++
        return
      }
      if (quote === '`' && ch === '$' && s[this.i + 1] === '{') {
        this.i += 2
        this.skipTemplateExpr()
        continue
      }
      this.i++
    }
    throw this.error('unterminated string')
  }

  private skipTemplateExpr(): void {
    const s = this.src
    let depth = 1
    while (this.i < s.length) {
      const ch = s[this.i]
      if (ch === "'" || ch === '"' || ch === '`') {
        this.skipString()
        continue
      }
      if (ch === '/' && (s[this.i + 1] === '/' || s[this.i + 1] === '*')) {
        this.skipBlank()
        continue
      }
      if (ch === '{') depth++
      if (ch === '}') {
        depth--
        if (depth === 0) {
          this.i++
          return
        }
      }
      this.i++
    }
    throw this.error('unterminated template expression')
  }

  /* One expression, transformed. Stops before its terminator: at bracket
     depth zero that is an unmatched closer, `;`, a `,` when `stops.comma`,
     or a newline the next line doesn't pick up with a `.` when
     `stops.newline`. */
  private scanExpr(out: string[], stops: { newline: boolean; comma: boolean }): void {
    const s = this.src
    let depth = 0
    while (this.i < s.length) {
      const ch = s[this.i]
      if (ch === "'" || ch === '"' || ch === '`') {
        const from = this.i
        this.skipString()
        out.push(s.slice(from, this.i))
        continue
      }
      if (ch === '/' && (s[this.i + 1] === '/' || s[this.i + 1] === '*')) {
        this.skipBlank()
        out.push(' ')
        continue
      }
      if (ch === '(' || ch === '[' || ch === '{') {
        depth++
        out.push(ch)
        this.i++
        continue
      }
      if (ch === ')' || ch === ']' || ch === '}') {
        if (depth === 0) return
        depth--
        out.push(ch)
        this.i++
        continue
      }
      if (depth === 0) {
        if (ch === ';' || (ch === ',' && stops.comma)) return
        if (ch === '\n' && stops.newline) {
          const from = this.i
          this.skipBlank()
          // A chain continues on `.method` lines — but `...spread` is not one.
          if (s[this.i] === '.' && s[this.i + 1] !== '.') {
            out.push(s.slice(from, this.i))
            continue
          }
          this.i = from
          return
        }
      }
      if (ID_START.test(ch)) {
        this.scanWord(out)
        continue
      }
      out.push(ch)
      this.i++
    }
  }

  /* An identifier, keyword or call — and the one place the syntax differs
     from JavaScript: `Name { ... }` and `Name(args) { ... }` blocks. */
  private scanWord(out: string[]): void {
    const s = this.src
    const from = this.i
    while (this.i < s.length && ID_CHAR.test(s[this.i])) this.i++
    const word = s.slice(from, this.i)
    if (word[0] < 'A' || word[0] > 'Z') {
      out.push(word)
      return
    }
    const afterName = this.skipBlankFrom(this.i)
    if (s[afterName] === '{') {
      this.i = afterName + 1
      this.blocks++
      out.push(`${word}(${this.scanBlockBody(false)})`)
      return
    }
    if (s[afterName] !== '(') {
      out.push(word)
      return
    }
    // A call. Only a block if a `{` follows its argument list.
    this.i = afterName + 1
    const args = this.scanCallArgs()
    const afterArgs = this.skipBlankFrom(this.i)
    if (s[afterArgs] !== '{') {
      out.push(`${word}(${args})`)
      return
    }
    this.i = afterArgs + 1
    this.blocks++
    const body = this.scanBlockBody(args.length > 0)
    out.push(`${word}(${[args, body].filter((part) => part.length > 0).join(', ')})`)
  }

  /* The inside of a call's parens; this.i is past the `(` and ends past the
     `)`. Each argument is transformed like any other expression. */
  private scanCallArgs(): string {
    const args: string[] = []
    this.skipBlank()
    if (this.src[this.i] === ')') {
      this.i++
      return ''
    }
    while (true) {
      const arg: string[] = []
      this.scanExpr(arg, { newline: false, comma: true })
      args.push(arg.join('').trim())
      this.skipBlank()
      const ch = this.src[this.i]
      if (ch === ',') {
        this.i++
        this.skipBlank()
        continue
      }
      if (ch === ')') {
        this.i++
        return args.join(', ')
      }
      throw this.error(this.atEnd ? 'unclosed `(`' : 'expected `,` or `)`')
    }
  }

  /* The inside of a `Name { ... }` block; this.i is past the `{` and ends
     past the `}`. Returns the argument list the block rewrites to. */
  private scanBlockBody(hasArgs: boolean): string {
    const opts: string[] = []
    const children: string[] = []
    while (true) {
      this.skipBlank()
      while (this.src[this.i] === ',' || this.src[this.i] === ';') {
        this.i++
        this.skipBlank()
      }
      if (this.atEnd) throw this.error('unclosed block — missing `}`')
      if (this.src[this.i] === '}') {
        this.i++
        break
      }
      const at = this.i
      const item: string[] = []
      this.scanExpr(item, { newline: true, comma: true })
      const text = item.join('').trim()
      if (!text) throw this.error(`unexpected \`${this.src[this.i]}\``, at)
      const keyword = /^[a-z]+/.exec(text)?.[0]
      if (keyword && STATEMENT.test(text))
        throw this.error(`\`${keyword}\` statements belong outside view blocks`, at)
      if (OPTION.test(text)) {
        if (children.length > 0)
          throw this.error('block options come first, before the children', at)
        if (hasArgs)
          throw this.error('options are block lines or call arguments, not both', at)
        opts.push(text)
      } else {
        children.push(text)
      }
    }
    const parts: string[] = []
    if (opts.length > 0) parts.push(`{ ${opts.join(', ')} }`)
    parts.push(...children)
    return parts.join(', ')
  }

  /* The whole source: statements are kept verbatim, expressions transformed,
     and a lone trailing expression is returned implicitly. */
  run(): DslOutput {
    const items: { text: string; statement: boolean }[] = []
    while (true) {
      this.skipBlank()
      while (this.src[this.i] === ';') {
        this.i++
        this.skipBlank()
      }
      if (this.atEnd) break
      const at = this.i
      const statement = STATEMENT.test(this.src.slice(this.i))
      const item: string[] = []
      this.scanExpr(item, { newline: true, comma: !statement })
      const text = item.join('').trim()
      if (!text) throw this.error(`unexpected \`${this.src[this.i]}\``, at)
      if (!statement && OPTION.test(text))
        throw this.error('a `key: value` line belongs inside a view block', at)
      items.push({ text, statement })
    }
    let code: string
    if (items.length === 1 && !items[0].statement) {
      code = items[0].text
    } else {
      const returned = items.some((it) => it.statement && it.text.startsWith('return'))
      code = items
        .map((it, k) =>
          !returned && k === items.length - 1 && !it.statement ? `return ${it.text}` : it.text,
        )
        .join('\n')
    }
    return { code, blocksFound: this.blocks }
  }
}

/**
 * Rewrites block-syntax source to plain JavaScript. Sources without a single
 * block come back with `blocksFound: 0` and their text essentially unchanged,
 * so callers can tell "the user wrote JavaScript" apart from "the user wrote
 * block syntax". Throws `DslSyntaxError` with a line and column on malformed
 * input.
 */
export function dslToJs(source: string): DslOutput {
  return new Scanner(source).run()
}

/* ------------------------------------------------------------------ reverse
 *
 * `jsToBlocks` goes the other way: it rewrites call-style JavaScript as
 * block syntax, so a snippet can be viewed in either style. The scanner
 * below is a forgiving cousin of the one above — it never throws, and
 * whatever it doesn't recognise it copies through untouched. The result
 * always compiles, because `compileSource` accepts a mix of both styles.
 */

/* A quoted string, template `${ ... }` included. Returns the index just past
   it, or the end of the text if it never closes. */
function scanString(text: string, from: number): number {
  const quote = text[from]
  let i = from + 1
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === quote) return i + 1
    if (quote === '`' && ch === '$' && text[i + 1] === '{') {
      const close = matchBracket(text, i + 1)
      if (close < 0) return text.length
      i = close + 1
      continue
    }
    i++
  }
  return text.length
}

function scanComment(text: string, from: number): number {
  if (text[from + 1] === '/') {
    const newline = text.indexOf('\n', from + 2)
    return newline < 0 ? text.length : newline
  }
  const end = text.indexOf('*/', from + 2)
  return end < 0 ? text.length : end + 2
}

function scanBlank(text: string, from: number): number {
  let i = from
  while (i < text.length) {
    const ch = text[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }
    if (ch === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      i = scanComment(text, i)
      continue
    }
    break
  }
  return i
}

/* The index of the bracket matching the one at `open`, or -1. Other bracket
   types are irrelevant to the count in balanced code. */
function matchBracket(text: string, open: number): number {
  const openCh = text[open]
  const closeCh = openCh === '(' ? ')' : openCh === '[' ? ']' : '}'
  let depth = 0
  let i = open
  while (i < text.length) {
    const ch = text[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      i = scanString(text, i)
      continue
    }
    if (ch === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      i = scanComment(text, i)
      continue
    }
    if (ch === openCh) depth++
    else if (ch === closeCh) {
      depth--
      if (depth === 0) return i
    }
    i++
  }
  return -1
}

/* The pieces between top-level commas; brackets, strings and comments
   protect the commas inside them. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      i = scanString(text, i)
      continue
    }
    if (ch === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      i = scanComment(text, i)
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
    i++
  }
  parts.push(text.slice(start))
  return parts
}

/* Re-indents a fragment: every non-blank line loses the first line's leading
   whitespace and gains `indent`. Lines that are string or comment contents
   pass through byte-for-byte — their whitespace is meaning, not layout. */
function reindent(text: string, indent: string): string {
  const lines = text.split('\n')
  const first = lines.findIndex((line) => line.trim().length > 0)
  if (first < 0) return ''
  const base = /^[ \t]*/.exec(lines[first])![0]

  // A line starting inside a string or block comment is contents.
  const literal = new Set<number>()
  let line = 0
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const end = scanString(text, i)
      while (i < end) {
        if (text[i] === '\n') literal.add(++line)
        i++
      }
      continue
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = scanComment(text, i)
      while (i < end) {
        if (text[i] === '\n') literal.add(++line)
        i++
      }
      continue
    }
    if (ch === '\n') line++
    i++
  }

  const out: string[] = []
  for (let k = first; k < lines.length; k++) {
    if (literal.has(k)) {
      out.push(lines[k])
      continue
    }
    if (lines[k].trim().length === 0) continue
    const body = lines[k].startsWith(base) ? lines[k].slice(base.length) : lines[k].trimStart()
    out.push(indent + body.trimEnd())
  }
  return out.join('\n')
}

/* The leading whitespace of the line `at` sits on. Block children indent
   from the line, not from mid-line call positions. */
function lineIndent(text: string, at: number): string {
  const start = text.lastIndexOf('\n', at - 1) + 1
  return /^[ \t]*/.exec(text.slice(start, at))![0]
}

class Blockifier {
  /* Copies `text`, rewriting convertible calls wherever they nest. */
  private rewrite(text: string): string {
    let out = ''
    let i = 0
    while (i < text.length) {
      const ch = text[i]
      if (ch === "'" || ch === '"' || ch === '`') {
        const end = scanString(text, i)
        out += text.slice(i, end)
        i = end
        continue
      }
      if (ch === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
        const end = scanComment(text, i)
        out += text.slice(i, end)
        i = end
        continue
      }
      if (ID_START.test(ch)) {
        const start = i
        while (i < text.length && ID_CHAR.test(text[i])) i++
        const word = text.slice(start, i)
        const open = scanBlank(text, i)
        if (text[open] !== '(') {
          out += word
          continue
        }
        const close = matchBracket(text, open)
        if (close < 0) {
          out += text.slice(start)
          break
        }
        const inner = text.slice(open + 1, close)
        const callable = word[0] >= 'A' && word[0] <= 'Z' && text[start - 1] !== '.'
        const block = callable ? this.blockify(word, inner, lineIndent(text, start)) : null
        out += block ?? text.slice(start, open + 1) + this.rewrite(inner) + ')'
        i = close + 1
        continue
      }
      if (ch === '(' || ch === '[' || ch === '{') {
        const close = matchBracket(text, i)
        if (close < 0) {
          out += text.slice(i)
          break
        }
        out += ch + this.rewrite(text.slice(i + 1, close)) + text[close]
        i = close + 1
        continue
      }
      out += ch
      i++
    }
    return out
  }

  /* `Name({ ... }, children...)` reads as a view with options and becomes a
     block; anything else returns null and stays a call. */
  private blockify(word: string, inner: string, pad: string): string | null {
    const args = splitTopLevel(inner)
    const first = args[0].trim()
    if (!first.startsWith('{') || matchBracket(first, 0) !== first.length - 1) return null

    const entries = splitTopLevel(first.slice(1, -1))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
    const options: string[] = []
    for (const entry of entries) {
      if (/^[A-Za-z_$][A-Za-z0-9_$]*\s*:/.test(entry)) options.push(entry)
      else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entry)) options.push(`${entry}: ${entry}`)
      else return null // a spread or computed key — leave the call alone
    }

    const lines = options.map((option) => `${pad}  ${option}`)
    for (const child of args.slice(1)) {
      const block = reindent(this.rewrite(child), `${pad}  `)
      if (block.length > 0) lines.push(block)
    }
    if (lines.length === 0) return `${word} {}`
    return `${word} {\n${lines.join('\n')}\n${pad}}`
  }

  run(): string {
    return this.rewrite(this.src)
  }

  constructor(private readonly src: string) {}
}

/**
 * Rewrites call-style JavaScript as block syntax — the view `dslToJs` is a
 * compiler for. Used by the gallery to show an example in either style.
 * Forgiving by design: unrecognised shapes pass through unchanged.
 */
export function jsToBlocks(source: string): string {
  return new Blockifier(source).run()
}
