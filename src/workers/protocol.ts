// Messages between the UI thread and the geometry worker. Buffers travel as transferables.
import type { AccessorySpec } from '@/core/fixing/types'
import type { CropRect, DesignConfig, ExportFormat, ExportQuality, LayoutPlan, MeshData, PieceEdges, PieceSpec } from '@/core/types'

/** Meshes for the 3D preview. `cellMm` sets the top-grid spacing (coarse for big walls). */
export interface PreviewRequest {
  kind: 'preview'
  config: DesignConfig
  pieces: PieceSpec[]
  cellMm: number
  /** Texel size of the baked normal map in mm; 0 skips baking. */
  normalMapTexelMm: number
  /**
   * Cut the key notches and clip pockets into the backs (default true). The whole-wall view passes false:
   * its camera never reaches behind the wall, and on a big keyed wall on clips the pockets are over a
   * million triangles nobody sees. The single tile keeps them for its Back view.
   */
  backFeatures?: boolean
}

export interface BakedNormalMap {
  width: number
  height: number
  /** RGBA8, object-space normals of the TOP surface (bevels included), row 0 at y = 0. */
  data: Uint8Array
}

export interface PreviewPiece {
  pieceId: string
  mesh: MeshData
  normalMap?: BakedNormalMap
}

export interface PreviewResult {
  pieces: PreviewPiece[]
}

/**
 * Printable files for some or all pieces and printed parts (clips, keys, the fit test), plus an optional
 * zip with the plan and a README.
 *
 * What gets written: the tiles in `pieceIds` (every tile when omitted), then the accessories in
 * `accessoryIds`. Without `accessoryIds`, the wall's own parts come along with a full export (no
 * `pieceIds`), and none with a pick of pieces. `accessories: false` leaves them all out. The fit test is
 * written only when its ids are named, because it is downloaded from its own page: a wall's zip holds
 * final parts only. One accessory on its own: `{ pieceIds: [], accessoryIds: [id], zip: false }`.
 */
export interface ExportRequest {
  kind: 'export'
  config: DesignConfig
  plan: LayoutPlan
  format: ExportFormat
  quality: ExportQuality
  /** Pieces to export; all when omitted. */
  pieceIds?: string[]
  /** Printed parts that are not tiles; false writes none. Default true (see above for which). */
  accessories?: boolean
  /** Accessory ids (AccessorySpec.id) to export. */
  accessoryIds?: string[]
  /** Pack everything (tiles at the root, parts in their folders, the plan, README.txt) into one zip. */
  zip: boolean
  /** Setting-out plan SVG markup to include in the zip. */
  planSvg?: string
}

export interface ExportedFile {
  /** File name without a folder: what a single download is saved as. */
  name: string
  pieceId?: string
  /** Set on a printed part that is not a tile. */
  accessoryId?: string
  /** Zip folder of a printed part ('fit-test', 'mount' or 'join'); tiles sit at the root. */
  folder?: AccessorySpec['group']
  mime: string
  data: Uint8Array
}

/** Figures of one written file: a tile (`pieceId`) or a printed part (`accessoryId`). */
export interface PieceStats {
  /** The tile's piece id or the part's accessory id; the two never collide. */
  partId: string
  /** Set for a tile. */
  pieceId?: string
  /** Set for a printed part. */
  accessoryId?: string
  triangles: number
  bytes: number
  /** Solid volume of one piece, mm³. */
  volumeMm3: number
}

export interface ExportResult {
  files: ExportedFile[]
  zip?: ExportedFile
  stats: PieceStats[]
}

/** Solid volume of every piece at draft resolution, and of every printed part, for filament estimates. */
export interface VolumeRequest {
  kind: 'volumes'
  config: DesignConfig
  pieces: PieceSpec[]
  /** Printed parts to measure too (from accessoryParts); their meshes are exact, not drafts. */
  accessories?: AccessorySpec[]
}

export interface VolumeResult {
  /**
   * mm³ of one copy, keyed by piece id and by accessory id (the two never collide). A part whose mesh
   * could not be built is left out, so the estimate falls back to its approximation.
   */
  volumes: Record<string, number>
}

/** Shaded relief swatches for the texture picker and the landing specimen strip. */
export interface ChipRequest {
  kind: 'chips'
  /**
   * One chip per entry; the config supplies texture settings, tile size and color. With a crop
   * the chip shows that cut piece (schedule rows); without, the full tile (texture picker). With
   * edges it shows a border piece with its perimeter profile.
   */
  items: { key: string; config: DesignConfig; crop?: CropRect; edges?: PieceEdges }[]
  sizePx: number
}

export interface ChipImage {
  key: string
  width: number
  height: number
  /** RGBA8 pixels ready for ImageData. */
  data: Uint8ClampedArray
}

export interface ChipResult {
  chips: ChipImage[]
}

export type WorkerRequest = PreviewRequest | ExportRequest | VolumeRequest | ChipRequest

export interface WorkerResultMap {
  preview: PreviewResult
  export: ExportResult
  volumes: VolumeResult
  chips: ChipResult
}

export interface Progress {
  done: number
  total: number
  label: string
}

export type ToWorker = { id: number; request: WorkerRequest } | { id: number; cancel: true }

export type FromWorker =
  | { id: number; ok: true; result: WorkerResultMap[WorkerRequest['kind']] }
  | { id: number; ok: false; error: string; cancelled?: boolean }
  | { id: number; progress: Progress }
