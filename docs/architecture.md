# Tessera architecture

Frontend-only app (no backend). The browser computes the layout, generates tile meshes (and the meshes of any printed parts: keys, wall clips and the fit test; the tabs print nothing, since they are built into the tiles) in a Web Worker, renders the preview with react-three-fiber, and writes STL / STEP / zip files locally. Designs persist in localStorage.

## Stack and pins

| Package | Version | Why pinned |
|---|---|---|
| react, react-dom | ~19.2.8 | @react-three/fiber 9.x bundles a reconciler capped at `<19.3` |
| three, @types/three | ~0.186.0 | postprocessing 6.39 requires `three <0.187` |
| @react-three/fiber / drei / postprocessing | 9.7 / 10.7.8 / 3.1.1 | |
| react-router | ^8.3 | import everything from `react-router` |
| zustand | ^5 | stores with `persist` |
| fflate | ^0.8 | zip in the worker |
| radix-ui | ^1.6 | accessible primitives (import from `radix-ui`, e.g. `import { Tooltip } from 'radix-ui'`) |
| motion | ^13 | UI motion (`motion/react`) |
| lucide-react | ^1.45 | icons (one stroke family) |
| typescript | ~6.0 | typescript-eslint supports `<6.1` |
| vitest | ^5 | node environment, tests next to modules as `*.test.ts` |
| occt-import-js (dev) | 0.0.23 | parses our STEP output in tests |

Do not add dependencies. If one is truly required, say so in your report instead.

Rendering gotchas (verified against the installed versions): use `shadows="percentage"` (PCFSoftShadowMap is gone in r186), never drei `<SoftShadows>` (fails to compile on r182+), never `<Environment preset>` (downloads HDRIs; use `<Lightformer>` children), `EffectComposer multisampling={0}` + `<SMAA/>` (MSAA breaks N8AO) and end the chain with `<ToneMapping mode={NEUTRAL}>` because the composer forces `NoToneMapping` (the chain is N8AO, ToneMapping, SMAA; there is no Bloom pass). DataTextures need explicit `colorSpace`, filters and `needsUpdate`.

## Units and coordinates

- Every length is millimetres. Display units (mm/cm/m) are a UI concern (`src/core/units.ts`).
- Surface coordinates: origin bottom-left, x right, y up.
- Sides: `Side` numbers the sides of a piece, and of the whole surface, in the order the mesher walks its walls: 0 bottom (y = 0), 1 right, 2 top, 3 left. `src/core/sides.ts` holds the names in that order (`SIDE_NAMES`) and the bit masks (`sideBit`, `hasSide`, `sidesMask`, `sidesFromMask`).
- Tile-local / piece-local: a piece spans `(0..width, 0..height)`, z up, bottom face at z = 0, base plate top at `z = tile.thickness`, relief above it up to `thickness + texture.depth`. A raised frame profile stands higher, to `resolvePerimeter(config).Zf = thickness + depth + frame height` (4 mm more at most). The pockets in the back of a tile (`BackFeature`) use the same frame, z from the bottom face, and so does the one feature that adds material instead of cutting it: a tab standing out past the piece's right side line, whose printed box reaches `tabLimits(config).projection` past `width`.
- Pattern coordinates: a cut piece with crop `{x0,y0,x1,y1}` samples the height field at `(x0 + x, y0 + y)`. Because the field is periodic over the tile (or tile / row-shift cycle), a cut piece carries exactly the slice of pattern of the tile it replaces, so the relief is continuous across every joint.
- Printed parts: an `AccessorySpec.size` is the part's bounding box as printed (x, y on the bed, z up), and its mesh sits on the bed at z = 0, laid from the origin (its centre is the middle of that box). The wall clip's working section (`core/fixing/mechanism.ts`) has two frames that share x (along the clip) and y (across the catch): the clip's own, z up from its back (the face on the wall, printed on the bed), and the tile's, z up from the tile's back. A clip clicked into its pocket has its back level with the tile's back, so the two meet at z = 0 (a drooping pocket ceiling stands it proud by the droop).
- Seated parts (`core/fixing/seated.ts`): piece-local x, y of the part's box centre, z of its bottom face in the tile frame (the tile's back is z = 0), and whole quarter turns about z from the part as printed.
- three.js preview: the whole-wall view stands the surface upright (stage `'wall'`, print z toward the viewer); the single-tile view lays the tile face up on the bench (stage `'floor'`, `rotation-x = -π/2`, `src/three/stage.ts`), and its Back view turns it over about its upright axis, lifted so no corner (and no key standing out past a side, and no tab) dips through the floor (`src/three/flip.ts`). Scene units are mm.

## Module map and ownership

```
src/
  core/                 pure TypeScript, no DOM, no three: runs in the worker and in vitest
    types.ts            domain model (DesignConfig, PieceSpec, PieceEdges, LayoutPlan, MeshData)  [lead]
    units.ts config.ts layout.ts printers.ts colors.ts                                  [lead]
    sides.ts            Side names, order and bit masks                                    [lead]
    legacyColors.ts     retired filament id -> hex, read only by normalizeConfig          [lead]
    accent.ts           accent palette from the tile color, with its contrast floors
    textures/           height-field patterns                                            [textures]
      types.ts          TextureDef / ParamDef / HeightField contract                     [lead]
      noise.ts          seeded PRNG + periodic noise
      patterns/*.ts     one file per texture (or small groups)
      registry.ts       TEXTURES, textureById, resolveParams, createHeightField
      hillshade.ts      CPU relief swatch renderer (chips), tinted with the tile color; shaped by topShaper
    geometry/           watertight tile meshes, and the primitives the printed parts are built from [mesh]
      profiles.ts       the top's edges: joint edge, perimeter profile, topShaper, grid breaks
      heightfield.ts    top-surface sampling per piece, through topShaper
      grid.ts           float32-exact grid lines, with breaks per end of each axis
      walls.ts          side walls: fans to the bottom corners, or over a notched bottom chain
      tileMesh.ts       buildPieceMesh (uniform grid) + adaptive variant for export (adaptive.ts)
      solid.ts          the back of a tile: checks BackFeatures, builds the bottom, notch chains, pocket faces
      polygon.ts        rings, exact orientation predicates, ear clipping with holes
      prism.ts          loftSolid (the key) and extrudeProfileX (a profile along x with slots; tested, unused today)
      normalMap.ts      bakeNormalMap for the preview
      meshChecks.ts     manifold / orientation / volume checks, downward area, components, pinched vertices
    fixing/             keys or tabs between tiles, wall clips, the fit test, the guide         [fixing]
      types.ts          Ring, BackFeature, AccessoryKind, AccessorySpec, ClipSite, MountPlan, KeySite, JoinPlan [lead]
      capability.ts     keyNotchDepth, keysPossible, tabDepth, tabsPossible, socketWidth, tabLimits,
                        clipsPossible, clipBandOffset: can this design cut its pockets at all
      features.ts       pieceFeatures: the key notches or the tab and socket pair, and the clip pockets, of one piece
      tabs.ts           the tab and socket as one section: its geometry, outlines and checks, which of the
                        pair a piece carries, and tabPlan (what the wall really locks)
      joins.ts          key geometry and lattice, notches and their sites, joinPlan (with blocks), keyCoverageNote, the key part
      mechanism.ts      the clip and its pocket as one section, the clip's outlines, and its strain, catch and preload checks
      mount.ts          clip sites and pockets, mountPlan, the clip part (mountParts) and its mesh (buildClipMesh)
      seated.ts         seatedParts: the clips and keys as they sit in one piece (the Back view, the tile-back figure)
      fitTest.ts        the fit-test parts, and the coupons cut by the real tile mesher
      accessories.ts    wallParts (the download's), fitTestFor (the fit-test page's), accessoryParts (both:
                        the catalogue the worker resolves ids against), buildAccessoryMesh, fitClearance
      warnings.ts       fixingWarnings: 'thin-base', 'no-mount', 'no-key', 'no-lock', 'profile-clamped'
      guide.ts          THE "Putting it up" source: fixingSystem, mountingGuide, mountingSummary, and the
                        fit test's own: fitTestGuide, fitChosenText (the one fit sentence), FIT_MARKS
    export/                                                                              [mesh]
      stl.ts step.ts zip.ts readme.ts filenames.ts
      testFixings.ts    test fixtures: a small keyed wall on clips and a tabbed wall with a cut too narrow for
                        a socket, their plans and parts (guide.test.ts holds them to the real builders)
    plan/               setting-out drawing model + SVG strings                          [worker]
      planModel.ts planSheet.ts planSvg.ts
    printSettings.ts    the slicer settings per part kind, partPrintNote, ELEPHANT_FOOT_NOTE     [worker]
    estimate.ts         filament weight (one PLA density) / spools / plates, parts included [worker]
  workers/                                                                                [worker]
    protocol.ts         message contract                                                 [lead]
    geometry.worker.ts  handler (handleRequest is a pure, testable function)
    geometryClient.ts   promise API with cancellation and progress
  hooks/                usePreviewMeshes, useTextureChips, useVolumes, useFilamentEstimate,
                        useExport, useLayout, usePlanModel                                [worker]
  state/                useDesign, useHistory, usePrefs (persisted), useThemeColor, useViewPeek (not)
    viewPeek.ts         which face of the single tile is up, and step 7's peek at the back of tile A
  three/                3D preview                                                        [viewport]
    TileViewport.tsx    public component + imperative handle
    flip.ts             the single tile's turn to its back (pure pose maths)
    seatedSet.ts        the seated keys and clips of the shown piece as drawable models (pure, cached by
                        part id), partMesh (clips and keys only, never the tile mesher) and tileViewLabel.
                        A tab seats nothing (it is in the tile's own mesh), yet its reach still feeds the
                        flip extent, or the turn to the Back view would swing it through the bench floor
    SeatedParts.tsx     draws them in the Back view, turning with the tile
    ...                 environment, lights, materials, instancing, camera, dims, post
  ui/                   design-system components, CSS modules                             [ui]
  styles/               tokens, base                                                     [lead, ui may add partials]
  app/                  router, shell, useAccentTheme (the accent on the root element)   [studio]
  pages/                StudioPage, LandingPage, ExportPage, FitTestPage, HistoryPage, NotFoundPage [studio | pages]
  features/             page-specific components (studio/*, plan/*, export/*, history/*, landing/*, fixing/*, fit/*)
    fit/                the fit test's own page parts: GuideSteps.tsx (the numbered steps and the one
                        GuideDrawing switch, shared with MountingGuide), fitTestZip.ts (its zip, built on
                        the main thread), fitSizes.ts (what that zip weighs, at FIT_TEST_QUALITY)
    landing/            the home page. It never imports three: HeroWall.tsx lays the visitor's whole
                        wall as a CSS grid of relief chips over wallGrid.ts (shared with JointProof)
                        and useTextureChips, so one chip per unique piece covers a wall of any size.
                        Section 01 (CutConcept.tsx) explains the cut idea in three drawings, then proves
                        it with JointProof on a fixed concept wall (conceptConfig in landingDesign.ts);
                        03 is the "In the zip" plate (KitStrip.tsx, kit.ts); 04 (FixingSystems.tsx,
                        "Glue it, lock it, or clip it on") explains glue, keys and wall clips, and does
                        NOT yet mention the tabs, so neither it nor the Questions band's "Can I take the
                        tiles down again?" (which answers with the clips and the keys) has been brought
                        up to the third choice: see the report.
    fixing/             the shared drawings of keys, wall clips (the clip with its stops, the tape,
                        pressing a tile on, the optional screw, pulling a tile off; a tile on its clips
                        drawn a tape's thickness off the wall), the start line, the fit test, perimeter
                        profiles and joint edges, and step 7's cards (diagrams.tsx, static aria-hidden
                        SVG in currentColor, parts in --diagram-part; its pure geometry in
                        diagramGeometry.ts): the home page's section 04, the studio's step 7 and the
                        download page's guide and parts table draw from it. TileBackFigure.tsx (over
                        tileBackGeometry.ts) is the live one: one piece seen from the back at scale,
                        mirrored, its slots and pockets filled in the accent, and a detail circle
                        magnifying one of them with its part seated (seatedParts).
    studio/             the steps; step 6 "Edges" is EdgesGroup.tsx, PerimeterControls.tsx and
                        SidePicker.tsx over the pure helpers and copy in edges.ts; step 7 "Putting it up"
                        is MountingGroup.tsx over mountingCopy.ts (explainMounting, the one source of
                        its words); tileBack.ts says whether the single tile has a back worth turning
                        over (backHasPockets).
    export/             the download page's parts: AccessoryTable.tsx (printed parts by group, each
                        downloadable alone), MountingGuide.tsx ("Putting it up", rendering
                        core/fixing/guide.ts step by step with its drawings), zipContents.ts (what the
                        zip holds).
```

