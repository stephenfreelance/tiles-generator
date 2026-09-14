# Tessera architecture

Frontend-only app (no backend). The browser computes the layout, generates tile meshes in a Web Worker, renders the preview with react-three-fiber, and writes STL / STEP / zip files locally. Designs persist in localStorage.

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

Rendering gotchas (verified against the installed versions): use `shadows="percentage"` (PCFSoftShadowMap is gone in r186), never drei `<SoftShadows>` (fails to compile on r182+), never `<Environment preset>` (downloads HDRIs; use `<Lightformer>` children), `EffectComposer multisampling={0}` + `<SMAA/>` (MSAA breaks N8AO) and end the chain with `<ToneMapping mode={NEUTRAL}>` because the composer forces `NoToneMapping`. DataTextures need explicit `colorSpace`, filters and `needsUpdate`.

## Units and coordinates

- Every length is millimetres. Display units (mm/cm/m) are a UI concern (`src/core/units.ts`).
- Surface coordinates: origin bottom-left, x right, y up.
- Tile-local / piece-local: a piece spans `(0..width, 0..height)`, z up, bottom face at z = 0, base plate top at `z = tile.thickness`, relief above it up to `thickness + texture.depth`.
- Pattern coordinates: a cut piece with crop `{x0,y0,x1,y1}` samples the height field at `(x0 + x, y0 + y)`. Because the field is periodic over the tile (or tile / row-shift cycle), a cut piece carries exactly the slice of pattern of the tile it replaces, so the relief is continuous across every joint.
- three.js preview: wall mounting shows the surface upright (print z toward the viewer); floor mounting lays it flat (`rotation-x = -π/2`). Scene units are mm.

## Module map and ownership

```
src/
  core/                 pure TypeScript, no DOM, no three: runs in the worker and in vitest
    types.ts            domain model (DesignConfig, PieceSpec, LayoutPlan, MeshData)      [lead]
    units.ts config.ts layout.ts printers.ts filaments.ts                               [lead]
    textures/           height-field patterns                                            [textures]
      types.ts          TextureDef / ParamDef / HeightField contract                     [lead]
      noise.ts          seeded PRNG + periodic noise
      patterns/*.ts     one file per texture (or small groups)
      registry.ts       TEXTURES, textureById, resolveParams, createHeightField
      hillshade.ts      CPU relief swatch renderer (chips)
    geometry/           watertight tile meshes                                            [mesh]
      heightfield.ts    top-surface sampling with bevel, per piece
      tileMesh.ts       buildPieceMesh (uniform grid) + adaptive variant for export
      normalMap.ts      bakeNormalMap for the preview
      meshChecks.ts     manifold / orientation / volume checks
    export/                                                                              [mesh]
      stl.ts step.ts zip.ts readme.ts filenames.ts
    plan/               setting-out drawing model + SVG string                           [worker]
      planModel.ts planSvg.ts
    estimate.ts         filament weight / spools / plates                                [worker]
  workers/                                                                                [worker]
    protocol.ts         message contract                                                 [lead]
    geometry.worker.ts  handler (handleRequest is a pure, testable function)
    geometryClient.ts   promise API with cancellation and progress
  hooks/                usePreviewMeshes, useTextureChips, useVolumes, useExport, useLayout [worker]
  three/                3D preview                                                        [viewport]
    TileViewport.tsx    public component + imperative handle
    ...                 environment, lights, materials, instancing, camera, dims, post
  ui/                   design-system components, CSS modules                             [ui]
  styles/               tokens, base                                                     [lead, ui may add partials]
  app/                  router, shell                                                    [studio]
  pages/                StudioPage, LandingPage, ExportPage, HistoryPage, NotFoundPage   [studio | pages]
  features/             page-specific components (studio/*, plan/*, export/*, history/*, landing/*)
```

Only edit files you own. Files marked [lead] are read-only contracts; if one blocks you, work around it locally and describe the needed change in your report.

## Contracts

- `src/core/types.ts`: the domain model. `DesignConfig` is the persisted design.
- `src/core/layout.ts`: `computeLayout({surface, tile, joint, layout, bed}) -> LayoutPlan` (pieces with marks A, B, C..., placements, warnings) and `perfectFitSizes`. Tested.
- `src/core/config.ts`: `DEFAULT_CONFIG`, `LIMITS`, `SURFACE_PRESETS`, `normalizeConfig` (clamps anything into a valid config).
- `src/core/textures/types.ts`: pattern samplers are periodic with period 1 over one period, heights in [0,1]. `createHeightField(config)` (registry) returns heights in mm above the base plate, periodic over `(tile.width / rowShiftCycle, tile.height)` so running bonds stay seamless.
- `src/workers/protocol.ts`: preview / export / volumes / chips requests and results.
- Stores (`src/state`): `useDesign` (config + undo/redo; `update(recipe, {coalesce})`, `load`, `undo`, `redo`, `reset`), `useHistory` (saved designs with WebP thumbnails, max 40), `usePrefs` (view mode, mounting, light angle, toggles, export format/quality, open title-block section).

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
export function renderReliefChip(config: DesignConfig, opts: { sizePx: number; crop?: CropRect }):
  { width: number; height: number; data: Uint8ClampedArray } // lit relief in the filament color, piece shape and bevel included
