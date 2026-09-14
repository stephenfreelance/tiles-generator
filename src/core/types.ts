// Domain model shared by the UI, the 3D preview and the geometry worker.
// Every length is in millimetres; display units are a UI concern only.

export type LengthUnit = 'mm' | 'cm' | 'm'

export type ExportFormat = 'stl' | 'step'

/** Mesh density of exported files: draft ≈ 0.8 mm cells, standard ≈ 0.4 mm, fine ≈ 0.2 mm. */
export type ExportQuality = 'draft' | 'standard' | 'fine'

/** How the tile grid is anchored on the surface before cutting partial tiles. */
export type LayoutOrigin =
  /** Whole tiles read from the top-left corner; all cuts land on the right and bottom edges. */
  | 'corner'
  /** Grid centred on the surface; equal cuts on opposite edges. */
  | 'center'
  /** Centred on a tile or on a joint, whichever gives the widest edge cuts (what tilers do). */
  | 'balanced'

/** Horizontal shift of every other row, as a fraction of the tile width (running bond). */
export type RowOffset = 0 | 0.5 | 0.3333

export interface TextureSettings {
  id: string
  /** Relief amplitude above the base plate, mm. */
  depth: number
  /** Target feature size, mm; converted to an integer repeat count per tile so edges stay seamless. */
  scale: number
  /** Texture-specific parameters, keyed by ParamDef.key. Missing keys fall back to defaults. */
  params: Record<string, number>
  /** Seed for noise-based textures. */
  seed: number
  /** Swap peaks and valleys. */
  invert: boolean
  /** Quarter-turn of the pattern inside the tile (directional textures only). */
  rotate: boolean
}

export interface DesignConfig {
  version: 1
  name: string
  /** Surface to cover, mm. */
  surface: { width: number; height: number }
  /** Unit used to display and edit the surface size. */
  surfaceUnit: LengthUnit
  /** Nominal tile, mm. `thickness` is the solid base plate under the relief. */
  tile: { width: number; height: number; thickness: number }
  /** Gap left between neighbouring tiles, mm (0 = butt joint). */
  joint: number
  /** 45° chamfer on the top perimeter of every tile, mm (0 = sharp, continuous look). */
  bevel: number
  layout: { origin: LayoutOrigin; rowOffset: RowOffset }
  texture: TextureSettings
  /** Filament preset id from the color catalog. */
  colorId: string
  printerId: string
}

/** A rectangle in tile-local coordinates (0..tile.width, 0..tile.height), mm. */
export interface CropRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export type PieceKind = 'full' | 'edge' | 'corner'

/** One unique printable model: a full tile or a cut of it. */
export interface PieceSpec {
  /** Stable id derived from the crop, e.g. "full" or "p-0-0-42.5-150". */
  id: string
  /** Drawing mark shown on the plan and the schedule: "A" is the full tile, cuts follow. */
  mark: string
  kind: PieceKind
  /** Human label, e.g. "Full tile", "Right edge", "Top-right corner". */
  label: string
  /** Part of the full tile this piece is cut from; pattern coordinates follow the full tile. */
  crop: CropRect
  width: number
  height: number
  count: number
}

/** Where one physical tile sits on the surface. */
export interface Placement {
  pieceId: string
  /** Bottom-left corner of the piece on the surface, mm. */
  x: number
  y: number
  row: number
  col: number
}

export type FitWarningCode =
  | 'thin-cut'
  | 'sliver-dropped'
  | 'exceeds-bed'
  | 'tile-larger-than-surface'
  | 'many-pieces'

export interface FitWarning {
  code: FitWarningCode
  message: string
  pieceId?: string
}

export interface LayoutPlan {
  pieces: PieceSpec[]
  placements: Placement[]
  columns: number
  rows: number
  fullCount: number
  partialCount: number
  /** True when the surface is covered by full tiles only (no cut pieces). */
  exact: boolean
  warnings: FitWarning[]
}

/** Raw triangle mesh transferred from the worker. Positions in mm, z up, bottom at z = 0. */
export interface MeshData {
  positions: Float32Array
  normals?: Float32Array
  /** Pattern-space UVs in [0,1] over the full tile (partial pieces use a sub-range). */
  uvs?: Float32Array
  indices: Uint32Array
  /** Index count of the top (textured) surface; the rest are side walls and bottom. */
  topIndexCount: number
}
