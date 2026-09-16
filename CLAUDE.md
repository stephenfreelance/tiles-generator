# Tessera

Frontend-only React + Vite app that turns a wall size, a tile size, a relief texture and a tile
color into printable 3D tiles (STL / STEP / zip). The browser does all the work: no backend, no
account, and no network calls at runtime. Designs persist in localStorage.

Live at https://tessera.stephenperrin.fr/ (a custom domain on GitHub Pages; the old
https://stephenfreelance.github.io/tiles-generator/ address redirects there), deployed by CI from
`main` of `git@github.com:stephenfreelance/tiles-generator.git` (see Deploy).

Read before working, in this order:

- `docs/architecture.md`: contracts, units, the module map and who owns which directory.
- `PRODUCT.md`: product truth. It also lists what may not be claimed (no testimonials, users, press,
  pricing or print photos exist, so never invent any).
- `.impeccable/surfaces/src-pages-studiopage-tsx.md` plus `src/styles/_tokens.scss`: the binding
  visual direction for anything with a surface.

The "Visual world" section of `docs/architecture.md` predates that brief and still describes the
retired drafting sheet: square corners, a 2px ink frame, expanded uppercase labels, red for the primary
action and chalk blue for focus. The brief replaced it with the maker workshop (espresso bar, rounded
warm panels, one accent for the primary action, selection and focus), and wherever the two disagree
the brief and the tokens win. That accent follows the tile color with an enforced contrast floor:
`accentPalette` in `src/core/accent.ts` keeps the color's hue and darkens it only as far as 6.5:1 on
`--panel` needs, and `src/app/useAccentTheme.ts` (called once in `AppShell`) writes it on the root
element from `config.color`, or from `useThemeColor`'s override while the home page's sample board
sets one. The `:root` defaults in `_tokens.scss` are that palette for `DEFAULT_COLOR`
(`src/styles/tokens.test.ts` holds them equal). The old token names (`--sheet`, `--desk`, `--chalk`,
`--pencil`, `--red` and friends) survive in `_tokens.scss` only as aliases onto the new palette; new
code uses the contract names above them.

## Gates

All four pass today. Run all four before calling work done, and keep them green.

```bash
npm run lint
npm run typecheck                      # tsc -b --noEmit over every project ref
npx tsc -p tsconfig.app.json --noEmit   # the app-only variant, useful while editing
npm test                               # vitest, a few seconds
npm run build                           # typecheck plus the production build
```

CI (`.github/workflows/ci.yml`) runs exactly these in its `check` job on push to main and on every
pull request, with `npm ci --ignore-scripts` and the Node version from `.nvmrc`. On main the same
workflow then deploys, so a red gate blocks the release.

## House rules

- **No new dependencies**, runtime or dev. If one is genuinely required, stop and say so in your
  report instead of installing it; the pins below are load-bearing.
- **No em-dash (U+2014) anywhere**: prose, code, comments, UI copy, docs, commit messages. Use a
  colon, parentheses or a hyphen.
- **`src/core` stays free of DOM and three imports.** It runs inside the Web Worker and in
  vitest's node environment, so a single `document` or `three` import breaks both.
- **Only edit the files you own.** `docs/architecture.md` carries the ownership map; files marked
  `[lead]` are read-only contracts. If one blocks you, describe the change you need in your report.
- English copy. Strict TypeScript, no `any`. Comments explain why, one line where possible.
- Node 22.22 or newer (react-router 8 requires it): `.nvmrc` and `engines` must agree.

## Pinned versions, and why

These two pins interlock. Bumping either one alone breaks the install or the build.

- `react` / `react-dom` **~19.2.8**: `@react-three/fiber` 9.x declares a peer range of React below
  19.3 (its bundled reconciler), so 19.3 breaks the install.
- `three` / `@types/three` **~0.186**: `postprocessing` 6.39 requires `three <0.187`.
- `typescript` **~6.0**: typescript-eslint supports `<6.1`.

## Rendering gotchas (three r186)

Verified against the installed versions. Each of these fails loudly or silently if ignored.

- `shadows="percentage"` on the Canvas. `PCFSoftShadowMap` is gone in r186 (three warns and falls
  back to PCF).
- Never drei `<SoftShadows>`: it fails to compile on r182+.
- Never `<Environment preset>`: it downloads HDRIs, which breaks the no-network promise. Build the
  studio from `<Lightformer>` children instead.
