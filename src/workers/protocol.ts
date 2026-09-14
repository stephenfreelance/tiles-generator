// Messages between the UI thread and the geometry worker. Buffers travel as transferables.
import type { CropRect, DesignConfig, ExportFormat, ExportQuality, LayoutPlan, MeshData, PieceSpec } from '@/core/types'

/** Meshes for the 3D preview. `cellMm` sets the top-grid spacing (coarse for big walls). */
export interface PreviewRequest {
  kind: 'preview'
  config: DesignConfig
  pieces: PieceSpec[]
  cellMm: number
  /** Texel size of the baked normal map in mm; 0 skips baking. */
  normalMapTexelMm: number
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

/** Printable files for some or all pieces, plus an optional zip with the plan and a README. */
export interface ExportRequest {
  kind: 'export'
  config: DesignConfig
  plan: LayoutPlan
  format: ExportFormat
  quality: ExportQuality
  /** Pieces to export; all when omitted. */
  pieceIds?: string[]
  /** Pack everything (files, plan.svg, README.txt) into one zip. */
  zip: boolean
  /** Setting-out plan SVG markup to include in the zip. */
  planSvg?: string
}

export interface ExportedFile {
  name: string
  pieceId?: string
  mime: string
  data: Uint8Array
}

export interface PieceStats {
  pieceId: string
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

/** Solid volume of every piece at draft resolution, for filament estimates. */
export interface VolumeRequest {
  kind: 'volumes'
  config: DesignConfig
  pieces: PieceSpec[]
}

export interface VolumeResult {
  volumes: Record<string, number>
}

/** Shaded relief swatches for the texture picker and the landing specimen strip. */
export interface ChipRequest {
  kind: 'chips'
  /**
   * One chip per entry; the config supplies texture settings, tile size and color. With a crop
   * the chip shows that cut piece (schedule rows); without, the full tile (texture picker).
   */
  items: { key: string; config: DesignConfig; crop?: CropRect }[]
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
