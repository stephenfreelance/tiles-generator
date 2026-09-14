// What a download will weigh, in bytes and in words. Sizes are estimates; the constants below were
// measured against our own STL and STEP writers.
import { effectiveCellMm, QUALITY_CELL_MM, STEP_QUALITY, type PieceMeshOptions } from '@/core/geometry/tileMesh'
import type { DesignConfig, ExportFormat, ExportQuality, LayoutPlan, PieceSpec } from '@/core/types'

/** Binary STL: an 84 byte header, then exactly 50 bytes per triangle. */
const STL_HEADER_BYTES = 84
const STL_BYTES_PER_TRIANGLE = 50
/** Our AP214 writer, measured at 707 to 731 bytes per triangle across qualities. */
const STEP_BYTES_PER_TRIANGLE = 720
/** STEP runs the adaptive mesher: a relief keeps nearly every triangle, a flat face collapses to a few. */
const STEP_KEPT_RELIEF = 0.96
const STEP_KEPT_FLAT = 0.02
/** Below this the top surface is flat enough for the mesher to merge it away. */
const FLAT_DEPTH_MM = 0.05
/** The tiling plan and the README together. */
const EXTRAS_BYTES = 40_000
/** Deflate on our own files, measured on a four-model download: 39.1 MB of binary STL zipped to 16.7 MB. */
const ZIP_RATIO_STL = 2.3
/** The same download as STEP: 46.7 MB of ASCII zipped to 16.1 MB. Text repeats, but it is already terse. */
const ZIP_RATIO_STEP = 2.9

/** Top grid plus the four walls and the bottom, the way buildPieceMesh lays them out. */
function pieceTriangles(piece: Pick<PieceSpec, 'width' | 'height'>, cellMm: number): number {
  const columns = Math.max(1, Math.ceil(piece.width / cellMm))
  const rows = Math.max(1, Math.ceil(piece.height / cellMm))
  const walls = 2 * (columns + rows + 2)
  return 2 * columns * rows + walls + 2
}

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${Math.round(bytes)} B`
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} kB`
  const mb = bytes / 1_000_000
  return `${mb < 100 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/** Grams as the page says them: "820 g", "3.6 kg". */
export function formatGrams(grams: number): string {
  if (grams < 1000) return `${Math.round(grams / 10) * 10} g`
  return `${(grams / 1000).toFixed(1)} kg`
}

/** The mesh the worker will really build: STEP is meshed on its own coarser, adaptive grid. */
function meshOptions(format: ExportFormat, quality: ExportQuality): PieceMeshOptions {
  const step = STEP_QUALITY[quality]
  return format === 'step'
    ? { cellMm: step.cellMm, adaptive: { toleranceMm: step.toleranceMm } }
    : { cellMm: QUALITY_CELL_MM[quality] }
}

function estimatePieceBytes(
  piece: Pick<PieceSpec, 'width' | 'height'>,
  config: DesignConfig,
  format: ExportFormat,
  cellMm: number,
): number {
  const triangles = pieceTriangles(piece, cellMm)
  if (format === 'stl') return STL_HEADER_BYTES + STL_BYTES_PER_TRIANGLE * triangles
  const kept = config.texture.depth > FLAT_DEPTH_MM ? STEP_KEPT_RELIEF : STEP_KEPT_FLAT
  return STEP_BYTES_PER_TRIANGLE * triangles * kept
}

/**
 * Every model written out, plus the plan and the README, before they are zipped. This is what the
 * files weigh on disk once unpacked, and roughly what the export costs to write.
 */
export function estimateUnpackedBytes(
  plan: LayoutPlan,
  config: DesignConfig,
  format: ExportFormat,
  quality: ExportQuality,
): number {
  // The grid is derived from the tile, so every piece of one design is meshed at the same spacing.
  const cellMm = effectiveCellMm(config, meshOptions(format, quality))
  const models = plan.pieces.reduce((sum, piece) => sum + estimatePieceBytes(piece, config, format, cellMm), 0)
  return models + EXTRAS_BYTES
}

/**
 * The .zip the page offers: the same files after deflate, which is the number a maker is about to
 * watch download. STEP figures stay an upper bound (the adaptive mesher merges more than we assume).
 */
export function estimateDownloadBytes(
  plan: LayoutPlan,
  config: DesignConfig,
  format: ExportFormat,
  quality: ExportQuality,
): number {
  return estimateUnpackedBytes(plan, config, format, quality) / (format === 'step' ? ZIP_RATIO_STEP : ZIP_RATIO_STL)
}

/**
 * Above this a download is worth a warning: minutes of writing and a file slicers open slowly.
 * Zipped, so it is measured against the download itself: 50 MB of STL unpacks to about 115 MB.
 */
export const LARGE_DOWNLOAD_BYTES = 50_000_000
