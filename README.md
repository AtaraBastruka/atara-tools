# Atara Tools

A small, growing catalog of browser-based utilities — image cropping, SVG
to PNG/WebP conversion, secret generation, and more to come. Built with
Next.js (App Router), TypeScript, and Tailwind CSS, and deployed as a
static site.

## Privacy

Every tool runs **entirely client-side**. No file, image, or generated
value you work with in this app is ever sent over the network:

- No backend, no API routes, no database.
- No accounts, no auth, no cloud storage. This is not a vault.
- No analytics in v1 (see [Analytics](#analytics) below for the seam left
  for later, if it's ever added).
- Anything a tool "remembers" (e.g. a short recents list) lives in your
  browser's `localStorage` only, and is documented per-tool in-app.

## Getting started

```bash
npm install
npm run dev       # http://localhost:3000
npm run build      # static export to ./out
npm run lint
npm run typecheck
npm test           # vitest run
```

This project uses `next.config.ts`'s `output: 'export'`, so `npm run build`
produces a fully static `out/` directory with no Node server required at
runtime (suitable for any static host, deployed here on Vercel).

## Adding a tool

Tools follow one explicit convention — no auto-discovery magic:

1. Create a folder under `src/tools/<slug>/` with:
   - `manifest.ts` — exports a `ToolManifest` (`slug`, `title`,
     `description`, `category`).
   - `Tool.tsx` — a default-exported React component. It renders inside a
     shared `ToolShell` (title/description/action bar) and owns its own
     content area fully — no imposed API beyond that.
2. Add one entry to `src/lib/tools-registry.ts`'s `TOOLS` array, loading the
   tool via a **literal** dynamic `import()` path (never interpolate a slug
   into `import()` — that keeps the module graph closed to arbitrary
   strings and keeps each tool's JS in its own chunk, unfetched until a
   user opens it).
3. The tool's category appears in the catalog/nav automatically once it has
   at least one tool; categories with zero tools never render.

That's it: **one new folder + one registry line** turns a tool on.

## Analytics

There is no analytics code in this project. If it's ever added, the
intended seam is the root layout (`src/app/layout.tsx`) — an additional
child in `<body>`, gated behind an explicit opt-in/env flag — so it can be
added without touching any tool or shell code.

## Tech stack

- [Next.js](https://nextjs.org/) (App Router) + TypeScript + Tailwind CSS
- Static export (`output: 'export'`), deployed on [Vercel](https://vercel.com/)
- [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) for unit/component tests
- GitHub Actions CI: lint, typecheck, unit tests, build — on every PR

## License

[MIT](./LICENSE)
