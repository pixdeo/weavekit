import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Library build: bundles src/index.ts into a single ESM file for the npm
// package, independently of the gallery build (which uses vite.config.ts).
// `npm run types` emits the matching .d.ts files into the same dist-lib/.
export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: 'weavekit',
    },
    outDir: 'dist-lib',
    emptyOutDir: true,
    target: 'es2022',
    // Keep the published code readable — this is a teaching toolkit.
    minify: false,
  },
})
