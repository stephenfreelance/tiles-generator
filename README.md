# Tessera

Tessera turns a wall size, a tile size, a relief texture and a tile color into a ready-to-print set of 3D-printable tiles. It computes how many full tiles fit, generates the cut pieces needed to cover the rest, previews the whole surface and a single tile in 3D, and exports every unique piece as STL or STEP.

Everything runs in the browser: no account, no backend, no upload. Designs live in localStorage.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # typecheck + production build
npm test           # vitest (layout, textures, meshing, exporters, plan, estimates)
npm run lint
npm run typecheck
```

Node 22.22 or newer (react-router 8 requires it). `.nvmrc` and the `engines` field carry the same version, and CI reads `.nvmrc`.

## What it does

- **Fit.** `computeLayout` places the tile grid from a corner, centered, or balanced (the tiler's rule that avoids slivers), with an optional joint width and a running bond of a half or a third. Every piece that is not a full tile is a cut of one, carrying the exact slice of pattern it replaces, so the relief runs on across every joint.
- **Relief.** 24 seamless textures (plane, wavy, stripes, coral, herringbone, fluted, zellige, and 17 more). Each is a height field that repeats a whole number of times across a tile, so tiles meet themselves at every edge. Printed face up, so nothing needs supports.
- **Preview.** react-three-fiber: a raking key light that reveals the relief, a studio environment built from light cards (no downloaded assets), ambient occlusion, one matte PLA look in any color (11 presets, a color wheel or a hex code) and optional FDM layer lines. Tiles re-lay from the setting-out corner when the layout changes.
- **Files.** Binary STL, or STEP written directly as an AP214 solid (validated in OpenCascade), one model per unique piece, zipped with the setting-out plan as SVG and a README of print settings.

## Layout

```
src/core      pure TypeScript, no DOM and no three.js: layout, textures, geometry, exporters, plan, estimates
src/workers   the geometry worker and its client
src/hooks     preview meshes, texture chips, volumes, export
src/three     the 3D preview (look.ts holds every tuning constant)
src/ui        the design system
src/pages     landing, studio, download, history
src/features  page-specific composition
src/state     zustand stores: the design, prefs and history persisted to localStorage, and the unpersisted accent override
```

`docs/architecture.md` carries the contracts, units and conventions. `PRODUCT.md` carries product truth, and `.impeccable/surfaces/` the visual direction.

## Deploy

Tessera is live at <https://tessera.stephenperrin.fr/>, published to GitHub Pages from `main` under a custom domain (a DNS `CNAME` record from `tessera.stephenperrin.fr` to `stephenfreelance.github.io`, entered in **Settings > Pages > Custom domain**). The project address <https://stephenfreelance.github.io/tiles-generator/> redirects there.

`npm run build` writes a static site to `dist/`. There is nothing else to run: no server, no environment variables, no build-time secrets.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and the build on pushes to `main` and on every pull request, installing with `npm ci --ignore-scripts` and the Node version from `.nvmrc`. On `main` (a push, or a manual run of the workflow) a `pages` job builds the site beside those gates and `deploy` publishes it once both are green, so a failing gate never ships. The repository needs **Settings > Pages > Source: GitHub Actions**, set once.

Three things the host has to get right:

- **Base path.** The `pages` job builds with `npm run build -- --base "$BASE_PATH/"`, where the path comes from `actions/configure-pages`: empty on the custom domain, `/tiles-generator` on a bare project site. Vite rewrites the URLs in `index.html` and the CSS, and the router takes its `basename` from `import.meta.env.BASE_URL`. Everywhere else the base stays `/`. The base is fixed at build time, so **re-run the workflow on `main` after adding, changing or removing the custom domain**: until then the live page still asks for its scripts under the old path, gets the HTML 404 page back and stays blank. To try a sub-path build locally, run `npm run build -- --base /tiles-generator/ && npx vite preview --base /tiles-generator/` and open <http://localhost:4173/tiles-generator/>.
- **SPA fallback.** The router uses real paths, so `/studio`, `/download` and `/history` must serve `index.html` instead of the host's 404. `public/_redirects` does this on Netlify-style hosts. GitHub Pages has no rewrites, so the `pages` job copies `index.html` to `studio.html`, `download.html` and `history.html` (Pages answers `/studio` from `studio.html`, with a 200) and to `404.html`, which boots the app for any other path; a new route belongs in that list. S3 and nginx need their own rewrite. Existing files must still win, so `/assets/*` and `/fonts/*` keep being served directly.
- **Crawlable assets.** The page is client-rendered, so `public/robots.txt` deliberately allows `/assets/`. Blocking it leaves a crawler with an empty page. Crawlers only read `robots.txt` at the root of a host, which the custom domain now is.

`index.html` carries the share metadata. The canonical URL is written from the address the page is served at, while `og:url` and `og:image` are absolute on `https://tessera.stephenperrin.fr/`, because social scrapers refuse relative ones and do not run scripts. Regenerate the share card with `npm run shots -- --og` after a visual change.

## Contributing

Start with `CLAUDE.md`: it holds the gate commands, the house rules (no new dependencies, no em-dashes, `src/core` stays free of DOM and three imports) and the non-obvious gotchas, including why `react` and `three` are pinned where they are, which console messages are benign, and how the GitHub Pages sub-path constrains URLs. Then `docs/architecture.md` for the contracts and the ownership map, `PRODUCT.md` for what the product may claim, and `.impeccable/surfaces/` for the visual direction.

All four gates pass on `main` and a change is expected to keep them passing:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Tests run in vitest's node environment and cover `src/core`, `src/workers` and `src/state`: the pure logic and the data boundaries. Component behavior is checked in a real browser instead of jsdom, through the capture harness, which defaults to port 5184:

```bash
npm run dev -- --port 5184 --strictPort   # in another terminal
npm run shots                              # every route, desktop and mobile, into test-output/
```

## Notes

- Color presets are Tessera's own names and hex values, not any manufacturer's catalog: print them in whatever PLA comes closest.
- Filament weights are estimates from solid volume, a fill range and one PLA density (1.24 g/cm3); your slicer knows better.
- The front page ports two components from React Bits and takes the idea of two more. `public/THIRD-PARTY-NOTICES.txt` carries their license and names the files; it ships at the root of the built site.
- A saved design keeps a WebP thumbnail of the preview. When localStorage is full, the newest save is kept and the store sheds the oldest thumbnails first, then the oldest designs, rather than reporting a save that did not land.