Only edit files you own. Files marked [lead] are read-only contracts; if one blocks you, work around it locally and describe the needed change in your report. `[fixing]` owns `src/core/fixing` except its `types.ts`.

The module graph has one deliberate cycle: `tileMesh -> fixing/features -> joins / mount`, while `accessories -> fitTest -> tileMesh` (the coupon is a real tile) and `joins -> accessories` (fitClearance). It works because every call across it happens inside a function; a top-level constant computed from another module of the cycle at load time would break it. `fixing/capability.ts` imports only `config`, `geometry/profiles` and `fixing/mechanism` (a leaf: polygons and types), which is what lets `layout.ts` ask `keysPossible` without joining the cycle, and `printSettings.ts` imports only types, so the fixings and `estimate.ts` share it without importing each other. The UI reads the plans (`accessoryParts`, `mountPlan`, `joinPlan`, `seatedParts`, `pieceFeatures`) on the main thread, and the Back view builds the meshes of the seated clips and keys there too (cheap prisms and lofts, `three/seatedSet.ts`). It builds them through `partMesh`, which calls `buildClipMesh` and `buildKeyMesh` directly and refuses any other kind, never through `buildAccessoryMesh`, whose fit-test branch reaches the coupon builder and with it the tile mesher: that is what keeps the tile mesher in the worker's chunk alone (checked in `dist/`: the mesher's own strings appear in `geometry.worker-*.js` and in no other asset). An import rule in `seatedSet.test.ts` holds it: no file outside `core/` and `workers/` may name `buildPieceMesh`, `buildCouponMesh` or `buildAccessoryMesh` in an import, or import from `geometry/solid`.

## Contracts

