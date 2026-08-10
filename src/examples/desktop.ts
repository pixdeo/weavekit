import type { Example } from './types'

export const desktop: Example = {
  id: 'desktop',
  title: 'Desktop shell (Tauri, Neutralinojs)',
  blurb:
    'A desktop shell is just a webview window around your Vite build, and ' +
    'WeaveKit draws into a plain canvas — so any shell hosts it as-is. Tauri 2 ' +
    '(Rust-based) and Neutralinojs (prebuilt binaries, no Rust toolchain) are ' +
    'the two lightweight Electron alternatives. The snippet shows Tauri; the ' +
    'notes cover both. Shown, not run: the gallery sandbox cannot launch a ' +
    'shell.',

  code: `VStack({ spacing: 12, align: 'leading' },
  Text('Same mount, any webview shell')
    .font({ size: 15, weight: 700 })
    .foreground('#fafafa'),
  Code(\`# scaffold Tauri onto your Vite app
npm create tauri-app@latest

# tauri.conf.json → build:
#   devUrl:       http://localhost:5173
#   frontendDist: ../dist

<div id="app"
     style="position:fixed;inset:0"></div>

mount(document.getElementById('app'),
      createCanvasBackend(), app)\`)
    .foreground('#7dd3fc')
    .padding(14)
    .background(RoundedRect(8).fill('#08080a')),
  Text('Neutralinojs works the same: point' +
       ' documentRoot at your Vite dist/ (or url' +
       ' at the dev server). No Rust toolchain' +
       ' — its binaries are prebuilt and tiny.')
    .font({ size: 12 })
    .foreground('#a1a1aa'),
  Text('Both use the OS webview — WKWebView,' +
       ' WebView2 or WebKitGTK — so canvas 2D,' +
       ' pointer events and DPR are all there.' +
       ' Nothing in the toolkit changes.')
    .font({ size: 12 })
    .foreground('#a1a1aa'),
  Text('The toolkit never evals, so a strict CSP' +
       ' in either shell is fine. Only the' +
       " gallery's live editor uses new Function —" +
       ' skip unsafe-eval unless you embed it.')
    .font({ size: 12 })
    .foreground('#a1a1aa'),
)`,
}
