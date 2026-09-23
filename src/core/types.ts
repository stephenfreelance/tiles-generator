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

/**
 * A side of a piece, in the order the mesher walks its walls: 0 bottom (y = 0), 1 right (x = width),
 * 2 top (y = height), 3 left (x = 0). Surface sides use the same numbering.
 */
export type Side = 0 | 1 | 2 | 3

export type SideName = 'bottom' | 'right' | 'top' | 'left'

/** The four sides of the whole surface, each on or off. */
export interface SurfaceSides {
  bottom: boolean
  right: boolean
  top: boolean
  left: boolean
}

/** Profile of the top edge where two tiles meet: every side of every tile that carries no perimeter profile. */
export type JointEdgeProfile = 'square' | 'chamfer' | 'round' | 'pillow'

/** Finishing profile along the edge of the whole surface; only the pieces on that edge change. */
export type PerimeterProfile = 'none' | 'margin' | 'chamfer' | 'bullnose' | 'ogee' | 'frame'

export interface PerimeterSettings {
  profile: PerimeterProfile
  /** Surface sides that carry the profile (a backsplash on a worktop keeps its bottom square). */
  sides: SurfaceSides
  /** Width of the shaped band, measured in from the surface edge, mm. */
  width: number
  /** How far the profile drops to the rim, mm. For 'frame': how far the frame stands above the relief peaks. */
  drop: number
  /** Band over which the relief fades into the flat land before the profile starts, mm; 0 = automatic. */
  fade: number
  /**
   * Where that flat land sits: level with the relief's valleys, or with its peaks. 'cut' has no flat
   * land: the profile trims the relief (the top is the lower of the relief and the profile curve), so it
   * only ever removes material and every dip stays open to the rim. Chamfer, bullnose and ogee only.
   */
  land: 'valleys' | 'peaks' | 'cut'
}

/**
 * How the tiles go up: flat backs for tile adhesive or tape, or printed wall clips that each tile pushes
 * onto and pulls off again, with only the clips' tape between its back and the wall.
 */
export type MountKind = 'glue' | 'clips'

/** How neighbouring tiles hold each other edge to edge, in the plane of the wall. */
export type LockKind =
  /** Nothing: each tile goes up on its own. */
  | 'none'
  /** Printed bow-tie keys pressed into slots that straddle a joint. */
  | 'keys'
  /** A tab moulded into each tile's right side, in the socket of the tile beside it. Nothing is printed. */
  | 'tabs'

/**
 * Clearance class of the fixings, chosen with the fit test. It reaches only the printed keys and clips,
 * except with the tabs, whose socket is cut into the tile itself.
 */
export type FitClass = 'snug' | 'standard' | 'loose'

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
  /** Size of the joint edge on the top perimeter of every tile, mm (0 = sharp, continuous look). */
  bevel: number
  /** Shape of that joint edge. */
  jointEdge: JointEdgeProfile
  /** Finishing profile along the edge of the whole surface. */
  perimeter: PerimeterSettings
  /** How the tiles hold each other edge to edge: printed keys, moulded tabs, or nothing. */
  lock: LockKind
  mount: MountKind
  fit: FitClass
  layout: { origin: LayoutOrigin; rowOffset: RowOffset }
  texture: TextureSettings
  /** Tile color as '#RRGGBB', uppercase: a preset from `core/colors.ts` or any custom pick. */
  color: string
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

/** How a piece meets the edge of the surface. Part of its identity: two pieces with different edges are two models. */
export interface PieceEdges {
  /**
   * Bit (1 << Side) for each side lying on the surface boundary, where it has no neighbour. Only computed
   * when the layout is told boundaries change the model (keys or tabs on: neither is cut on a boundary
   * side); 0 otherwise.
   */
  boundary: number
  /**
   * Bit (1 << Side) for each side that carries a tab: today only side 1, the right. A tab is only cut where
   * the tile beside it really has the socket to take it, which the piece alone cannot know, so this is the
   * one field of `PieceEdges` the layout reads off the neighbours. 0 unless the design cuts tabs.
   */
  tabs: number
  /**
   * For each side facing a profiled surface edge within the perimeter band: the distance from that side
   * out to the edge, mm (0 when the side is the edge). Absent sides are untouched by the profile.
   */
  profiled: Partial<Record<SideName, number>>
}

/** One unique printable model: a full tile or a cut of it. */
export interface PieceSpec {
  /**
   * Stable id derived from the crop, e.g. "full" or "p-0-0-42.5-150", plus a suffix for a border version
   * ("full-eT0", "full-b12-eT0L0"): the grammar is in docs/architecture.md, "Piece ids".
   */
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
  /** Where the piece meets the surface edge; `{ boundary: 0, tabs: 0, profiled: {} }` for an interior piece. */
  edges: PieceEdges
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
  /** A joint side too short for a key: those pieces are glued to their neighbour instead. */
  | 'no-key'
  /** The tabs lock nothing here: a piece too narrow for a socket, or a wall with no joint within a row. */
  | 'no-lock'
  /** A piece too small or too narrow for a clip pocket: it is keyed to a neighbour or glued. */
  | 'no-mount'
  /** Keys or wall clips are on but the base plate is too thin to hold their pockets. */
  | 'thin-base'
  /** The perimeter profile was narrowed or lowered to fit the plate or the pieces. */
  | 'profile-clamped'

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
