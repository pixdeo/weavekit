# WeaveKit — npm usage example

A minimal consumer of
[`@pixdeo/weavekit`](https://www.npmjs.com/package/@pixdeo/weavekit): one page,
one `mount()`, a live counter. Text, buttons, shapes and the layout around
them are all toolkit views.

```bash
npm install
npm run dev      # http://localhost:5173
```

`npm run build` produces the static site in `dist/`.

## Trying a local build instead of the registry package

From the repo root, pack the library, then install the tarball here:

```bash
npm run build:lib && npm pack   # repo root → pixdeo-weavekit-0.0.1.tgz
npm install ../pixdeo-weavekit-0.0.1.tgz
npm run dev
```