- `<EffectComposer multisampling={0}>` plus `<SMAA/>`: MSAA breaks N8AO.
- Tone mapping is Khronos Neutral on every tier. The composer forces `NoToneMapping` on the renderer
  while it is mounted, so `PostFx.tsx` runs `<ToneMapping mode={NEUTRAL}>` after N8AO (there is no Bloom
  pass), with only `<SMAA/>` after it. Tier 0 drops the composer and gets `NeutralToneMapping` on the renderer
  from `onCreated` in `TileViewport.tsx`. Change one side and the tiers stop matching.
- `DataTexture` needs an explicit `colorSpace`, explicit filters and `needsUpdate = true`.
- Every tuning constant of the preview (lights, environment, quality tiers 0 to 2, AO, camera, and
  the one matte material every tile color renders with) lives in `src/three/look.ts`.

## Motion on the home page

`motion` (13.2) is used on the landing route only, and `src/features/landing/LandingMotion.tsx` mounts it
there rather than in `AppShell`, so the studio, download and history routes download none of it. It runs
`LazyMotion strict`, which means **`motion.*` throws: use `m.*`**. Reduced motion is three separate
layers, and all three are needed: the `--t-*` tokens already collapse to 0 ms, `MotionConfig`'s
`reducedMotion="user"` only makes positional keys instant (opacity, filter and pathLength still animate,
so each needs `initial={false}` or its own branch), and style-bound values (`useSpring`, `animate()` on a
MotionValue) ignore `MotionConfig` entirely and need an explicit `useReducedMotion()` branch. Anything
gated on entering the viewport also needs a fallback for a jump scroll (a restored position,
find-in-page, the skip link): `CutPlanPanel` measures a rect on scroll, the odometers roll on a timer
if they are never seen. An entrance that can never run leaves content invisible, which is worse than
no animation at all.

## Known console output (all benign)

The console is otherwise clean, so treat anything else as a real regression.

1. `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.` on every route
   with a 3D view. Emitted by `@react-three/fiber`'s own store (`dist/events-*.esm.js`), not by app
   code. Silencing it means moving off the three / postprocessing pins above, so leave it.
2. `GL Driver Message (OpenGL, Performance, ...): GPU stall due to ReadPixels` on the first route with
   a 3D view (`/`, `/studio` or `/download`) that a headless Chromium opens, which is what the capture
   harness runs. Chromium's software GL backend logs it a few times per browser process, not app code,
   and the design review saw it too.
3. `THREE.WebGLRenderer: Context Lost.` once each time a route with a 3D view unmounts during
   client-side navigation (leaving `/`, `/studio` or `/download`), never on a full page load.
   `@react-three/fiber` calls `forceContextLoss()` when its Canvas unmounts, to hand the GPU context
   back, and three logs the loss. It is the cleanup working, so do not try to silence it.
4. Dev server only: Vite's `[vite] connecting...` / `connected.` and React's DevTools prompt.

## Deploy (GitHub Pages)

The `check` job gates every change. On a push to `main` (or a manual run of the workflow on `main`)
a `pages` job builds the site beside it, and `deploy` (`actions/deploy-pages`) publishes only once both
succeed. Pull requests never deploy. The repository setting Settings > Pages > Source must be
"GitHub Actions"; with Pages switched off, `configure-pages` fails the `pages` job.

The site is served at the root of the custom domain `tessera.stephenperrin.fr` (a CNAME record
to `stephenfreelance.github.io`, set in Settings > Pages > Custom domain). The build still takes its
base from Pages rather than assuming `/`, so the app keeps working if it ever moves back under a
sub-path, and that base is the easiest thing here to break:

- The `pages` job builds with `npm run build -- --base "$BASE_PATH/"`, taking the path from
  `actions/configure-pages`: empty on the custom domain, `/tiles-generator` without one. Only that
  job sets a base: dev, tests and `npm run preview` run at `/`.
- The base is baked in at build time, so adding, changing or removing the custom domain leaves the
  live build pointing at the old one (a blank page whose scripts are refused as `text/html`). Re-run
  the workflow on `main` (Actions > CI > Run workflow) right after touching that setting.
- The router's `basename` is `import.meta.env.BASE_URL` (`src/app/App.tsx`). `Link`, `navigate` and
  `useLocation().pathname` are relative to it, so keep writing `/studio`.
- A URL that leaves the router (the clipboard, `window.open`, `fetch`, a `public/` file referenced
  from TypeScript) must carry the base: use `useHref(path)`, as `CopyLinkButton.tsx` does, or prefix
  `import.meta.env.BASE_URL`. Never `location.origin + pathname` or a literal `/`.
- In `index.html` and SCSS, asset URLs are safe: Vite rewrites root-relative `href`, `src` and the
  inline `@font-face` `url()`. Any other attribute needs `%BASE_URL%`. The share metadata (`og:url`,
  `og:image`) is absolute on the domain instead, because scrapers do not resolve relative ones.
