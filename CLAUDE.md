# Tessera

Frontend-only React + Vite app that turns a wall size, a tile size, a relief texture and a tile
color into printable 3D tiles (STL / STEP / zip), with optional edge profiles, keys or moulded tabs that
lock tiles edge to edge and printed wall clips each tile clicks onto (the download then adds their printed
parts and a step-by-step guide, and `/fit-test` prints and zips the fit test on its own). The browser does all the work: no backend, no account, and no
network calls at runtime but one, the anonymous GoatCounter count (see Analytics). Designs persist in localStorage.

The 3D preview (`src/three`, react-three-fiber) lives on `/studio` and `/download` only. The home page
builds its wall (`src/features/landing/HeroWall.tsx` over `wallGrid.ts` and `useTextureChips`) out of
the same CPU-rendered relief chips as section 01's corner proof (`JointProof`), so it downloads no
three.js at all: one chip per unique piece covers a wall of any size.

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
- **The tile mesher stays out of the main thread.** Outside `src/core` and `src/workers`, never import
  `buildPieceMesh`, `buildCouponMesh`, `buildAccessoryMesh` or anything from `geometry/solid`: one such
  import ships the whole mesher in the studio's own chunk. The Back view builds its seated clips and keys
  through `partMesh` (`src/three/seatedSet.ts`), and `seatedSet.test.ts` walks the tree and fails on a
  stray import.
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
- Every tuning constant of the preview (lights, environment, quality tiers 0 to 2, AO, camera, the
  single tile's turn to its Back view, the one matte material every tile color renders with, and the
  neutral the seated keys and clips take in the Back view, `partColor`: ink on a light tile, the panel
  color on a dark one, never the accent) lives in `src/three/look.ts`.

## Motion on the home page

`motion` (13.2) is used on the landing route only, and `src/features/landing/LandingMotion.tsx` mounts it
there rather than in `AppShell`, so the studio, download and history routes download none of it. It runs
`LazyMotion strict`, which means **`motion.*` throws: use `m.*`**. Reduced motion is three separate
layers, and all three are needed: the `--t-*` tokens already collapse to 0 ms, `MotionConfig`'s
`reducedMotion="user"` only makes positional keys instant (opacity, filter and pathLength still animate,
so each needs `initial={false}` or its own branch), and style-bound values (`useSpring`, `animate()` on a
MotionValue) ignore `MotionConfig` entirely and need an explicit `useReducedMotion()` branch. Anything
gated on entering the viewport also needs a fallback for a jump scroll (a restored position,
find-in-page, the skip link): `useReached` in `LandingPage.tsx` measures each band's rect on scroll, the
odometers roll on a timer if they are never seen, and the bands' lay-in entrances start lower and at
0.3 opacity, never hidden. An entrance that can never run leaves content invisible, which is worse than
no animation at all.

## Analytics (GoatCounter)

The live site counts usage with GoatCounter, and that count is the app's only network call. `src/app/analytics.ts`
speaks GoatCounter's `/count` protocol itself (no `count.js`, no dependency) and holds the whole catalogue: the
screens (`SCREENS`), the fixed events (`EVENTS`) and the events named after a choice (`CHOICES`: `studio-edit-*`,
`fit-test-chose-*`, `zip-*`). `useAnalytics` (mounted once in `AppShell`) counts each screen; pages call `track`,
`trackChoice`, `trackZip` or `trackDownloadFailure` at the moment an action succeeds.

- **Never send a design's name, a measurement, a color hex, free text, an error message or the `?d=` link.**
  Screens go through `screenPath` (an unknown path is `/not-found`, never the path typed), the first view's query
  through `campaignQuery` (campaign parameters only), sizes only as `tileBand`, colors only as a preset name or
  `custom`. `analytics.test.ts` holds these. The home page's "Does anything leave my computer?" answer, PRODUCT.md
  and the README describe exactly what is sent: a new kind of data needs all three reworded, or it cannot ship.
- A new event goes in `EVENTS` or `CHOICES` (lower case, hyphens, never a leading `/`). Something done over and
  over (an edit, a view switch) takes `{ once: true }`, one count per visit.
