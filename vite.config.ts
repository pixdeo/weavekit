import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'esnext',
  },
  // The gallery is also published to GitHub Pages under /weavekit/, which
  // needs that prefix baked into the built asset URLs. Local `vite dev` and
  // `vite build` keep the default '/'.
  base: process.env.GH_PAGES === 'true' ? '/weavekit/' : '/',
})