```
`src/core/geometry/heightfield.ts` [mesh]
```ts
export function effectiveBevel(config: DesignConfig): number
/** Top-surface z (mm, from the bottom face) of a piece at piece-local (x, y), bevel included. */
export function pieceTopSampler(config: DesignConfig, field: HeightField, piece: Pick<PieceSpec, 'crop' | 'width' | 'height'>): (x: number, y: number) => number
```
`src/core/geometry/tileMesh.ts`, `normalMap.ts`, `meshChecks.ts` [mesh]
```ts
export interface PieceMeshOptions { cellMm: number; adaptive?: { toleranceMm: number } }
export function buildPieceMesh(config: DesignConfig, field: HeightField, piece: PieceSpec, options: PieceMeshOptions): MeshData
export function bakeNormalMap(config: DesignConfig, field: HeightField, piece: PieceSpec, texelMm: number):
  { width: number; height: number; data: Uint8Array }
export function meshVolume(mesh: MeshData): number        // mm³, positive for outward normals (meshChecks.ts)
export function checkMesh(mesh: MeshData): { closed: boolean; manifold: boolean; oriented: boolean; boundaryEdges: number; volume: number }
export const QUALITY_CELL_MM: Record<ExportQuality, number>                       // tileMesh.ts
export const STEP_QUALITY: Record<ExportQuality, { cellMm: number; toleranceMm: number }> // tileMesh.ts
```
`src/core/export/*` [mesh]
```ts
export function writeStl(mesh: MeshData, header: string): Uint8Array           // binary, little endian
export function writeStep(mesh: MeshData, opts: { name: string }): Uint8Array   // ISO 10303-21, AP214, one closed shell
export function pieceFileName(piece: PieceSpec, format: ExportFormat): string
export function buildReadme(config: DesignConfig, plan: LayoutPlan, format: ExportFormat): string
export function zipFiles(files: { name: string; data: Uint8Array }[]): Uint8Array
```
`src/core/plan/*`, `src/core/estimate.ts` [worker]
```ts
export function buildPlanModel(config: DesignConfig, plan: LayoutPlan): PlanModel  // drawing primitives (tiles, cuts, dimension chains, marks)
export function planSvg(config: DesignConfig, plan: LayoutPlan, opts?: { title?: string }): string
export function estimateFilament(config: DesignConfig, plan: LayoutPlan, volumes: Record<string, number>): FilamentEstimate
  // grams (low/high range), spools of 1 kg, plates per piece for the chosen printer
```
`src/workers/geometryClient.ts` and `src/hooks/*` [worker]
```ts
export const geometryClient: {
  request<K extends WorkerRequest['kind']>(req: Extract<WorkerRequest, { kind: K }>, opts?: { signal?: AbortSignal; onProgress?: (p: Progress) => void }): Promise<WorkerResultMap[K]>
}
export function useLayout(config: DesignConfig): LayoutPlan                    // memoized computeLayout with the printer bed
export function usePreviewMeshes(config: DesignConfig, plan: LayoutPlan, detail: 'surface' | 'tile'):
  { pieces: Map<string, PreviewPiece>; pending: boolean; version: number }     // keeps the previous result on screen while rebuilding
export function useTextureChips(base: DesignConfig, items: { key: string; config: DesignConfig; crop?: CropRect }[], sizePx: number):
  Map<string, string>                                                          // key -> object URL (PNG), cached across renders
export function useVolumes(config: DesignConfig, plan: LayoutPlan): { volumes: Record<string, number> | null; pending: boolean }
export function useExport(): { run(req: Omit<ExportRequest, 'kind'>): Promise<ExportResult>; progress: Progress | null; busy: boolean; cancel(): void; error: string | null }
export function downloadBlob(data: Uint8Array, name: string, mime: string): void
```
`src/three/TileViewport.tsx` [viewport]
```ts
export interface TileViewportProps {
  config: DesignConfig
  plan: LayoutPlan
  mode: 'surface' | 'tile'
  mounting?: 'wall' | 'floor'
  lightAngle?: number          // degrees of key-light azimuth
  showDimensions?: boolean
  showLayerLines?: boolean
  highlightPieceId?: string | null
  interactive?: boolean        // false on the landing hero: no controls, slow auto orbit
  className?: string
  onPendingChange?: (pending: boolean) => void
}
export interface TileViewportHandle { capture(widthPx: number): Promise<string | null> } // WebP data URL for history thumbnails
export const TileViewport: React.ForwardRefExoticComponent<TileViewportProps & React.RefAttributes<TileViewportHandle>>
```

## Relief and mesh rules

- Height of the top surface at piece-local `(x, y)`: `z = thickness + h(x0 + x, y0 + y)` where `h = createHeightField(config)`.
- Bevel (45° chamfer on the top perimeter of every piece, `b = min(config.bevel, thickness / 2)`): with `d` the distance to the nearest piece edge, `z = z - (b - d)` for `d < b`, never below `thickness - b`. The cut follows the local surface, so the rim always drops by the full chamfer whatever the relief does there. Measuring it from the deepest possible relief instead (`min(z, thickness + depth - b + d)`) leaves flat and shallow textures with no chamfer at all. Apply it identically in the mesh builder, the normal-map baker and the chip renderer: `applyBevel` in `core/geometry/heightfield.ts` is the one helper.
- Meshes are closed 2-manifold solids with outward normals (CCW seen from outside), positive volume, bottom at z = 0. Top surface first in the index buffer (`topIndexCount`), then walls and bottom. Walls are fans from the bottom corners to the top rim (no T-junctions); the bottom is two triangles.
- Preview normals come from central differences on the global height function (not `computeVertexNormals`), so neighbouring tiles shade identically at the joint.
- UVs: pattern coordinates over the full tile, `u = (x0 + x) / tile.width`, `v = (y0 + y) / tile.height`.
- Export resolution by quality: draft ≈ 0.8 mm, standard ≈ 0.4 mm, fine ≈ 0.2 mm cells (STEP uses the adaptive mesher so flat regions become large planar faces).
- Files: `{mark}_{slug(label)}_{w}x{h}_x{count}.{stl|step}`, e.g. `A_full-tile_150x150_x40.stl`. The zip adds `setting-out-plan.svg` and `README.txt` (design summary, print advice: face up, no supports, 0.2 mm layers).

## Visual world (UI owners: read before any UI work)

Direction: the tiler's setting-out drawing come alive. Read `.impeccable/surfaces/src-pages-studiopage-tsx.md` (direction contract) and `src/styles/_tokens.scss`. In short:

- A warm drafting sheet (`--sheet`) on a desk (`--desk`), graphite ink (`--ink`), pencil construction lines (`--pencil`, `--rule`), red pencil (`--red`) only for cuts/partial tiles and the primary action, chalk-line blue (`--chalk`) for guides, selection and focus.
- Archivo Variable only. Title-block field labels: `font-stretch: 125%`, uppercase, `--text-2xs`, weight 600, letter-spacing 0.06em. Body `--text-md`. Every number `tabular-nums` with its unit.
- Square corners (paper), 1px hairlines, 2px ink frame on sheets and views, hatching (`--hatch-red`) as the only fill texture. Views carry drawing titles under them ("1  ELEVATION", "2  PLAN").
- No cards-as-structure, no eyebrow/kicker labels above headings, no gradient text, no glass, no colored side stripes, no hard offset shadows, no emoji or unicode icons (use lucide-react), no monospace costume.
- Theme browser surfaces (selection, focus, scrollbars) from tokens (done in `_base.scss`); every interactive element needs hover, focus-visible, active, disabled states; honour `prefers-reduced-motion`.
- Motion: one authored moment (the re-lay wave in 3D plus the plan's dimension chains redrawing); UI transitions use `--ease-out` and `--t-*` tokens, from an already-visible default.
- Copy: plain, spatial, the product's own words ("Your wall takes 40 full tiles and 8 cuts."). Controls name their action. Errors say what is wrong and how to fix it, with a one-click fix when possible. No em-dashes anywhere (use a colon, parentheses or a hyphen). English.
- Component styles: CSS modules (`Component.module.scss`) using the tokens; `@use '@/styles/mixins'` if you need shared mixins (the ui owner creates `src/styles/_mixins.scss`).

## Code conventions

- TypeScript strict, no `any` unless unavoidable (and commented). Explanatory names; comments only where they explain why, one line where possible.
- Keep `src/core` free of DOM and three imports.
- Tests with vitest next to the module. `npm test`, `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`.
- No em-dashes (U+2014) in code, comments, copy or docs.