- Counting is off unless the build sets `VITE_GOATCOUNTER`, which only the `pages` job does (from the repository
  variable `GOATCOUNTER`), so dev, tests, `npm run preview`, the capture harness and forks send nothing. It is also
  off on a local host, in a frame, under Do Not Track or Global Privacy Control, and in a browser switched off by
  opening any page with `#toggle-goatcounter` (GoatCounter's own switch, kept under its `skipgc` localStorage key).
- Studio edits are counted in `useStudioUpdate` (`countedEditor`), so load, undo, redo and share links, which go
  around it, are never counted as edits. `editedArea` names the area touched cause first: a wall that carries its
  Recommended tile is a wall edit, a lock that raises the base is a lock edit.

## Keys, tabs, wall clips and the guide

`docs/architecture.md` ("Fixings") has the rules; these are the ones that bite.

- The default design is frozen: with `perimeter.profile 'none'`, `lock 'none'`, `mount 'glue'` and
  `jointEdge 'chamfer'`, every piece id, mesh, file name, README and zip stays what it was before edges
  and fixings existed. Keep it so.
- The "Putting it up" steps have one source, `src/core/fixing/guide.ts`: the download page renders
  `mountingGuide`, the README numbers the same steps, and studio step 7's "You'll do" shows
  `mountingSummary`, word for word. Word a step there and nowhere else.
- Describe what the plans place, never the switches: `fixingSystem` (guide.ts), `keysPossible` /
  `tabsPossible` / `clipsPossible` (`src/core/fixing/capability.ts`) and `explainMounting` (the studio's
  step 7), not `config.lock` or `config.mount`. A lock or clips asked for on a thin plate, keys on a wall
  with no joint long enough, tabs on a joint too wide to hide one or on a wall whose pieces are too narrow
  for a socket, or clips on tiles too small for a pocket place nothing, and the wall is glued.
- Marks: C1 is the wall clip file, K1 the key file, F1, F2... the fit test in print order (coupons, then
  clips, then keys). The tabs print no file at all, so they have no mark. Wall clips are never set out on
  the wall, and neither is a tab: each tile carries its own, so nothing is measured or drawn for either;
  the start line (the bottom edge of the tiles) is the only line drawn.
- Count tiles on the wall, never printed files: one piece id is one file and any number of tiles, so the
  pieces with no clip are counted over `plan.placements`, not over `unmountedPieceIds`. Claim a per-tile
  clip count ("2 in each whole tile") only while every whole tile really carries it, "up to N" otherwise.
- Say the real cause: on small locked tiles it is the key slots or the sockets, not the size, that leave no
  room for a clip (the same piece takes one with the lock off, `recessesBlock`, whose `recessWord` picks the
  word), and then "Leave the keys out" or "Leave the tabs out" is the fix worth offering. `clipSites` searches for a height, and a turned clip for a place across, before it
  gives up, so a piece it leaves out really has no room.
- Which pieces with no clip take a drop of glue in their key slots and which are glued to the wall is
  `guide.ts`'s `noClipStep` split, piece by piece: the studio's well, the plan note and the download
  page's note all copy it, so the maker is never sent two ways.
- A tab is cut ONLY where the layout has found the tile beside it able to hold the socket: an unmated tab
  bears on that tile's back plate and stands it off the wall, which no maker can recover from. The rule is
  the layout's alone (`PieceEdges.tabs`, the one field read off the neighbours) because a piece cannot see
  its neighbour, and it is a width test against `socketWidth(config)`, which adds the reach of a border
  profile that drops to the rim: `notchSites` refuses a socket under a drop, so the layout has to refuse
  the tab facing it. `tabbedWall.test.ts` walks every wall, profile and bond and holds the pair mated.
- With the tabs on, Fit reshapes every tile: the socket is cut into the plate, so `geometryKey` includes
  `config.fit` for the tabs and for nothing else, and the fit test is printed BEFORE the tiles. That is the
  one exception to `PRODUCT.md`'s promise that a wrong fit never costs a tile, and it is said in the card
  note, the Fit note, the fit step, the README and PRODUCT.md, nowhere else.
- The printed box of a tabbed tile is `tabLimits(config).projection` (8 mm at the default joint) wider than
  the tile, and only two things may follow it: the bed check (`layout.ts`, `fitsBed`, `tileOptions.ts`) and
  the plate count (`piecesPerPlate` from `estimate.ts`, which halves a 120 mm tile on a 256 mm bed). Every
  other number stays the NOMINAL tile: the plan's dimension chains, the file name's WxH, the README's
  MODELS size, the schedule table, `PieceFilament`. Never make `piece.width` the printed box.
- Nothing locks one row to the next: a tab wall is one rigid strip per row, always, by design. State it;
  never report it as a fault, and keep `keyCoverageNote` gated on `keysPossible` so it can never fire for
  the tabs (it would call the row count a defect on every tab wall that exists).
- A tab wall cannot be laid face down as a panel and hung, the way the keyed guide does it: face down the
  sockets open away from the bench and a head never passes a throat sideways. Tiles go up one at a time,
  left to right along each row, which is the order the tiling plan already sets out.
- Coming apart is the reverse, and the geometry is why: a tile lifts its own socket off the tab beside it
  freely, but its own tab sits under the neighbouring socket's bridged ceiling with only `KEY_RECESS`
  (0.4 mm) above it, so it cannot rise past that ceiling while the tile to its right is up. A row comes off
  from its right-hand end and goes back on left to right (`TAB_OFF` in guide.ts, used by the step on taking
  a tile off and by the screws step). Never write that a tabbed tile pulls straight off on its own.
- A part's print advice and its weight come from one table, `src/core/printSettings.ts`
  (`partPrintNote`): never write a part's walls or infill by hand.
- Copy: keys and tabs alike lock tiles edge to edge in the plane of the wall, in line with even joints;
  the wall or the clips keep them flat, and the tabs make that promise in the keys' own words. There is no
  click in a tab and the copy must not imply one: it is rigid, and pressing the tile onto the wall is the
  whole engagement. A tile on clips has "only tape behind" it (it sits a tape's thickness off the
  wall): never "no gap", never "flush" or "flat panel", no strength, hold, load or timing figure, and
  bought hardware named generically ("thin double-sided tape", "a 5 mm wall plug").
- The clip's stops are permanent: clicked in, a clip rests on them with its back level with the tile's
  back, on the wall or off it. No step ever breaks anything off a clip.
- The clip's tines stay under the 2 % strain limit over every fit and every ceiling droop
  (`mechanism.test.ts`, worst 1.69 % clicked in off-centre at the snug fit, with 0.2 % of margin held):
  anything that stiffens a tine (wider, thicker, shorter) or adds fold (a bigger catch) fails it.

## Known console output (all benign)

The console is otherwise clean, so treat anything else as a real regression.

1. `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.` on every route
   with a 3D view (`/studio` and `/download`; the home page has none). Emitted by `@react-three/fiber`'s own store (`dist/events-*.esm.js`), not by app
   code. Silencing it means moving off the three / postprocessing pins above, so leave it.
2. `GL Driver Message (OpenGL, Performance, ...): GPU stall due to ReadPixels` on the first route with
   a 3D view (`/studio` or `/download`) that a headless Chromium opens, which is what the capture
   harness runs. Chromium's software GL backend logs it a few times per browser process, not app code,
   and the design review saw it too.
3. `THREE.WebGLRenderer: Context Lost.` once each time a route with a 3D view unmounts during
   client-side navigation (leaving `/studio` or `/download`), never on a full page load.
   `@react-three/fiber` calls `forceContextLoss()` when its Canvas unmounts, to hand the GPU context
   back, and three logs the loss. It is the cleanup working, so do not try to silence it.
4. Dev server only: Vite's `[vite] connecting...` / `connected.` and React's DevTools prompt, and on
   the home page under a reduced-motion setting (real or emulated by the harness) Motion's own
   `You have Reduced Motion enabled on your device. Animations may not appear as expected.`

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
- Pages has no rewrites, so the `pages` job copies `dist/index.html` to `studio.html`, `download.html`,
  `fit-test.html` and `history.html` (a deep link or a shared design answers 200) and to `404.html` for
  any other path, which lets `NotFoundPage` render under a real 404.

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
silently drops it. The edges and fixings fields (`jointEdge`, `perimeter`, `lock`, `mount`, `fit`) came
in that way with no store version bump: a design saved before them loads with `DEFAULT_CONFIG`'s values,
every one of them off, except that a saved 0 mm edge (`bevel: 0`) loads as a `'square'` joint edge, which is
what it printed.

- localStorage keys: `tessera.design.v1` (zustand persist version 1), `tessera.prefs.v1` (version 2,
  whose `migrate` drops the retired `mounting` key) and `tessera.history.v1` (at most 40 designs with
  WebP thumbnails; when storage is full it sheds the oldest thumbnails, then the oldest designs). `skipgc`
  (`'t'`) is GoatCounter's own opt-out key, not persisted state (see Analytics).
- Removing or renaming a persisted key needs a `version` bump and a `migrate`, as prefs v2 did. zustand
  5 discards stored state whose version differs when there is no `migrate`, so a bare bump loses every
  maker's saved state.
- The tile color is `config.color`, an uppercase `'#RRGGBB'` (presets and helpers in
  `src/core/colors.ts`). Designs saved before it held a filament id as `colorId`: `normalizeConfig`
  resolves `parseHex(color)`, then `LEGACY_COLOR_HEX[colorId]` (`src/core/legacyColors.ts`), then
  `DEFAULT_COLOR`, which is why that rename needed no store version bump. Keep the legacy read.
- The tile-to-tile lock is `config.lock`, a `LockKind` (`'none' | 'keys' | 'tabs'`). It replaced the
  `joins: boolean` the keys shipped with, and the field was RENAMED rather than retyped on purpose: `'none'`
  is truthy, so `if (!config.joins)` would still compile and would silently cut key slots into a side-by-side
  design. `legacyLock` in `src/core/config.ts` reads a stored `joins` boolean (`true` -> `'keys'`, `false` ->
  `'none'`), so that rename needed no store version bump either, exactly as `colorId` to `color` did not.
  Keep the legacy read: every saved design and every version 3 share link still arrives with `joins`.
- A share link carries the whole design as `?d=`, a base64url positional tuple written by
  `src/app/designLink.ts`. Any change to that tuple needs a `VERSION` bump there (a version with no
  read path is refused rather than misread) and a case in `designLink.test.ts`. `VERSION` is `'4'`:
  slots 0 to 19 are the version, name, surface, unit, tile, joint, bevel, layout, texture, the color
  hex (slot 18) and the printer, slot 20 the texture parameters, and slots 21 to 30 the edges and
  fixings (joint edge, perimeter profile, sides mask, width, drop, fade, land, the lock, mount, fit).
  Slot 28 carries the `LockKind` by name; version `'3'` wrote a keys boolean (`'1'` / `'0'`) there, which
  is why the bump was needed (a version 3 reader would take `'tabs'` for `'0'` and open a locked wall as a
  side-by-side one), and `edgesFrom` keeps the version 3 read path, handing slot 28 to `normalizeConfig`
  as the legacy `joins` instead. Slot 29, the mount, carries `'glue' | 'clips'` through `normalizeConfig`,
  which reads any other value (a stray `'rails'` from the unshipped wall rails included) as `'glue'`, and
  it reads an unknown lock name the same way, as `'none'`. Version `'2'` links (slots 0 to 20) load with
  the edges and fixings at their defaults, version `'1'` links the same way with slot 18 passed to
  `normalizeConfig` as the legacy `colorId`, and any other version is refused.

## Testing policy

Unit tests cover pure logic only, and that is deliberate. `vite.config.ts` sets
`environment: 'node'` and `include: ['src/**/*.test.ts']`, so a test can reach any module that needs
no DOM or WebGL context. `src/core`, `src/workers` and `src/state` hold most of them (the layout,
textures, meshing, the fixings with the clip's mechanism, the tab and socket section and the seated parts,
a real tabbed wall through the layout and the mesher (`tabbedWall.test.ts`), the guide, the exporters,
the data boundaries and the peek store), and pure helpers elsewhere have their own: link encoding in
`src/app`, LOD, chip caching and the preview request in `src/hooks`, colour, shader, wave and tile-flip
maths and the seated parts' set in `src/three`, field parsing and color-wheel maths in `src/ui`, sizing,
plan fixes, step 6's helpers, the step-7 copy, the fit summary, the tile's back, the zip contents, the
heavy-download rule, the drawings' and the tile-back figure's geometry and the landing samples in
`src/features`, and the accent defaults in `src/styles`. Component behaviour is verified in a real browser instead of jsdom, which
would need a new devDependency.

Note the `.ts`-only glob: a `*.test.tsx` file is silently ignored rather than failing.

Browser checks and every shipped raster go through the capture harness, which is why playwright is
a devDependency. Its default base URL is port **5184**, not Vite's 5173:

```bash
npm run dev -- --port 5184 --strictPort   # in another terminal
npm run shots                              # all five routes, desktop and mobile, to test-output/shots
npm run shots -- --motion                  # the same ten, animations running, to test-output/shots-motion
npm run shots -- --og                      # regenerate public/og-cover.png (1200x630 share card)
npm run shots -- --icons                   # regenerate public/apple-touch-icon.png
npm run shots -- --url http://localhost:4173   # point at `npm run preview` instead
```

The default ten shots append `?still=1`, which `LandingMotion` reads to set Motion's `skipAnimations`,
so a capture lands on the final frame instead of a random one. `--motion` drops the flag, which is the
only way to photograph the home page's motion at all. `?still=1` reaches Motion only: the hero wall's
lay-in and its light are plain CSS, and `SETTLE_MS` in the harness is what waits those out.

Regenerate `public/og-cover.png` (`npm run shots -- --og`) whenever the hero changes: the share card is
a photograph of the first screen, so a stale one shows the old one.