- Pages has no rewrites, so the `pages` job copies `dist/index.html` to `studio.html`, `download.html`
  and `history.html` (a deep link or a shared design answers 200) and to `404.html` for any other
  path, which lets `NotFoundPage` render under a real 404.

Adding a route touches four places: the children in `src/app/App.tsx`, `PAGE_TITLES` in
`src/app/AppShell.tsx` (without an entry the tab title reads "Not found · Tessera"), the fallback list
in the `pages` job, and `ROUTES` in `scripts/shots.mjs`.

Before pushing anything that builds or resolves URLs, run the build under a sub-path locally too: the
domain serves `/`, but a URL that forgets the base only shows itself under one.

```bash
npm run build -- --base /tiles-generator/
npx vite preview --base /tiles-generator/          # http://localhost:4173/tiles-generator/
npm run shots -- --url http://localhost:4173/tiles-generator
```

`vite preview` has its own SPA fallback, so it does not exercise the copied `.html` files. The build
also leaves a sub-path `dist/`; rebuild without `--base` before `npm run preview` at `/`.

## Persistence and share links

Everything read back from outside the running app (the persisted design, history entries, share
links) passes through `normalizeConfig` in `src/core/config.ts`, which rebuilds a valid `DesignConfig`
field by field. A new config field needs its default and its clamp there, or every loaded design
silently drops it.

- localStorage keys: `tessera.design.v1` (zustand persist version 1), `tessera.prefs.v1` (version 2,
  whose `migrate` drops the retired `mounting` key) and `tessera.history.v1` (at most 40 designs with
  WebP thumbnails; when storage is full it sheds the oldest thumbnails, then the oldest designs).
- Removing or renaming a persisted key needs a `version` bump and a `migrate`, as prefs v2 did. zustand
  5 discards stored state whose version differs when there is no `migrate`, so a bare bump loses every
  maker's saved state.
- The tile color is `config.color`, an uppercase `'#RRGGBB'` (presets and helpers in
  `src/core/colors.ts`). Designs saved before it held a filament id as `colorId`: `normalizeConfig`
  resolves `parseHex(color)`, then `LEGACY_COLOR_HEX[colorId]` (`src/core/legacyColors.ts`), then
  `DEFAULT_COLOR`, which is why that rename needed no store version bump. Keep the legacy read.
- A share link carries the whole design as `?d=`, a base64url positional tuple written by
  `src/app/designLink.ts`. Any change to that tuple needs a `VERSION` bump there (older links are then
  refused rather than misread) and a case in `designLink.test.ts`. `VERSION` is `'2'` (slot 18 holds
  the hex); version `'1'` links are still read, their slot 18 passed to `normalizeConfig` as the legacy
  `colorId`, and any other version is refused.

## Testing policy

Unit tests cover pure logic only, and that is deliberate. `vite.config.ts` sets
`environment: 'node'` and `include: ['src/**/*.test.ts']`, so a test can reach any module that needs
no DOM or WebGL context. `src/core`, `src/workers` and `src/state` hold most of them (the layout,
textures, meshing, the exporters and the data boundaries), and pure helpers elsewhere have their own:
link encoding in `src/app`, LOD and chip caching in `src/hooks`, colour, shader and wave maths in
`src/three`, field parsing and color-wheel maths in `src/ui`, sizing, plan fixes and the landing
samples in `src/features`, and the accent defaults in `src/styles`. Component behaviour is verified in a real browser instead of jsdom, which
would need a new devDependency.

Note the `.ts`-only glob: a `*.test.tsx` file is silently ignored rather than failing.

Browser checks and every shipped raster go through the capture harness, which is why playwright is
a devDependency. Its default base URL is port **5184**, not Vite's 5173:

```bash
npm run dev -- --port 5184 --strictPort   # in another terminal
npm run shots                              # all four routes, desktop and mobile, to test-output/shots
npm run shots -- --motion                  # the same eight, animations running, to test-output/shots-motion
npm run shots -- --og                      # regenerate public/og-cover.png (1200x630 share card)
npm run shots -- --icons                   # regenerate public/apple-touch-icon.png
npm run shots -- --hero-poster             # regenerate public/hero-poster.webp (the landing's LCP image)
npm run shots -- --url http://localhost:4173   # point at `npm run preview` instead
```

The default eight shots append `?still=1`, which `LandingMotion` reads to set Motion's `skipAnimations`,
so a capture lands on the final frame instead of a random one. `--motion` drops the flag, which is the
only way to photograph the home page's motion at all. Regenerate the hero poster whenever the board's
look, its wall or its default sample changes: it is the still the landing paints while the 3D chunk
downloads, so a stale one makes the handover to the live canvas jump.