- `src/core/types.ts`: the domain model. `DesignConfig` is the persisted design; its `color` is the tile color as uppercase `'#RRGGBB'`. The edges and fixings fields, all off by default:
  - `jointEdge: JointEdgeProfile` (`'square' | 'chamfer' | 'round' | 'pillow'`, default `'chamfer'`): the top edge where two tiles meet. `bevel` stays its size.
  - `perimeter: PerimeterSettings`: the profile along the edge of the whole surface (`'none' | 'margin' | 'chamfer' | 'bullnose' | 'ogee' | 'frame'`, default `'none'`), its `sides` (`SurfaceSides`, each on or off, all on by default), `width`, `drop` (for `'frame'`: its height above the relief peaks), `fade` (0 = automatic) and `land` (`'valleys' | 'peaks' | 'cut'`; `'cut'` only on chamfer, bullnose and ogee, where it is their default, and `normalizeConfig` turns a `'cut'` on any other profile into that profile's own land).
  - `lock: LockKind` (`'none' | 'keys' | 'tabs'`, default `'none'`): how neighbouring tiles hold each other edge to edge, in the plane of the wall. `'keys'` are printed bow-tie keys pressed into notches in the back; `'tabs'` is a tab moulded into each tile's right side and the socket it enters in the next tile's left, with nothing printed. It replaced the `joins: boolean` the keys shipped with, renamed rather than retyped because `'none'` is truthy and every stale read had to become a compile error; `legacyLock` in `config.ts` reads a stored `joins` boolean (`true` -> `'keys'`), so no store version bump was needed, exactly as `colorId` to `color` needed none.
  - `mount: MountKind` (`'glue' | 'clips'`): flat backs for adhesive or tape, or printed wall clips: each tile clicks onto its own clips, its back a tape's thickness off the wall, and pulls off again. `normalizeConfig` reads any other value as `'glue'` (wall rails never shipped, so a stray `'rails'` needs no migration).
  - `fit: FitClass` (`'snug' | 'standard' | 'loose'`): the clearance of the printed keys and clips, chosen with the fit test. With the tabs it also reaches the tile, because their clearance is cut into the socket rather than carried on a printed part: that is the one case where `geometryKey` includes `fit`, and the reason the fit test is printed before the tiles.

  With `perimeter.profile 'none'`, `lock 'none'`, `mount 'glue'` and `jointEdge 'chamfer'`, every piece id, mark, label, mesh, file name and count is exactly what it was before these fields existed.
- `PieceSpec.edges: PieceEdges` says how a piece meets the surface edge, and is part of its identity (two pieces with different edges are two models). `boundary` is a mask of `1 << Side` for each side on the surface boundary, computed only when the layout is told boundaries matter (`keysPossible` or `tabLimits`: a lock on and a plate that holds its recess, since a boundary side takes neither a key notch nor a tab nor a socket), else 0. `tabs` is a mask of the sides carrying a tab, today only side 1: it is the one field of `PieceEdges` the layout reads off the NEIGHBOURS, because a tab may only be cut where the tile beside it really holds the socket, and 0 unless the design cuts tabs. `profiled` maps each side facing a profiled surface edge within the perimeter band to its distance out to that edge, mm (0 when the side is the edge). An interior piece has `{ boundary: 0, tabs: 0, profiled: {} }`.
- Piece ids: the crop id (`'full'` or `'p-x0-y0-x1-y1'`), then for a border version `-b<boundary mask>` when the mask is not 0, then `-t<tabs mask>` on every piece of a design that cuts tabs (so both `-t2` and `-t0` appear and a wall without them keeps its old ids), then `-e` and each profiled side's letter (B, R, T, L, in Side order) with its distance in mm (round2). `'full-eT0'` is the whole tile under a profiled top edge; `'full-b12-eT0L0'` the top-left whole tile of a wall with keys and a profile; `'full-t0'` the whole tile of a tabbed wall whose right neighbour is too narrow for a socket, labelled "Full tile, no tab"; `'p-0-0-10-150-eR0'` a cut on the right edge. A design without edges or tabs keeps `'full'` and `'p-...'`.
- `FitWarningCode` adds `'no-key'`, `'no-lock'` (the tabs locking nothing: a joint too wide to hide one, a wall with no joint a tab can cross, or the pieces too narrow for a socket), `'no-mount'`, `'thin-base'` and `'profile-clamped'`, written by `fixingWarnings` and merged into the plan's warnings by `useLayout`.
- `src/core/colors.ts`: `COLOR_PRESETS` (11 named swatches), `DEFAULT_COLOR` (`'#5C9748'`, Green), `parseHex`, `presetByHex`, `colorName` (preset name or `'Custom'`), `hexToHsv`, `hsvToHex`. There are no materials or finishes: every color prints and renders as one matte PLA look.
- `src/core/legacyColors.ts`: `LEGACY_COLOR_HEX`, every retired filament id mapped to its hex, so designs, history entries and version 1 share links saved with a `colorId` keep their color.
- `src/core/accent.ts`: the one interface accent (primary action, selection, focus) follows the tile color. `accentPalette(hex)` returns `{ accent, hover, press, soft, ink }`, each an uppercase `'#RRGGBB'`, keeping the tile's OKLCH hue: `accent` is the tile color itself when it reaches 6.5:1 on `--panel` (`#FFFDF8`), otherwise the lightest color of that hue that does (chroma reduced only as far as sRGB needs); `hover` and `press` are darker steps (lighter for a near-black accent, which has no room below); `soft` is a pale tint that keeps `accent` and `--ink-3` at 4.5:1 or better; `ink` is `#FFFDF8`. An unreadable hex gets the palette of `DEFAULT_COLOR`. `accentVariables(palette)` maps it to `--accent`, `--accent-hover`, `--accent-press`, `--accent-soft` and `--accent-ink`, and `contrastRatio(a, b)` is the WCAG 2.x ratio. `src/app/useAccentTheme.ts`, called once in `AppShell`, writes those variables plus `--filament` on `document.documentElement` (the var() aliases in `_tokens.scss` resolve on `:root`, and portals live under `body`), without a transition, from `useThemeColor`'s override or else `config.color`. The `:root` defaults in `_tokens.scss` equal `accentPalette(DEFAULT_COLOR)`, held by `src/styles/tokens.test.ts`, so a default design paints the same before and after the script runs.
- `src/core/layout.ts`: `computeLayout(input: LayoutInput) -> LayoutPlan` (pieces with marks A, B, C..., placements, warnings) and `perfectFitSizes`. Tested.
  - `LayoutInput` is `{ surface, tile, joint, layout, bed?, edges? }`, with `edges: LayoutEdges = { profiled: SurfaceSides | null, band: perimeterBand(config), boundaryMatters: keysPossible(config) || tabs !== null, tabs: tabLimits(config) }`. A lock asked for on a plate that cannot hold its recess cuts nothing, so it never splits one model into nine. `tabs` is `{ minWidth, projection }` or null: the least width a piece needs to hold a socket, which the edge pass weighs each tab's right neighbour against, and how far a tab stands out past its side, which only the bed check reads. Absent or inactive edges (no profiled side with a band, and boundaries not mattering) run the old path, output identical to a layout without them.
  - `layoutInputOf(config, bed?)` builds the input from a design, and every caller that lays out a design goes through it (the studio, the landing, the register, the plan fixes, the file counts of steps 6 and 7), so they agree. The test swatch strips `edges` (one tile is the interior tile), and `tileOptions` lays out hypothetical tile sizes and reads nothing that depends on edges.
  - The edge pass: the boundary comes from rows and columns (the first row laid is the bottom, the last the top, column 0 the left, each row's last column the right). Profiled distances are measured from the bounding box of the placements, not the nominal surface, so a dropped sliver never leaves the band floating and a narrow cut lets the profile spill onto the next piece. The tab mask comes from the next placement of the same row (placements are emitted left to right within a row): a tab is set only where that neighbour exists and both pieces are at least `tabs.minWidth` wide, since an unmated tab would bear on the neighbour's back plate and stand it off the wall, while an empty socket is harmless, which is why only the tab looks across the joint. The dedupe key is the crop plus the edges, the tab mask included, so two placements of one id always have the same back; pieces sort by kind, then the number of edge sides, then whether they carry a tab, then area, so the interior whole tile stays A.
  - Labels add edge words to the crop's own: "Full tile, top border", "Full tile, top-left corner", "Right edge, top-right corner", "Full tile, 10 mm from the right border", and "Full tile, no tab" for a whole tile of a tabbed wall whose right neighbour cannot hold the socket. `fullCount` is the sum over every full-kind model.
  - The bed check is the only place the layout leaves the nominal tile: it measures `tile.width + edges.tabs.projection`, and `'exceeds-bed'` then names the tab ("A 175 x 175 mm tile prints 183 mm wide with its tab, which does not fit..."). `fitsBed(width, height, bed, grow)` and `TileSuggestOptions.grow` carry the same number, so `recommendedTile` and `squareTile` never offer a size whose printed box misses the bed, and `features/studio/tileOptions.ts` passes `tabLimits(config)?.projection`. Everything else keeps the nominal tile.
  - Helpers: `edgeSides`, `hasEdges` (a border version of its crop), `borderSides` (`on` the edge, or `near` it across a narrow cut), `basePiece` (the whole tile the plan is read from: the only full model, else the one no edge shapes). Every other piece carries a letter on the drawings (`isLettered` in `planModel.ts`).
- `src/core/config.ts`: `DEFAULT_CONFIG`, `LIMITS` (with `fade`, 0 to 30 mm, 0 = automatic), `THICKNESS_PRESETS`, `PERIMETER_PROFILES` (each profile's starting width, drop and land and its own ranges; picking a profile adopts its defaults, as picking a texture does: `'cut'` for chamfer, bullnose and ogee, `'valleys'` for margin and frame; the chamfer starts 4 mm wide with a 3 mm drop, the bullnose 4 mm, the ogee 3 mm, so each cut reaches below the valleys of the default 2.6 mm relief), `cutsRelief` (the three profiles that may cut), `DEFAULT_PERIMETER`, `MIN_FIXING_THICKNESS = 4` (the Standard plate, the thinnest that holds key notches, tab sockets and clip pockets), and `normalizeConfig` (clamps anything into a valid config: the perimeter within its profile's own ranges, every new enum to a known value; the color resolves as `parseHex(color)`, then the hex of a legacy `colorId`, then `DEFAULT_COLOR`).
- `src/hooks/geometryKey.ts`: what rebuilds preview meshes. It includes the joint edge, the perimeter with its resolved band when a profile is on (a small surface narrows the band), `lock`, the joint whenever a lock is on (with keys a running bond spaces the notches by the pitch and the clip pockets keep clear of them; with tabs it is how far a tab reaches across the joint), `mount`, and `fit` only when the lock is the tabs, because their socket is the one clearance cut into a tile. Moving Fit then re-meshes every tile, which is the accepted cost of the choice; with keys, clips or nothing it still rebuilds nothing.
- `src/core/textures/types.ts`: pattern samplers are periodic with period 1 over one period, heights in [0,1]. `createHeightField(config)` (registry) returns heights in mm above the base plate, periodic over `(tile.width / rowShiftCycle, tile.height)` so running bonds stay seamless.
- `src/core/fixing/types.ts` (shared by the mesher, the worker, the plans and the UI):
  - `Ring`: a closed 2D ring, `Float64Array [x0, y0, x1, y1, ...]`, counter-clockwise seen from above, no repeated vertex.
  - `BackFeature { role: 'key-pocket' | 'clip-pocket' | 'join-tab' | 'join-socket' | 'fit-mark'; side: Side | null; outward?: boolean; levels: BackFeatureLevel[] }`, something the mesher builds into the back of a piece, open at the bottom face. Levels (`{ ring, ringTop?, z0, z1 }`, a loft when `ringTop` is set) stack from z = 0 with no gap; where two outlines meet, one contains the other (they may share stretches but never cross) and the ring between them is a flat face; the last level ends in a flat face that, in a cavity, keeps `MIN_SKIN_MM` (0.8) of plastic under the top.
    - Cavities (`outward` unset) are cut into the footprint: a closed clip pocket (`side: null`), at least `MIN_WALL_MM` (0.8) from every side and free to widen going up (the pocket's flare, whose walls face up as the tile prints); or a notch with a set `side`, whose rings have exactly one edge on that side line (the opening), at least 0.8 mm from the other three sides, and which never widens along its side going up (no undercut). A key notch, a tab socket and a fit-test coupon's mark are all notches.
    - `outward: true` is the one feature that ADDS material, and only the join tab does: a `side` is required, its ring's opening edge is the tab's root lying on that side line, and every other vertex stands strictly beyond the line, within the side's span and 0.8 mm clear of both corners. The ring is wound counter-clockwise around the material it adds, which runs its root edge the opposite way along the side from a cavity's opening: that sign is the whole difference between the two, and a ring wound the other way is refused rather than meshed. From the side wall's point of view a tab and a notch of the same span and height are the same planar polygon, so the wall steps over a tab as it steps over a notch; the bottom face detours around the outside of it; and its walls, ledges and top face outward and up, so the solid stays closed, 2-manifold and positively oriented with the tab's own volume added.
    - Features never touch. The mesher refuses anything else with an error naming the feature.
  - `AccessorySpec { id, kind, mark, label, count, size, printNote, group, shape }`: one printed part that is not a tile, one file printed `count` times. `kind` is `AccessoryKind` (`'clip' | 'key' | 'fit-test'`), `mark` its letter and number (`C1` the wall clips, `K1` the keys, `F1`, `F2`... the fit test), `group` the zip folder (`'fit-test' | 'mount' | 'join'`: the clips in `mount`, the keys in `join`), `shape` the numbers its own mesher reads (a clip's `clearance` and `marks`; a key's sizes, `joint`, `clearance` and `marks`; a coupon's `width`, `height`, `clip`, `key`, `tab`, `socket`, `mate`, `marks` and `x0`), `printNote` one line from `partPrintNote` (how it lies on the plate, then the settings its weight assumes). Ids encode the geometry and never collide with piece ids (`clip-c0.2` the standard clip, `clip-c0.12-m1` the first test clip).
  - `ClipSite { x; y; axis: 'h' | 'v'; pieceId }`: one clip on the wall, the centre of its pocket on one placed tile, surface mm. `'h'` lies along the wall, its catch up and down; `'v'` is turned a quarter turn, for a narrow piece.
  - `MountPlan { clips; sites: ClipSite[]; unmountedPieceIds }`: every clip on the wall, one per pocket over every placed tile, sites bottom to top then left to right, and the pieces with no clip pocket at all (too small or too narrow for one), which are keyed to a neighbour or glued. Zero clips and nothing named for a glued design or a plate too thin for a pocket.
  - `TabPlan { tabs; joints; unlockedPieceIds }` (tabs.ts, as `KeyJoinPlan` lives in joins.ts): the tabs standing in a socket over every placed tile, the joints within a row that at least one of them holds shut, and the pieces no tab locks to either tile beside them. A piece with no tile beside it in its row is not among them, because the design never claimed to lock it. `tabPlan` walks within rows only: nothing crosses a row joint, so `joints` never counts one and a tab wall is one strip per row by construction. It pairs each tab with the socket it enters by lattice index, so a joint whose two pieces put their pair at different heights counts as loose rather than locked.
  - `JoinPlan { keys; sites: KeySite[]; unkeyedSeams; unkeyedPieceIds }`: a `KeySite` is a key centre in surface mm with its `seam` (`'vertical'` across a joint within a row, `'horizontal'` between rows); `unkeyedPieceIds` are the pieces keyed to no neighbour at all. `joinPlan` returns a `KeyJoinPlan` (joins.ts), which adds `blocks`: the separate groups of two or more placements the keys hold together (1 for one panel, 0 with no key).
- `src/workers/protocol.ts`: preview / export / volumes / chips requests and results.
  - `PreviewRequest.backFeatures` (default true) cuts the key notches and clip pockets into the preview meshes. `usePreviewMeshes` sends `previewBackFeatures(detail)`: false for `'surface'` (the whole-wall camera never gets behind the wall, and on a big keyed wall on clips the pockets are over a million triangles), true for `'tile'`, whose Back view shows them. The request key says `fronts` or `backs`.
  - `ExportRequest` writes the tiles in `pieceIds` (every tile when omitted), then the printed parts: those in `accessoryIds`, or without it every part `accessoryParts` returns for a full export (no `pieceIds`) and none for a pick of pieces. `accessories: false` leaves them all out; one part alone is `{ pieceIds: [], accessoryIds: [id], zip: false }`, which builds no relief. There is no mounting plan to draw: each tile places its own clips. A part whose builder throws fails the export with its name, so a zip never silently lacks one.
  - `ExportedFile` adds `accessoryId` and `folder` (the part's group; `name` never carries the folder). `PieceStats` is keyed by `partId` (the piece id or the accessory id) with `pieceId` or `accessoryId` set.
  - `VolumeRequest.accessories` measures the parts too; `VolumeResult.volumes` is keyed by piece id and by accessory id, and a part that fails to build is left out (the estimate falls back to its approximation).
  - `ChipRequest` items carry `edges?: PieceEdges`, so a border piece's chip shows its profile.
- Stores (`src/state`): `useDesign` (config + undo/redo; `update(recipe, {coalesce})`, `load`, `undo`, `redo`, `reset`), `useHistory` (saved designs with WebP thumbnails, max 40), `usePrefs` (view mode, light angle, toggles, export format/quality), all persisted, and two that are not: `useThemeColor` (`src/state/themeStore.ts`: `override`, a color a page shows instead of the design's, such as the home page's sample board, or `null` to follow the design; `setOverride`) and `useViewPeek` (`src/state/viewPeek.ts`: which face of the single tile is up, and whether the studio is only peeking at its back; see "Where it shows" under Fixings). The edges and fixings fields needed no store version bump: `normalizeConfig` gives a design saved before them the defaults above, and `legacyLock` turns a stored `joins` boolean into a `lock`, so the rename needed none either.

## Function contracts (exact exports; code against these in parallel)

`src/core/textures/registry.ts` [textures]
```ts
export const DEFAULT_TEXTURE_ID = 'wavy'
export const TEXTURES: TextureDef[]                      // catalog order = chip order, marks T-01..
export function textureById(id: string): TextureDef       // unknown id -> default texture
export function resolveParams(def: TextureDef, params: Record<string, number>): Record<string, number> // defaults + clamping
export function createHeightField(config: DesignConfig): HeightField
```
`src/core/textures/hillshade.ts` [textures]
```ts
export function shadeReliefChip(config: DesignConfig, opts: ReliefChipOptions): ReliefShade   // color-free lighting, cached by reliefShadeKey
export function tintReliefChip(shade: ReliefShade, hex: string): ReliefChip                  // one matte gloss for every color; bad hex -> DEFAULT_COLOR
export function renderReliefChip(config: DesignConfig, opts: ReliefChipOptions): ReliefChip // lit relief in config.color, piece shape and edges included
// ReliefChipOptions.edges?: PieceEdges shapes a border piece; reliefShadeKey adds the joint profile, and the
// resolved perimeter (its cut flag included) only when it shapes the chip.
```
`src/core/geometry/profiles.ts` [mesh]
```ts
export function resolveJointEdge(config: DesignConfig): JointEdge                 // { profile, size, run }
export function jointZ(z: number, dj: number, edge: JointEdge, t: number): number  // top z at distance dj from a joint side
export function resolvePerimeter(config: DesignConfig): ResolvedPerimeter | null  // clamped to the plate and the surface; null without a profile or side
export function perimeterBand(config: DesignConfig): number                       // shaped width + fade (no fade on a cut), mm; 0 without a profile
export function perimeterDrop(config: DesignConfig): number                       // how far a profile that DROPS to the rim takes the top
  // away, in from the side it shapes, mm; 0 for 'margin', 'frame' and none. Nothing may be cut into the back under it, so the
  // fixings read it twice: dropZones refuses a recess there, and socketWidth asks a piece at a shaped edge for that much width
export function perimeterZ(z0: number, dp: number, e: ResolvedPerimeter): number   // top z at mitred distance dp from the surface edge
export function topShaper(config: DesignConfig, edges?: PieceEdges): TopShaper     // THE top of a piece: mesher, normal map and chips
export function pieceAxisBreaks(config: DesignConfig, edges?: PieceEdges): { x: AxisBreaks; y: AxisBreaks }
export function shapingEdges(config: DesignConfig, edges?: PieceEdges): Partial<Record<SideName, number>> // offsets that really shape a piece
export function effectiveBevel(config: DesignConfig): number                      // also re-exported from heightfield.ts
export function applyBevel(z: number, d: number, thickness: number, bevel: number): number
```
`src/core/geometry/heightfield.ts` [mesh]
```ts
/** Top-surface z (mm, from the bottom face) of a piece at piece-local (x, y): relief, joint edge and perimeter profile. */
export function pieceTopSampler(config: DesignConfig, field: HeightField, piece: Pick<PieceSpec, 'crop' | 'width' | 'height'> & { edges?: PieceEdges }): (x: number, y: number) => number
```
`src/core/geometry/tileMesh.ts`, `normalMap.ts`, `meshChecks.ts`, `solid.ts` [mesh]
```ts
export interface PieceMeshOptions { cellMm: number; adaptive?: { toleranceMm: number } }
/** features default to the design's own (key notches or the tab and socket pair, clip pockets); [] or none gives the plain solid, byte for byte. */
export function buildPieceMesh(config: DesignConfig, field: HeightField, piece: PieceSpec, options: PieceMeshOptions,
  features: readonly BackFeature[] = pieceFeatures(config, piece)): MeshData
export function topGridLines(config: DesignConfig, piece: Pick<PieceSpec, 'width' | 'height' | 'edges'>, cellMm: number): { xs: Float64Array; ys: Float64Array }
export function bakeNormalMap(config: DesignConfig, field: HeightField, piece: PieceSpec, texelMm: number):
  { width: number; height: number; data: Uint8Array }
export function meshVolume(mesh: MeshData): number        // mm³, positive for outward normals (meshChecks.ts)
export function checkMesh(mesh: MeshData): { closed: boolean; manifold: boolean; oriented: boolean; boundaryEdges: number; volume: number }
export function downwardArea(mesh: MeshData, zAbove: number, minCos?: number): number  // mm² facing down above zAbove (overhangs)
export function componentCount(mesh: MeshData): number    // connected pieces, welded by exact position
export function pinchedVertices(mesh: MeshData): number   // vertices whose triangles form more than one fan
export const MIN_SKIN_MM = 0.8, MIN_WALL_MM = 0.8         // solid.ts: least plastic over a ceiling, and beside a pocket
export const QUALITY_CELL_MM: Record<ExportQuality, number>                       // tileMesh.ts
export const STEP_QUALITY: Record<ExportQuality, { cellMm: number; toleranceMm: number }> // tileMesh.ts
```
`src/core/geometry/polygon.ts`, `prism.ts`, `walls.ts` [mesh]
```ts
export function triangulatePolygon(outer: ArrayLike<number>, holes?: readonly ArrayLike<number>[]): Uint32Array // exact on rings snapped with snapRing
export function snapRing(ring: ArrayLike<number>, quantum: number): Float64Array // plus signedArea, reverseRing, offsetRing, roundedRectRing...
export function loftSolid(sections: readonly LoftSection[]): MeshData             // prisms, lofts, flat steps between nested outlines
export function extrudeProfileX(profile: ArrayLike<number>, length: number, options?: { cuts?: readonly ProfileCut[] }): MeshData // a profile along x, with slots (no part uses it today)
export function triangulateNotchedWall(topS: ArrayLike<number>, topZ: ArrayLike<number>, bottomS: ArrayLike<number>, bottomZ: ArrayLike<number>): Uint32Array
  // a side wall over notches (walls.ts); triangulateWall is unchanged
```
`src/core/fixing/*` [fixing]
```ts
type PieceShape = Pick<PieceSpec, 'crop' | 'width' | 'height' | 'edges'> // every pocket is a pure function of the design and this
export function keyNotchDepth(config: DesignConfig): number | null              // capability.ts; null under 4 mm or a notch under 1.2 mm deep
export function keysPossible(config: DesignConfig): boolean                      // lock 'keys' and keyNotchDepth not null
export function tabDepth(config: DesignConfig): number | null                    // keyNotchDepth, gated at TAB_MIN_DEPTH (1.6 mm)
export function tabsPossible(config: DesignConfig): boolean                      // lock 'tabs', joint at most TAB_JOINT_MAX, tabDepth not null
export function socketWidth(config: DesignConfig): number                        // least piece width that holds a socket HERE:
  // TAB_MIN_WIDTH, plus what a border profile dropping to the rim reaches past the margin (perimeterDrop)
export function tabLimits(config: DesignConfig): { minWidth: number; projection: number } | null // what the layout needs, or null
export function clipsPossible(config: DesignConfig): boolean                     // mount 'clips' and a plate of at least 4 mm; no tile size rule
export function clipBandOffset(config: DesignConfig): number                     // pocket centre from a piece's bottom and top edges:
  // 19.5 mm with keys cut (clear of the row-joint notches), else the pocket's half height plus a side wall (10.1 mm by default)
export const KEY_CLEAR = 3, KEY_NOTCH_REACH = 8.4, CLIP_SIDE_WALL = 2          // capability.ts, mm
export const TAB_REACH = 8, TAB_MIN_WIDTH = 11.7, TAB_MARGIN = 3, TAB_MIN_DEPTH = 1.6, TAB_JOINT_MAX = 2 // the layout's own copies
  // of tabs.ts's numbers (capability may not import it, or layout.ts would join the fixings' cycle); held equal by capability.test.ts
export function pieceFeatures(config: DesignConfig, piece: PieceShape): BackFeature[] // features.ts: key notches or the
  // tab and socket pair, then clip pockets
export function keyGeometry(config: DesignConfig): KeyGeometry | null            // joins.ts; null when keyNotchDepth is
export function keyLattice(config: DesignConfig): KeyLattice                     // key positions along a whole tile's sides, keys on or off
export function keyPockets(config: DesignConfig, piece: PieceShape): BackFeature[]
export function keyNotchSites(config: DesignConfig, piece: PieceShape): KeyNotchSite[] // { side, along }, in keyPockets' order
export function joinPlan(config: DesignConfig, plan: LayoutPlan): KeyJoinPlan   // zero keys unless lock is 'keys', or keyGeometry is null
export function keyCoverageNote(config: DesignConfig, plan: LayoutPlan, joins?: KeyJoinPlan): string | null // blocks > 1 only,
  // and gated on keysPossible, so it can never fire for the tabs: their one strip per row is the design and not a fault
export function wallKeySpec(config: DesignConfig): Omit<AccessorySpec, 'mark' | 'count' | 'group'> | null // the K1 key at the design's fit
export function keyAccessories(config: DesignConfig, plan: LayoutPlan): AccessorySpec[] // [] or the K1 file, keys + 5 % spares
export function keySpecForFit(config: DesignConfig, fit: FitClass, marks: 1 | 2 | 3): AccessorySpec | null
export function buildKeyMesh(config: DesignConfig, spec: Pick<AccessorySpec, 'id' | 'kind' | 'shape'>): MeshData
export function tabGeometry(config: DesignConfig): TabGeometry | null            // tabs.ts; null when tabDepth is. Depth, tab
  // thickness (depth - KEY_RECESS), reach, neck, head, the socket's clearance and reach, minWidth, socketWidth, the key's own lattice
export function tabOutline(key: KeyGeometry, joint: number): number[]            // the notch outline mirrored out past the side line,
  // wound counter-clockwise around its material: that sign is what tells the mesher a tab from a notch
export function pieceTabs(config: DesignConfig, piece: PieceShape): BackFeature[]    // side 1, only where PieceEdges.tabs says so
export function pieceSockets(config: DesignConfig, piece: PieceShape): BackFeature[]  // side 3, from the piece alone
export function tabFeatures(config: DesignConfig, piece: PieceShape): BackFeature[]   // its tab, then its sockets
export function tabAt(config, side, along, size): BackFeature | null             // one tab on a shape that is not a wall piece
export function socketAt(config, side, along, size, fit?): BackFeature | null    // one socket, cut at `fit` rather than the design's
export function tabPlan(config: DesignConfig, plan: LayoutPlan): TabPlan         // what the wall really locks; within rows only
export function tabChecks(g: TabGeometry): TabChecks                             // engagement, ceiling room, shoulder, joint play,
  // the walls and corner clear, the clip band, the rim over the tab, the tab's thickness, and every clearance (tabs.test.ts)
export const TAB_SIDE = 1, SOCKET_SIDE = 3                                      // the uniform hand: tab right, socket left
export const SOCKET_CLEARANCE: Record<FitClass, number>                          // 0.15 / 0.3 / 0.45 mm per face, cut into the socket
export function clipSites(config: DesignConfig, piece: PieceShape): ClipPocketSite[] // mount.ts; { x, y, axis }, piece-local pocket centres
export function clipPocketAt(x: number, y: number, axis: 'h' | 'v'): BackFeature   // one clip pocket, role 'clip-pocket', side null
export function clipPockets(config: DesignConfig, piece: PieceShape): BackFeature[]
export function mountPlan(config: DesignConfig, plan: LayoutPlan): MountPlan
export function clipSpec(fit: FitClass, marks?: 0 | 1 | 2 | 3): Omit<AccessorySpec, 'mark' | 'count' | 'group' | 'label'> // id 'clip-c0.2'
export function clipSpecForFit(fit: FitClass, marks: 1 | 2 | 3): AccessorySpec  // a test clip, marked by 1 to 3 notches
export function mountParts(config: DesignConfig, plan: LayoutPlan): AccessorySpec[] // [] or the C1 file, "Wall clip, <fit> fit", clips + 5 % spares
export function buildClipMesh(spec: Pick<AccessorySpec, 'id' | 'shape'>): MeshData // flat on its back, box from the origin
export const PERIMETER_CLEAR = 2, POCKET_GAP = 2, DOUBLE_AT = 240               // mount.ts, mm
export function clipChecks(clearance: number, sag?: number): ClipChecks          // mechanism.ts: strains, catch, preload, room, clearances
export function wallGap(tape: number, sag?: number): number                     // the tile's back off the wall: tape + droop
export function clipPlan(clearance: number, marks?: number): number[]            // plan outline at the barbs' tips, for the drawings
export function clipOutlineAt(z: number, clearance: number, marks?: number): number[] // plan outline at height z of the clip
export function barbProfile(clearance: number): number[]                         // a barb's (y, z) edge, for the drawings
export function pocketProfile(): number[]                                        // the pocket's (y, z) wall: mouth, land, flare
export function stopRects(): [number, number, number, number][]                  // the two stops in plan
export function clipPocketLevels(x: number, y: number, axis: 'h' | 'v'): BackFeatureLevel[]
export function seatedParts(config: DesignConfig, piece: PieceShape): SeatedPart[] // seated.ts; SeatedPart = { kind, accessoryId, x, y, z, turns }
export function wallParts(config: DesignConfig, plan: LayoutPlan): AccessorySpec[] // accessories.ts: clips, keys. The download's
export function fitTestFor(config: DesignConfig, plan: LayoutPlan, wall?: readonly AccessorySpec[]): AccessorySpec[] // the fit test of that wall
export function accessoryParts(config: DesignConfig, plan: LayoutPlan): AccessorySpec[] // both, in print order: the catalogue
export function fitTestParts(config: DesignConfig, uses?: FitTestUses): AccessorySpec[] // fitTest.ts; uses = { clips, keys, tabs },
  // what the wall prints or cuts: with tabs, coupon A carries the tile's own tab and three B coupons the socket at the three fits
export function buildCouponMesh(config: DesignConfig, spec: AccessorySpec): MeshData // a coupon, by the real tile mesher
export function buildAccessoryMesh(config: DesignConfig, spec: AccessorySpec): MeshData // 'clip' | 'key' | 'fit-test'; closed, one piece, on the bed
export function fitClearance(fit: FitClass, part: 'key' | 'clip'): number        // per-side clearance, mm; the tabs' own is
  // SOCKET_CLEARANCE in tabs.ts, twice the loosest key's because the pair carries the printer's error on both halves
export function fixingWarnings(config: DesignConfig, plan: LayoutPlan): FitWarning[] // warnings.ts
export function fixingSystem(config: Pick<DesignConfig, 'lock' | 'mount'>, mount: Pick<MountPlan, 'clips'>,
  join: Pick<JoinPlan, 'keys'>, tab: Pick<TabPlan, 'tabs'>): FixingSystem
  // guide.ts: 'glue' | 'keys' | 'clips' | 'both' | 'tabs' | 'clips-tabs', from what the plans place. The tab plan is
  // REQUIRED, not defaulted: a caller that forgot it would describe a locked wall as glued, in the guide, the README,
  // the plan notes and the studio alike. usesKeys / usesClips / usesTabs answer which parts a system uses.
export function mountingGuide(input: GuideInput): MountingGuide // GuideInput = { config, plan, mount, join, tab, accessories }
export function mountingSummary(input: GuideInput): string[]    // at most three lines in the steps' words: the studio's "You'll do"
export function listText(items: readonly string[]): string       // "A, B and C"
export function marksText(marks: readonly string[]): string      // a run of one letter as a range: "F1 to F8"
export const FIT_MARKS: Record<FitClass, { name: string; notches: string }> // "Snug" / "one notch": the picker's own names
export function fitChosenText(config: DesignConfig, system: FixingSystem): string // THE fit sentence: the page, step 1, the studio's Fit row
export function fitTestGuide(input: FitTestGuideInput): FitTestGuide | null // { config, parts, system? }; null when parts is empty
```
`src/core/printSettings.ts` [worker]
```ts
export const PRINT_SETTINGS: PrintSettings                           // the tiles: 0.2 mm layers, 3 walls, 15 % infill
export const PART_PRINT_SETTINGS: Record<AccessoryKind, PrintSettings> // clips and keys solid (100 % infill), coupons as tiles
export function partPrintNote(kind: AccessoryKind, how: string): string // every part's printNote: "<how>: <settings>."
export const ELEPHANT_FOOT_NOTE: string                              // README and download page, only when keys or clips are placed
```
`src/core/export/*` [mesh]
```ts
export function writeStl(mesh: MeshData, header: string): Uint8Array           // binary, little endian
export function writeStep(mesh: MeshData, opts: { name: string }): Uint8Array   // ISO 10303-21, AP214 (see Files below)
export function pieceFileName(piece: PieceSpec, format: ExportFormat): string
export function accessoryFileName(spec: Pick<AccessorySpec, 'mark' | 'label' | 'count'>, format: ExportFormat): string
export function accessoryZipPath(spec: Pick<AccessorySpec, 'mark' | 'label' | 'count' | 'group'>, format: ExportFormat): string // "<group>/<file>"
export const SETTING_OUT_PLAN_FILE = 'setting-out-plan.svg', README_FILE = 'README.txt'
export function buildReadme(config: DesignConfig, plan: LayoutPlan, format: ExportFormat, fixings?: ReadmeFixings): string
export function buildFitTestReadme(config: DesignConfig, parts: readonly AccessorySpec[], format: ExportFormat): string // the fit-test zip's own
export function zipFiles(files: { name: string; data: Uint8Array }[]): Uint8Array // names may carry a folder
```
`src/core/plan/*`, `src/core/estimate.ts` [worker]
```ts
export function buildPlanModel(config: DesignConfig, plan: LayoutPlan): PlanModel  // drawing primitives (tiles, cuts, dimension chains, marks),
  // plus basePieceId, clips (ClipSite[], only when clips are placed), unclippedPieceIds, keys (KeySite[]), unkeyedSeams,
  // unkeyedPieceIds, locks (the joints a tab holds shut), unlockedPieceIds and accessories (PlanAccessoryRow[], the wall's
  // clips and keys); its setting-out notes follow fixingSystem: glue keeps the old notes, keys or clips put the tiles up
  // from the bottom edge (on clips, the start line), and tabs keep the glued notes plus the left-to-right order. Nothing
  // is drawn for a tab: every tile carries its own, so there is no new symbol and no new legend row
export function planSvg(config: DesignConfig, plan: LayoutPlan, opts?: PlanSvgOptions): string
export function estimateFilament(config: DesignConfig, plan: LayoutPlan, volumes: Record<string, number>,
  parts: readonly AccessorySpec[] = accessoryParts(config, plan)): FilamentEstimate
  // grams (low/high range, PLA_DENSITY_G_PER_CM3 = 1.24 for every color), spools of 1 kg, plates per piece for the chosen printer,
  // measured on the PRINTED box (a tabbed piece is tabLimits().projection wider, which halves a 120 mm tile on a 256 mm bed);
  // each part weighed at its own PART_PRINT_SETTINGS (re-exported from printSettings.ts), with per-group sums
  // (accessories, accessoryGroups, tileGrams, accessoryGrams)
```
`src/workers/geometryClient.ts` and `src/hooks/*` [worker]
```ts
export const geometryClient: {
  request<K extends WorkerRequest['kind']>(req: Extract<WorkerRequest, { kind: K }>, opts?: { signal?: AbortSignal; onProgress?: (p: Progress) => void }): Promise<WorkerResultMap[K]>
}
export function useLayout(config: DesignConfig): LayoutPlan                    // computeLayout(layoutInputOf(config, bed)) + fixingWarnings, memoized
export function usePreviewMeshes(config: DesignConfig, plan: LayoutPlan, detail: 'surface' | 'tile'):
  { pieces: Map<string, PreviewPiece>; pending: boolean; current: boolean; version: number; error: string | null }
  // keeps the previous result on screen while rebuilding; pockets in the backs for 'tile' only (previewBackFeatures)
export function useTextureChips(base: DesignConfig, items: { key: string; config: DesignConfig; crop?: CropRect; edges?: PieceEdges }[], sizePx: number):
  Map<string, string>                                                          // key -> object URL (PNG), cached across renders (chipCache.ts)
export function useVolumes(config: DesignConfig, plan: LayoutPlan, parts?: readonly AccessorySpec[]): { volumes: Record<string, number> | null; pending: boolean }
export function useFilamentEstimate(config: DesignConfig, plan: LayoutPlan): { estimate: FilamentEstimate; pending: boolean } // parts included
export function useExport(): { run(req: Omit<ExportRequest, 'kind'>): Promise<ExportResult>; progress: Progress | null; busy: boolean; cancel(): void; error: string | null }
export function downloadBlob(data: Uint8Array, name: string, mime: string): void
```
`src/three/TileViewport.tsx` [viewport]
```ts
export interface TileViewportProps {
  config: DesignConfig         // tiles render in config.color with the single matte look (LOOK.materials)
  plan: LayoutPlan
  mode: 'surface' | 'tile'
  lightAngle?: number          // degrees of key-light azimuth
  showDimensions?: boolean
  showLayerLines?: boolean
  highlightPieceId?: string | null
  interactive?: boolean        // false: no controls, slow auto orbit
  face?: TileFace              // 'back' turns the single tile over, its keys and clips seated (read only in the 'tile' mode)
  // also paused, background, presentation, arrivalReady and revealCuts: presentation props of the retired
  // 3D hero; no route passes them today, and omitted they change nothing
  className?: string
  onPendingChange?: (pending: boolean) => void
}
export interface TileViewportHandle {
  capture(widthPx: number, options?: { maxWaitMs?: number }): Promise<string | null> // WebP data URL for history thumbnails
  resetView(): void
  focus(): void                // keyboard focus onto the view (the peek pill hands it there when pressed from the keyboard)
}
export const TileViewport: React.ForwardRefExoticComponent<TileViewportProps & React.RefAttributes<TileViewportHandle>>
export function partColor(tileHex: string): string // look.ts: the seated parts' neutral, LOOK.parts.ink or .panel, whichever contrasts more
```
`src/state/viewPeek.ts` [viewport]
```ts
export const useViewPeek: UseBoundStore<StoreApi<ViewPeekState>> // { face, peeking, peekBack, endPeek, setFace, keepView, reset }
export function designEditEndsPeek(previous: DesignConfig, next: DesignConfig): boolean // any edit but step 7's mount, joins, fit (and the plate they raise)
export function peekAfterChoice(): void   // peekBack, only at 1100 px and up (VIEW_BESIDE_STEPS_QUERY), where the view is on screen
export function peekAndShowView(): void   // peekBack everywhere; narrower, also scrolls #studio-view (STUDIO_VIEW_ID) into view
```
`src/features/studio/mountingCopy.ts` [studio]
```ts
export function explainMounting(config: DesignConfig, plan: LayoutPlan, accessories: readonly AccessorySpec[],
  models: TileModels, raisedFrom?: number | null): MountingExplained
  // step 7's heading value (`now`) and the "What changes" rows: back (tile A, its caption and peek label), print, need,
  // steps (mountingSummary, word for word), know, fit (only while fitted parts print), alsoChanged, spoken
export const WALL_CARDS, JOIN_CARDS: readonly MountingCard[]    // { value, name, figure?, note }
export const pieceName: (piece: Pick<PieceSpec, 'kind' | 'mark'>) => string
  // "tile A" for a whole tile, "piece C" for a cut: step 7's words, which the 3D view's pill uses too
```

## Relief and mesh rules

- Height of the top surface at piece-local `(x, y)`: `z = thickness + h(x0 + x, y0 + y)` where `h = createHeightField(config)`, then shaped at the edges by `topShaper(config, piece.edges)` (`core/geometry/profiles.ts`). That one function is the top everywhere: the mesh builder, the normal-map baker and the chip renderer all go through it, so they never disagree.
- Joint edge, every side of every piece that carries no perimeter profile (a switched-off surface side keeps it too). `resolveJointEdge`: size `s = min(bevel, thickness / 2, 3)`, also within an eighth of the smaller tile side for chamfer and round, whose run is `s`; the pillow keeps `s` over a run of `min(4s, min(W, H) / 8)`; square is size 0. `jointZ` subtracts the groove from the continuous surface, identically on both neighbours, so the relief still lines up across the joint: the chamfer is the old 45° cut, `z - (s - d)` for `d < s`, never below `min(z, thickness) - s`, written exactly as `applyBevel` so a default design is bit-identical; round and pillow are a quarter arc, vertical at the rim. The cut follows the local surface, so the rim always drops by the full size whatever the relief does there.
- Perimeter profile, border pieces only. `resolvePerimeter` reads width `w`, drop `h` (the frame's height above the peaks), fade `F` (0 = automatic = `clamp(2 × depth, 3, 16)`, and 0 on a design without relief) and the land `L` (the plate, plus the relief depth at `'peaks'` and `'cut'`). The distance runs to the surface edge (the bounding box of the placements), mitred at a corner as the minimum over the profiled sides, and a profile spills across a narrow cut onto the next piece, which is why `PieceEdges.profiled` carries a distance. Across the fade the relief eases (a smoothstep) into the flat land, then the profile runs to the rim: margin stays flat at L, chamfer is a straight slope, bullnose a quarter arc vertical at the rim, ogee a convex roll into a concave sweep, and the frame stands flat at `Zf = thickness + depth + h` with a 45° inner slope down to the land. A cut (`land 'cut'`, `ResolvedPerimeter.cut`, chamfer, bullnose and ogee only) has no fade and no land: `F = 0`, so the band is the width, and the top is `min(z0, profile)` with the profile running down from the peaks (`L = thickness + depth`), the skirt outside the piece included: every dip in the relief stays open to the rim, and the relief comes back unchanged at the width. Its drop is measured from the peaks and has the same room and clamp as `'peaks'`, so a drop deeper than the relief rounds the plate edge too, down to the floor, while a drop shallower than the relief only trims the crests and leaves the valleys running out to the rim (the studio's hint says so, and the chamfer's default 3 mm drop reaches below the default relief). Margin, frame and a cut keep the joint edge along their outer edge (`topShaper` and `perimeterBreaks`); since `jointZ` only grows with the height and with the distance from the edge, a cut edge never stands above the tile as it prints with no profile, anywhere. Chamfer, bullnose and ogee over a band at the valleys or the peaks replace the joint edge instead. The rim never drops below 1.2 mm (`PERIMETER_RIM_FLOOR`, joint groove included) and the band never takes more than the surface allows; a clamped profile says why (`reason 'plate'`, whose fix is the Sturdy base, or `'surface'`) and raises `'profile-clamped'`. Everything stays one heightfield printed face up.
- Grid lines: the top grid puts a line on every crease of the joint edge and the profile (`pieceAxisBreaks`, lists per end of each axis, fed to `axisLines`). The x lists depend only on the column and the y lists only on the row, so two neighbours keep the same lines along their shared joint and their rim samples are identical.
- Meshes are closed 2-manifold solids with outward normals (CCW seen from outside), positive volume, bottom at z = 0. Top surface first in the index buffer (`topIndexCount`), then walls and bottom. With no back features the walls are fans from the bottom corners to the top rim (no T-junctions) and the bottom is two triangles, byte for byte the solid every tile always had. With features (`geometry/solid.ts`), a side with notches walks its bottom chain up and over each notch (`triangulateNotchedWall`), the bottom is the footprint with the notches cut into its outline and the pocket mouths as holes (`triangulatePolygon`), and each feature adds its walls, the flat ledges between its levels and a flat ceiling. Every outline is snapped to the piece's float32 lattice first, so faces share whole edges at exactly the same positions.
- Printed parts are prisms or lofts of 2D rings, never general CSG: the key through `loftSolid`, the clip as its own stack of lofted slabs (`buildClipMesh`: the outline at each height where the barbs' profile or the screw hole changes, lofted vertex to vertex, with the two stops on top), the coupons by the tile mesher. Flat faces with flat normals, no uvs, `topIndexCount` 0, closed, manifold at every edge and vertex, one component, on the bed. Each builder checks its own output and throws otherwise.
- Preview normals come from central differences on the global height function (not `computeVertexNormals`), so neighbouring tiles shade identically at the joint.
- UVs: pattern coordinates over the full tile, `u = (x0 + x) / tile.width`, `v = (y0 + y) / tile.height`.
- Export resolution by quality: draft ≈ 0.8 mm, standard ≈ 0.4 mm, fine ≈ 0.2 mm cells (STEP uses the adaptive mesher so flat regions become large planar faces). `writeStep` writes a flat region with holes as one face (a `FACE_OUTER_BOUND` plus a `FACE_BOUND` per hole), and each connected piece of a mesh as its own `CLOSED_SHELL` and `MANIFOLD_SOLID_BREP` (named `<name> 1`, `<name> 2`... when there are several); a one-piece mesh keeps the old numbering.
- Tile files: `{mark}_{slug(label)}_{w}x{h}_x{count}.{stl|step}`, e.g. `A_full-tile_150x150_x40.stl`. Part files: `{mark}_{slug(name)}_{detail}_x{count}.{ext}`, the label split at its first comma, e.g. `C1_wall-clip_standard-fit_x68.stl`, `K1_key_15.8mm_x110.stl`, `F3_test-clip-1_snug_x1.stl`.
- The zip: the tiles at its root, then each printed part in its group's folder (`mount/` for the clips, `join/` for the keys), then `setting-out-plan.svg` and `README.txt`: models plus part files plus 2. There is no mounting plan: each tile places its own clips. The README carries the design summary, an EDGES section with the resolved joint edge and profile (only when either leaves the default), MODELS with a parts table giving each part's folder, LAYING OUT (with keys or clips the order the tiles go up comes from their mounting section, and on clips step 2 sends the maker to the start line instead of the setting-out point), PRINTING (tiles face up, no supports, each part kind's print note, and `ELEPHANT_FOOT_NOTE` when the wall really uses keys or clips), KEYS BETWEEN TILES when keys are on, then MOUNTING ON WALL CLIPS (clips, with or without keys) or MOUNTING WITH KEYS, each printing the guide's lede and "You will need" and numbering `mountingGuide`'s steps word for word, or the glue MOUNTING paragraph. No strength figure anywhere. The download page counts its files with `zipContents` by the same rules, naming each group's folder. The fit test is in no wall zip: `/fit-test` zips its own (`features/fit/fitTestZip.ts`, the parts flat at the root plus `buildFitTestReadme`), which is why every consumer of the parts asks `wallParts` for the download's and `fitTestFor` for the test's.

## Fixings (keys, tabs, wall clips, the fit test)

Every system is optional and off by default. There are two questions, not three: how the wall holds the tiles (glue or tape, or wall clips) and how the tiles hold each other (nothing, keys, or tabs), so keys and tabs are alternatives to each other while either works with the clips. Both locks make exactly the same promise, in the same words: they lock tiles edge to edge in the plane of the wall (in line, with even joints; the wall or the clips keep them flat) and neither carries a tile. A key resists nothing along the wall's normal, so a tile on clips and keys still comes off alone; a tab is the one asymmetry, because it cannot rise past the ceiling of the socket it stands in, so a tabbed row comes apart from its right-hand end (see Tabs below). A lock or the clips need a plate of at least `MIN_FIXING_THICKNESS` (4 mm); below it no recess is cut and `'thin-base'` says so, with the fix "Use the Standard base". `fixing/capability.ts` answers whether a design can cut its recesses at all (`keyNotchDepth`, `keysPossible`, `tabDepth`, `tabsPossible`, `socketWidth`, `tabLimits`, `clipsPossible`) for the layout, the fixings, the studio and the download page alike. Clearance lives on the printed keys and clips (`fitClearance`, by `config.fit`), whose notches and pockets are nominal, so a wrong fit there costs a reprint of the part and never of a tile; the tabs are the one exception, because their clearance is cut into the socket (`SOCKET_CLEARANCE`), which is why `geometryKey` includes `fit` for them alone and why their fit test is printed BEFORE the tiles. No force, hold or load figure is claimed anywhere and nothing has been printed: the fit test is the measurement.

What gets described follows what the plans place, not the switches: `fixingSystem(config, mount, join, tab)` (`fixing/guide.ts`) is keys only when `joinPlan` places a key, tabs only when `tabPlan` really mates one, clips only when `mountPlan` places a clip, and then `'both'` or `'clips-tabs'`, or else glue. The guide, the README, the setting-out notes, the studio's step 7 (`explainMounting`) and the fit test all follow it, so a lock asked for on a plate that cannot hold it, keys on a wall with no joint long enough, tabs on a joint too wide to hide one or on a wall whose pieces are too narrow for a socket, or clips on tiles too small for a pocket give the glued wall plus the note that says why.

- Keys (`fixing/joins.ts`). A flat square-shouldered dog-bone ("bow-tie key") pressed from the back into two notches that straddle an interior joint. Notch depth (`keyNotchDepth`, the only copy of the rule) `min(3, thickness - joint edge size - 1.6)`, rounded down to 0.2 mm, at least 1.2 mm (else no keys); the key is 0.4 mm thinner. The notch is a 0.4 mm mouth chamfer, then a vertical prism with a flat bridged ceiling. The lattice, tile-local: keys across a vertical joint at `y = (2i + 1)H / (2 n_v)`, `n_v = 2` (4 from 240 mm); keys across a row joint at `x = (2i + 1)W / (2 n_h)`, `n_h = 2` for a straight or half bond and 3 for a third bond (doubled from 240 / 360 mm). In a running bond the row-joint positions are spaced `(W + joint) / n_h` around the tile's middle so both rows' notches meet with a joint (the formula above when the joint is 0).
  - Crowding: where the footprints of two notches (mouth included) would come within the 3 mm margin at a corner, each vertical joint takes one key at mid-height (68 to 71 mm tiles do), and where a piece's notches still crowd, its row-joint notch gives way. A row-joint notch is cut only at a lattice index whose partner in the next row (`rowShift` steps along in a running bond) fits a whole tile (`KeyGeometry.rowIndices`), so a small third-bond tile carries no row notch that could never take a key.
  - A notch goes only on an interior side (never on a boundary or cut side, never under the dropping part of a chamfer, bullnose or ogee profile) where the key plus 3 mm margins fits and the piece is deep enough (11 mm, or 19 mm when the opposite side is interior too). It depends only on its own piece and the design, never on a neighbour, so a key goes wherever both neighbours carry the notch and an unused notch is harmless. `keyNotchSites` gives each notch's side and centre along it, in `keyPockets`' order. One key model per design (`wallKeySpec`, at the design's fit), count = keys + 5 % rounded up, mark K1, group `join`.
  - `joinPlan` also counts `blocks`, the groups the keys hold together (a union-find over the placements). `keyCoverageNote` speaks only when there are two or more: "groups" to glue together when whole tiles key their rows, else "strips" because no key fits across the joints between rows at this size and pattern, naming the brick pattern and the smallest tile of the same proportions that would key them (both computed).
- Tabs (`fixing/tabs.ts`). The one lock with nothing to print: a rigid TAB standing out past a tile's interior right side,
  in the SOCKET cut into the interior left side of the tile beside it, both wholly inside the back plate, so the top
  surface, the grid, the joint edge and the perimeter profile are untouched and the tile is unchanged from the front.
  Vertical joints only, one uniform hand (`TAB_SIDE` 1, `SOCKET_SIDE` 3), never on the boundary of the wall. The hand
  cannot be anything else: a checkerboard would not survive piece dedupe, since a placement's parity is not part of its id.
  - The section is the printed key's, halved. The tab is `notchOutline` with the joint bridged into its neck instead of a
    second head, mirrored out past the side line; the socket is that same outline grown by the fit clearance, which is the
    key notch itself. One tested ring function serves both, and because a grown outline is the nominal one's offset curve
    the gap is the clearance at every point of the boundary, fillets included. Depth is `tabDepth` (`keyNotchDepth` gated at
    `TAB_MIN_DEPTH`), reach is `config.joint + TAB_REACH` (8 mm at the default joint), and the head, neck, fillets, margin,
    mouth and y lattice are the key's own, so switching a design between Keys and Tabs leaves the features in the same places.
  - The one failure that would ruin the pair: the tab is `KEY_RECESS` (0.4 mm) THINNER than its socket is deep, so it can
    never bottom out on the socket's bridged ceiling and hold its neighbour off the wall. `TAB_MIN_DEPTH` (1.6 mm) is that
    recess plus the socket's mouth, the backs' mismatch (`BACK_MISMATCH`, `SAG_RANGE[1]` = 0.2) and one `MIN_ENGAGEMENT`
    (0.6), which is why a socket needs more plate than a key notch: a 1 mm edge between tiles leaves a key its notch and a
    tab none. `TAB_BELOW_RIM` = `KEY_CEILING_COVER` + `KEY_RECESS` = 2.0 mm is how far the tab's top always stays below the
    rim of the joint edge, and `TAB_JOINT_MAX` is that same number: a joint no wider hides the tab, a wider one places none.
  - `tabChecks(tabGeometry(config))` holds the section, over every plate, joint, joint edge, tile size and fit a maker can
    reach (`tabs.test.ts`): engagement at least 0.6 mm (the boundary by construction at the thinnest qualifying plate,
    0.8 at the default), air under the ceiling 0.2 mm, shoulder overlap at least `MIN_SHOULDER` 1.2 mm (2.55 at worst over that
    grid, where the head is the full 12 mm; it narrows with the lattice on tiles under 36 mm, to 8 mm at 20 mm, and the
    shoulder still clears its floor there), 3 mm of wall beyond the socket, 2.0 mm of rim over the tab,
    the tab at least `KEY_DEPTH_MIN` thick, and every clearance positive. Joint play is the clearance itself: 0.15, 0.30 or
    0.45 mm, twice the loosest printed key's, because a tab and socket pair carries the printer's error on BOTH halves where
    a key carries it on one. `MIN_SHOULDER_FILLET` caps the mouth chamfer at the loosest fit so the mouth ring still lofts
    onto the body ring; nothing else moves with the fit.
  - Where the pair goes: `pieceSockets` asks nothing but its own piece, because an empty socket is harmless, so it is cut
    wherever `notchSites` allows one on side 3 (interior sides only, never on a boundary or cut side, never under a dropping
    border profile, the piece at least `socketWidth(config)` wide). `pieceTabs` is the opposite: a tab with nothing to enter
    would bear on the neighbour's back plate and stand that tile off the wall, and a piece cannot see its neighbour, so it is
    cut only where `PieceEdges.tabs` says the LAYOUT found one. That makes `socketWidth` the hinge of the whole feature and
    the reason it is not simply `TAB_MIN_WIDTH`: a border profile that drops to the rim takes the top away as far as
    `perimeterDrop(config)` in from the side it shapes, and `notchSites` refuses a socket under it, so a narrow end cut at a
    shaped edge needs the drop beyond its socket where an ordinary piece needs only the margin. `tabbedWall.test.ts` walks
    every wall, profile, origin and bond that leaves a narrow piece at the end of a row and holds every tab mated.
  - `tabPlan` then says what the wall really locks, within rows only: nothing of the tabs crosses a row joint, so a tab wall
    is one rigid strip per row, always, by design. That is stated in the card note, the guide, the README and step 7's "Good
    to know" rather than reported, and `keyCoverageNote` stays gated on `keysPossible` so it can never call the row count a
    defect. `unlockedPieceIds` are the pieces no tab locks to either tile beside them; a piece with no tile beside it in its
    row is not among them.
  - Assembly, and the one property worth saying: the socket is open at the tile's back, so the press onto the wall is the
    whole engagement. There is no click and none is possible (the cross-section is constant in z over the whole insertion
    path, so no locking face is ever passed), and the copy never implies one. What the pair does give is a check: the head is
    wider than the throat at every depth, so a tile held at the wrong joint stands proud instead of lying down. A tab wall
    cannot be laid face down and lifted on, the way the keyed guide does it, because face down the sockets open away from the
    bench; tiles go up one at a time, left to right along each row, which is the order the tiling plan already sets out.
    Coming apart is that order reversed, and the geometry is why: a tile lifts its own socket off the tab beside it freely,
    but its own tab has only `KEY_RECESS` of air above it under the next socket's ceiling, so it cannot rise past that
    ceiling while the tile to its right is up. A row comes off from its right-hand end (`TAB_OFF` in guide.ts).
  - What leaves the fixings: `tabLimits(config).projection`, how far a tab stands out past its side. The printed box is that
    much wider than the tile, and exactly two things follow it, or they lie to the maker: the bed check and the plate count.
    Everything else keeps the nominal tile. The tabs cost no clip room on an ordinary tile (nothing of theirs crosses a row
    joint, so `clipBandOffset` stays at 10.1 mm where keys would push it to 19.5), but on tiles between about 70 and 110 mm
    the lattice does put a socket within `KEY_CLEAR` of the horizontal band, which is why `clipSites` avoids
    `[...keyPockets, ...pieceSockets]` and not the key notches alone. A tab adds material outside the footprint, so it costs
    no clip room at all. `seatedParts` has nothing to seat for a tab, which is correct: it is part of the tile.
- Wall clips (`fixing/mechanism.ts`, `fixing/mount.ts`). A small flat clip that lives wholly inside a closed pocket (`side: null`) in the back of each tile, so nothing but the tape under its clips stands between a tile's back and the wall. The tile places its own clips: a clip clicks into each pocket, a piece of thin double-sided tape goes on each clip's centre block, and the tile is pressed into its place, so the tape holds each clip on the wall exactly where that tile needs it. Nothing is measured or drawn for the clips; the start line is the only line. A tile pulls straight off, leaving its clips on the wall, and clicks back onto them.
  - The section: the clip and its pocket are designed together, with named constants and tested checks. The pocket prints face up with the tile, so it opens at the bed: a 0.8 mm 45° mouth (the push-on lead-in, with room for the first layer's elephant foot), a 0.2 mm vertical land, then a 40° flare that widens up to a flat bridged ceiling at `POCKET_DEPTH` (2.8 mm). The depth keeps 1.2 mm of plate at the 4 mm base and never grows with a thicker plate, so one clip fits every design; the footprint is 51.62 × 16.02 mm. A void that widens upward always prints, and the mesher takes the flare as a loft in a closed pocket. The clip prints flat on its back (the wall side on the bed), solid: 48 mm long, 2.4 mm thick, 14.54 mm across its barbs at the standard fit. Its four tines (1.2 mm wide, 15 mm free) fold in towards a middle spine as their barbs pass the pocket's lip and spring out under it, their 40° return faces (the clip's only overhangs) bearing on the flare. Only the centre block reaches the lips (`FLOAT` 0.15 is less than the tines' `PASS` 0.2), so the tile's weight hangs on it and the tines only pull the tile towards the wall.
  - The stops: two permanent ribs on the centre block (`STOP_WIDTH` 1.2, 9 mm long, `STOP_HEIGHT` 0.4), along its long edges, 4.95 to 6.15 mm off the centre line, where the bridged ceiling droops least. A clip clicked in rests with its stops on the ceiling and its back level with the tile's back, clamped between its barbs and its stops, and that is also its seated state on the wall: the clip's place in its pocket never depends on the tape. The barbs pull the tile towards the wall and the tape under each clip holds it off by its own thickness, so the tile's back sits `wallGap(tape, sag) = tape + sag` off the wall: 0.1 to 0.3 mm with thin tape (`TAPE_RANGE`, 0.2 nominal), plus any droop of the ceiling where the stops bear. Nothing is ever broken off a clip.
  - Checks (`clipChecks(clearance, sag)`, held by `mechanism.test.ts` over every fit class and a ceiling droop of 0 to 0.2 mm, `SAG_RANGE`): every tine strain at most 2 % (`MAX_ARM_STRAIN`), counting the fold across the catch plus the lift out of the wall's plane that a sloped face adds, since both peak at one corner of the root: clicked in off-centre 1.69 % at worst (snug fit), pulled off 1.54 %, held 0.42 %, and at least 0.2 % of margin kept. Catch at least `MIN_CATCH` (0.5 mm; 0.52 at worst); preload above 0 at snug and standard and never below 0 at loose (0.16 to 0.33, 0.08 to 0.25 and 0 to 0.17 mm), so no fit rattles; at least `CEILING_ROOM` between the clip's body and the ceiling where it droops most (0.2 mm at least); lead-in (0.18) and flare room (0.39) over their margins; the clip's back never inside the tile's back. A wider, thicker or shorter tine, or a bigger catch, fails them.
  - Fit: `CLIP_CLEARANCE` moves the barbs in by 0.12, 0.2 or 0.28 mm (snug, standard, loose) and changes nothing else, so the tines keep their stiffness and the pockets never depend on the fit.
  - Screws (optional): the centre block carries a 5.3 mm hole for a 5 mm drill and wall plug and a 7.5 mm 90° countersink, so the clip is its own drill guide and a 3.5 mm countersunk screw's head ends below the clip's top, clear of the ceiling.
  - Where clips go (`clipSites`, a pure function of the design and the piece's crop, size and edges, so piece ids still dedupe): horizontal clips (`'h'`, along the wall) on two bands, the pocket centre at `clipBandOffset` from the piece's bottom and top edges: 19.5 mm when keys are cut, which keeps `KEY_CLEAR` (3 mm) of plate to every row-joint notch wherever the lattice puts it, else the pocket's half height plus a side wall (10.1 mm, more where the joint edge's run is wider than 2 mm), pushed further in past a profiled side's band by `PERIMETER_CLEAR` (2 mm). A piece too short for two bands gets one centred band instead. Along a band, clips sit on the whole tile's lattice (its middle, or its quarters from `DOUBLE_AT`, 240 mm, wide) where the pocket keeps its side walls (`CLIP_SIDE_WALL`, 2 mm, or the joint edge's run) and 3 mm of plate to every key notch, else in the middle of the widest stretch that does, so a cut piece still takes its clip. The heights are searched, not assumed: the preferred bands first (a whole tile keeps the pair it has always had), then the centred band, then every height the piece's walls allow, in `SCAN_STEP` (0.5 mm) steps out from the middle, lower first and the two ends last, stopping at the first that takes a clip. So a piece boxed in on its bands by key slots still gets one, and a piece too narrow for a horizontal clip skips the scan outright. A piece too narrow for a clip along it but as tall as one is long (about 55.6 mm, walls included) takes turned clips (`'v'`) across, at the x nearest its middle that its side walls allow and failing that at the first x the same scan clears, on the tile's height lattice along. A piece with room for neither has no pocket (`unmountedPieceIds`, `'no-mount'`): keyed to its neighbours or glued. Every position is rounded to 0.01 mm inside its own stretch, never onto a margin, so the answer stays a deterministic function of the piece.
  - `mountPlan` lists every clip over every placed tile (`ClipSite`, surface mm, bottom to top then left to right; a whole 150 mm tile takes two), and `mountParts` prints them from one file: C1, "Wall clip, standard fit" (the design's fit), count = clips + 5 % spares rounded up, group `mount`, id `clip-c0.2` at the standard fit, printed "flat on its back as it comes, stops up", solid.
- Seated parts (`fixing/seated.ts`). `seatedParts(config, piece)` puts the download's own parts where they sit in one piece, from the same sites the pockets are cut at: each clip in its pocket at z = 0 (its back level with the tile's back), a quarter turn for a `'v'` pocket; each key half in its notch and half out past the side, centred on the middle of the joint and pressed home against the notch's ceiling (z = notch depth - key thickness), as keys go in before the next tile goes up. The 3D Back view and the tile-back figure both read it.
- Fit test (`fixing/fitTest.ts`, group `'fit-test'`, marked F1... in print order: coupons, then clips, then keys). It tests only what the wall prints or cuts: `fitTestFor` reads `FitTestUses` off `wallParts` (clips when `mountParts` prints a clip, keys when a joint takes one) plus `tabPlan` for the tabs, which print nothing at all, so the plan is the only witness that they are there; each is gated again by `clipsPossible` / `keysPossible` / `tabsPossible`, so a wall whose lock or clips place nothing gets no fit test. Coupon A is cut by the real tile mesher from a synthetic piece of the design's relief and plate (shape key `clip: 1` when it holds a pocket), with a clip pocket along x at mid-height near its left side and, with keys, a key notch on its right side at mid-height, the two `KEY_CLEAR` apart. With keys, coupon B has A's height, a notch on its left side facing A's, and continues A's relief from where A ends, so the two butt like two tiles of the wall and a key is tried across a real joint (both print at the tiles' own settings, first layer included). With tabs, coupon A carries the tile's own tab on its right side instead, and THREE coupon Bs carry the facing socket at snug, standard and loose, told apart by one, two or three notches cut into their right side away from the socket (role `'fit-mark'`, never on a tile): all three come out one size, because `mateLayout` sizes them from the loosest fit's ring, so what the maker keeps is a fit and not a size. Then three clips (`clipSpecForFit`, the wall's clip, stops and all) and / or three keys at snug, standard and loose, marked 1, 2 and 3 by small notches (a clip's in the end of its spine, clear of the tines): F1 to F8 with keys and clips, F1 to F4 with clips only, F1 to F5 with keys only, F1 to F4 with tabs only (one tabbed A, three socket Bs) and F1 to F7 with tabs and clips. The guide reads the clips with the maker's own tape: each test clip stuck flat side down on a smooth board, coupon A pressed on and pulled off, and the snuggest that clicks on, sits flat, does not rattle and stays on the board is kept. The tabs are read the same motion the wall uses: coupon A back down on a flat board, each socket coupon brought down over its tab with the joint closed, and the snuggest that goes together with both backs flat and no play across the joint is kept. If none will, the first layer is bulging and elephant-foot compensation is the answer.
- Warnings (`fixing/warnings.ts`): `'thin-base'` (keys or clips on a plate under 4 mm, named by what they need, "their slots", "their pockets" or both, which then suppresses the next two; or keys on a thick enough plate whose joint edge leaves no room for a notch, fixed by "Use the Sturdy base, or a smaller edge between tiles", or by the smaller edge alone when Sturdy would not help), `'no-mount'` (the pieces with no clip, the biggest carrying the `pieceId`, counted as they go on the wall and not as files: the marks, then "(7 on the wall)" when the placements say more than the marks do. The cause is said in the piece's own terms: too small, too narrow, or no room for a clip beside its key slots or sockets (`recessesBlock`, worded by `recessWord`: the same piece takes one as soon as the lock is off), or both when the pieces differ. The fix splits exactly as the guide's own no-clip step, so the note and the download page cannot disagree: a piece its lock still reaches takes a drop of glue in its key slots or its socket, the rest are glued to the wall. With no `pieceId` when no piece of the wall takes a clip, and then the fix is turning the lock off, glue, or bigger tiles), `'no-key'` (the pieces keyed to no neighbour, named; and `keyCoverageNote`, with no `pieceId`, when the keys hold the wall in more than one block), `'no-lock'` (the tabs locking nothing, one cause at a time and never the row count: a joint over `TAB_JOINT_MAX`, with the fix "Close the joint"; nothing locked at all, either because the wall is one tile wide or because no two tiles beside each other are as wide as a socket needs, with no `pieceId`; or the pieces a tab leaves out, said in their own terms (too narrow for a socket, no tile beside them wide enough for one, or both when they differ) and fixed by gluing them to the tiles beside them, or on clips by going up on their own. A piece already told to glue itself to the wall by `'no-mount'` is left out, so the maker is never sent two ways) and `'profile-clamped'`. `'thin-base'` names whichever lock is on and the recess it needs ("their slots" or "their sockets", with "and pockets" on clips), and its deep-joint-edge branch runs for a socket too, at the socket's own depth rule. The studio words each one the same way, off the same plans, and offers a one-click fix (`features/studio/warningCopy.ts`, `planFixes.ts`: the Standard base, evened-out edges or a perfect-fit tile so every piece takes a clip or locks to its neighbour, "Leave the keys out" or "Leave the tabs out" where the lock's own recesses are what leaves the wall without clips (`lockOff`, offered before glue and only when it really places clips), or glue).
- "Putting it up" (`fixing/guide.ts`, the one place the steps are worded). `mountingGuide(input)` gives a lede, what to have to hand and numbered steps, each with a drawing from `features/fixing` (`GuideDrawing`) or none. Glued: the lede alone, frozen. Keys only: step 1 (the fit these files were made at, and a pointer to the fit-test page), laying the tiles face down in plan order, pressing the keys in, putting the panel up on a level line. Tabs only: the same step 1 (worded for a fit that is cut into the tile, so it is settled before a single tile is printed), the start line, setting the tiles bottom row first and left to right (`TAB_HOME` how a tile goes home, `TAB_CHECK` the only check it offers, `TAB_ORDER` why a tab wall is never laid out face down), and the pieces no tab locks when there are any. Clips: the same step 1, clicking the clips in until their stops touch the bottom of the pocket (with the count and spares), tape on each centre block and never on the springy arms (not foam), the start line with a batten under it for the bottom row, keys as you go when both are on (into the slots that meet a tile not up yet), pressing the tiles on from the batten row by row as the tiling plan sets them out, the pieces with no clip when there are any (a thin glue or the same tape, or with keys a drop of glue in their key slots), screwing the clips on (optional: one tile at a time, pulled off, drilled through each clip, plug level with the wall, the head down in the countersink) and taking a tile off (a straight pull; its clips stay; with keys, press any key back first). With tabs the clips path is unchanged step for step and gains no step of its own, because a tab needs no separate action: the lede gains a sentence, `pressOnStep` the left-to-right order with `TAB_HOME` and `TAB_CHECK`, and both `screwsStep` and `removeStep` gain `TAB_OFF`, the one place the order a row comes apart in is worded. `mountingSummary` says the same in at most three lines for the studio's "You'll do", opening with the one line "Print the fit test and set the fit."
- Three sentences of the tabs' copy are each written exactly once, in `guide.ts`, and read by both tabbed systems: `TAB_HOME`, `TAB_CHECK` and `TAB_ORDER` for going up, `TAB_OFF` for coming off. The three facts they carry are the ones the whole feature rests on: the tabs hold the joint shut in the plane of the wall and not the tile against it (the keys' own promise, in the keys' own words); a tab wall is built on the wall, one tile at a time, and never as a panel; and nothing locks one row to the next, which is the design and not a fault.
- Running the fit test is a second guide, `fitTestGuide` (`fixing/guide.ts`), and a page of its own, `/fit-test` (`pages/FitTestPage.tsx`, no three and no mesher): print the parts, press a test key across the joint of coupons A and B, click a coupon onto each test clip, press each socket coupon down over the tab, then set the fit. 4 steps with keys and clips, 3 with any one of them, null when the design cuts and prints no fitted part (the page then shows the plan's own warnings). The tabs get their own drawing (`'fit-tabs'`) rather than the keys': reusing `'fit-keys'` would draw a key being pressed across a joint on a wall that prints none. Both guides are `GuideStep[]`, so `features/fit/GuideSteps.tsx` renders either and chooses a step's drawing once. The page zips its own download and prints `buildFitTestReadme`; `mountingGuide`'s step 1 only points at it, and `fitChosenText` is the single sentence that says the chosen fit, its notches and its clearance per side, read by the page under its picker, that step 1 and the studio's Fit row.
- Where it shows: studio step 7, "Putting it up" (`features/studio/MountingGroup.tsx` over `mountingCopy.ts`): "On the wall" (Glue or tape, "Adhesive behind"; Wall clips, "Only tape behind") and "Tile to tile" (Side by side; Keys; Tabs) as drawn cards, the tile-to-tile group on its own `.joinGrid` of three columns that stacks on a phone, then the "What changes" well from `explainMounting`, read off the plans: "On your tiles" (`TileBackFigure` of tile A with its counts and depths, seen from the back, and "See the back of tile A"; a cut hero is called "piece A" instead, from `pieceName`), "You'll print", "You'll need", "You'll do" (`mountingSummary`), "Good to know", "Fit" (while keys or clips really print, and on a bare tabbed wall too, since Fit is then a tile setting: the picker, `fitChosenText` as its note, and a "Run the fit test" link to `/fit-test`) and "Also changed" (a thin plate raised to Standard in the same undo step by `withFixings`). Its heading names a system only once placed: "Glued", "Glued · with keys", "Glued · with tabs", "On clips", "On clips · with keys", "On clips · with tabs". Its counts are of tiles on the wall, not of printed files: the pieces with no clip are named by their marks and counted over the placements, and a clips-per-tile number is claimed only while every whole tile really carries it ("up to 2 in a whole tile" otherwise), with "Any tile with clips comes off on its own" while some pieces have none, and on a tabbed wall that line says which end a row comes off from instead. The studio plan draws each clip as a small outlined bar at its pocket (turned for a `'v'` clip) under the legend "Wall clips", with the start marker reading "SO" (the clips' start line is the bottom edge of the tiles), its tag taking the first of four corners that is inside the wall and clear of both centre lines and of every clip and key mark, and standing in the side column on the next pass when no corner is, and each key as a small solid dog-bone. Nothing is drawn for a tab: every tile carries its own, so there is no symbol, no legend row and nothing set out, and what tells the two piles apart is the "Full tile, no tab" label already on its own legend row. "Your pieces" lists the parts after the tiles, and a bare tabbed wall has none to list. The single-tile 3D view gets a Front / Back switch when the tile it shows has a pocket or a tab in its back (`backHasPockets`, whose name now covers both); its Back view draws the parts seated (`three/seatedSet.ts` over `seatedParts`, meshes built on the main thread from the download's own specs and cached by accessory id, never a part the download does not hold), in `partColor` (ink on a light tile, the panel color on a dark one, never the accent), shown only once the turn starts. Its label (`tileViewLabel`, in `seatedSet.ts`) names the piece the view really shows, at that piece's own size and called a tile only when it is a whole one, and the Back view adds the parts: "3D view of the back of piece A, 124 × 124 mm, in Green, with its 2 wall clips in place". The peek (`state/viewPeek.ts`, not persisted): a Keys or Wall clips card that cuts pockets into tile A calls `peekAfterChoice()` (at 1100 px and up only, where the view sits beside the steps), and "See the back of tile A" calls `peekAndShowView()` at every width (below 1100 px it also scrolls the view on screen, smoothly unless reduced motion asks otherwise). A peek shows One tile, back up, without writing the persisted `viewMode`; a pill over the view ("Back of tile A", or "Back of piece A" over a cut, the same `pieceName` words as the rest of step 7; then "Show the front"), a view mode button or the `1` / `2` shortcuts end it, while Front / Back, the view options and Reset keep the view as the maker's own. Any design edit but step 7's (mount, lock, fit and the plate they raise) ends it; a rename does not. The download page lists the wall's parts by group (wall clips, keys) with a download each, and lists none at all on a bare tabbed wall, which is also why its print notes ask two questions rather than one: the elephant-foot note follows the system (a socket meets the first layer's bulge as much as a pocket does) while the line about printing the parts follows whether this download really holds any. hangs the same "Run the fit test" link on step 1 of "Putting it up", prints `ELEPHANT_FOOT_NOTE` whenever the system is not glue (a socket and a tab both meet the first layer's bulge as much as a key or a pocket does), and "Putting it up" renders `mountingGuide` step by step with its drawings (a step with no drawing takes the whole card; a glued wall is one card).

## Visual world (UI owners: read before any UI work)

Direction: the tiler's setting-out drawing come alive. Read `.impeccable/surfaces/src-pages-studiopage-tsx.md` (direction contract) and `src/styles/_tokens.scss`. In short:

- A warm drafting sheet (`--sheet`) on a desk (`--desk`), graphite ink (`--ink`), pencil construction lines (`--pencil`, `--rule`), red pencil (`--red`) only for cuts/partial tiles and the primary action, chalk-line blue (`--chalk`) for guides, selection and focus.
- Archivo Variable only. Title-block field labels: `font-stretch: 125%`, uppercase, `--text-2xs`, weight 600, letter-spacing 0.06em. Body `--text-md`. Every number `tabular-nums` with its unit.
- Square corners (paper), 1px hairlines, 2px ink frame on sheets and views, hatching (`--hatch-red`) as the only fill texture. Views carry drawing titles under them ("1  ELEVATION", "2  PLAN").
- No cards-as-structure, no eyebrow/kicker labels above headings, no gradient text, no glass, no colored side stripes, no hard offset shadows, no emoji or unicode icons (use lucide-react), no monospace costume.
- Theme browser surfaces (selection, focus, scrollbars) from tokens (done in `_base.scss`); every interactive element needs hover, focus-visible, active, disabled states; honour `prefers-reduced-motion`.
- Motion: one authored moment (the re-lay wave in 3D); UI transitions use `--ease-out` and `--t-*` tokens, from an already-visible default.
- Copy: plain, spatial, the product's own words ("Your wall takes 40 full tiles and 8 cuts."). Controls name their action. Errors say what is wrong and how to fix it, with a one-click fix when possible. No em-dashes anywhere (use a colon, parentheses or a hyphen). English.
- Component styles: CSS modules (`Component.module.scss`) using the tokens; `@use '@/styles/mixins'` if you need shared mixins (the ui owner creates `src/styles/_mixins.scss`).

## Code conventions

- TypeScript strict, no `any` unless unavoidable (and commented). Explanatory names; comments only where they explain why, one line where possible.
- Keep `src/core` free of DOM and three imports.
- Tests with vitest next to the module. `npm test`, `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`.
- No em-dashes (U+2014) in code, comments, copy or docs.
