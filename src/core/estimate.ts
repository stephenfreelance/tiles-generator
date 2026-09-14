// Filament weight, spools and plates for the whole surface. An estimate: the slicer knows best.
import { densityOf, filamentById } from './filaments'
import { piecesPerPlate, printerById } from './printers'
import type { DesignConfig, LayoutPlan } from './types'

/** Slicer settings a weight is quoted at. */
export interface PrintSettings {
  readonly layerHeightMm: number
  readonly walls: number
  /** Sparse infill density, 0 to 1. */
  readonly infill: number
  readonly wallLineWidthMm: number
  readonly bottomLayers: number
  readonly topLayers: number
  /** The settings as the pages say them, so the copy and the arithmetic cannot drift apart. */
  readonly summary: string
}

/**
 * What this app advises everywhere (the notes on the download page, the README in the zip) and what
 * every weight below assumes. Nobody prints these tiles solid, so nothing here may be raised to make
 * a number look safer: buy the spools this describes and the print comes out.
 */
export const PRINT_SETTINGS = {
  layerHeightMm: 0.2,
  walls: 3,
  infill: 0.15,
  /** One wall line from a 0.4 mm nozzle. */
  wallLineWidthMm: 0.42,
  /** Solid layers under and over the piece: 0.8 mm down, 1.0 mm up, as slicers ship by default. */
  bottomLayers: 4,
  topLayers: 5,
  summary: '0.2 mm layers, 3 walls, 15 % infill',
} as const satisfies PrintSettings

/** The two ends of the quoted range: the same tiles sliced sparser and denser than advised. */
export const INFILL_RANGE = { low: 0.1, high: 0.2 } as const

export const SPOOL_GRAMS = 1000

/**
 * Plastic in one piece at a given infill density, mm³.
 *
 * A tile is a flat plate with a shallow relief on top, and a slicer fills that in three parts: solid
 * skins top and bottom across the whole footprint, solid perimeter walls around whatever height is
 * left, and sparse infill in the middle of it. Working from the mean height of the piece (solid
 * volume over footprint) keeps the relief in the sum without needing its shape: where the relief is
 * shallower than the top skin it prints solid, and the taller parts sit over sparse infill like the
 * rest of the plate.
 */
export function pieceMaterialMm3(volumeMm3: number, width: number, height: number, infill: number): number {
  const area = width * height
  if (!(area > 0) || !(volumeMm3 > 0)) return 0
  const { layerHeightMm, walls, wallLineWidthMm, bottomLayers, topLayers } = PRINT_SETTINGS
  const meanHeight = volumeMm3 / area
  // Skins cost their whole footprint. A piece no taller than the two of them prints solid.
  const skinHeight = Math.min(meanHeight, (bottomLayers + topLayers) * layerHeightMm)
  const skins = area * skinHeight
  const sparseHeight = meanHeight - skinHeight
  const wallArea = Math.min(area, 2 * (width + height) * walls * wallLineWidthMm)
  const perimeters = wallArea * sparseHeight
  const core = (area - wallArea) * sparseHeight * infill
  // Never more plastic than a solid piece, never less than the skins on their own.
  return Math.min(volumeMm3, Math.max(skins, skins + perimeters + core))
}

export interface PieceFilament {
  pieceId: string
  mark: string
  label: string
  count: number
  /** Solid volume of one piece, mm³ (from the mesh when known, otherwise a slab approximation). */
  volumeMm3: number
  /** True when the volume came from the draft mesh rather than the slab approximation. */
  fromMesh: boolean
  /** Plastic in one piece at the advised infill, mm³. */
  materialMm3: number
  /** Share of the solid volume this piece really uses, at the advised infill. */
  effectiveFill: number
  /** Weight of one piece at the advised infill, grams. */
  gramsEach: number
  gramsEachLow: number
  gramsEachHigh: number
  /** Weight of every copy of this piece, grams. */
  grams: number
  gramsLow: number
  gramsHigh: number
  /** Copies that fit one plate of the chosen printer (0 when the piece does not fit the bed). */
  perPlate: number
  platesNeeded: number
  fitsBed: boolean
}

export interface FilamentEstimate {
  perPiece: PieceFilament[]
  /** Weight at the advised infill: the figure to show. */
  totalGrams: number
  totalGramsLow: number
  totalGramsHigh: number
  /** What the same tiles would weigh printed solid, for context. */
  totalSolidGrams: number
  /** Share of the solid volume that ends up as plastic, at the advised infill. */
  effectiveFill: number
  /** The same share at the two ends of the range. */
  fillFactor: { low: number; high: number }
  /** Infill densities behind those two ends. */
  infillRange: { low: number; high: number }
  /** Settings every weight here assumes; `summary` is the sentence to print next to the figure. */
  settings: PrintSettings
  /** 1 kg spools to buy, sized on the high end of the range. */
  spools: number
  /** Plates when each model prints on its own plates (cuts are not mixed with full tiles). */
  totalPlates: number
  /** Every piece fits the printer bed. */
  fitsBed: boolean
  densityGPerCm3: number
  printerName: string
  /** Some volumes are still the slab approximation (draft meshes not computed yet). */
  approximate: boolean
}

/** Solid volume before the mesh is known: base plate plus half the relief (relief averages mid-height). */
function slabVolume(config: DesignConfig, width: number, height: number): number {
  return width * height * (config.tile.thickness + config.texture.depth / 2)
}

export function estimateFilament(
  config: DesignConfig,
  plan: LayoutPlan,
  volumes: Record<string, number>,
): FilamentEstimate {
  const filament = filamentById(config.colorId)
  const printer = printerById(config.printerId)
  const density = densityOf(filament)
  // g/cm³ to g/mm³.
  const gramsPerMm3 = density / 1000

  const perPiece = plan.pieces.map((piece): PieceFilament => {
    const meshVolume = volumes[piece.id]
    const fromMesh = typeof meshVolume === 'number' && Number.isFinite(meshVolume) && meshVolume > 0
    const volumeMm3 = fromMesh ? meshVolume : slabVolume(config, piece.width, piece.height)
    const materialMm3 = pieceMaterialMm3(volumeMm3, piece.width, piece.height, PRINT_SETTINGS.infill)
    const lowMm3 = pieceMaterialMm3(volumeMm3, piece.width, piece.height, INFILL_RANGE.low)
    const highMm3 = pieceMaterialMm3(volumeMm3, piece.width, piece.height, INFILL_RANGE.high)
    const gramsEach = materialMm3 * gramsPerMm3
    const gramsEachLow = lowMm3 * gramsPerMm3
    const gramsEachHigh = highMm3 * gramsPerMm3
    const perPlate = piecesPerPlate(piece.width, piece.height, printer)
    return {
      pieceId: piece.id,
      mark: piece.mark,
      label: piece.label,
      count: piece.count,
      volumeMm3,
      fromMesh,
      materialMm3,
      effectiveFill: volumeMm3 > 0 ? materialMm3 / volumeMm3 : 0,
      gramsEach,
      gramsEachLow,
      gramsEachHigh,
      grams: gramsEach * piece.count,
      gramsLow: gramsEachLow * piece.count,
      gramsHigh: gramsEachHigh * piece.count,
      perPlate,
      platesNeeded: perPlate > 0 ? Math.ceil(piece.count / perPlate) : 0,
      fitsBed: perPlate > 0,
    }
  })

  const totalGrams = perPiece.reduce((s, p) => s + p.grams, 0)
  const totalGramsLow = perPiece.reduce((s, p) => s + p.gramsLow, 0)
  const totalGramsHigh = perPiece.reduce((s, p) => s + p.gramsHigh, 0)
  const totalSolidGrams = perPiece.reduce((s, p) => s + p.volumeMm3 * p.count, 0) * gramsPerMm3
  const share = (grams: number) => (totalSolidGrams > 0 ? grams / totalSolidGrams : 0)
  return {
    perPiece,
    totalGrams,
    totalGramsLow,
    totalGramsHigh,
    totalSolidGrams,
    effectiveFill: share(totalGrams),
    fillFactor: { low: share(totalGramsLow), high: share(totalGramsHigh) },
    infillRange: { ...INFILL_RANGE },
    settings: PRINT_SETTINGS,
    spools: totalGramsHigh > 0 ? Math.ceil(totalGramsHigh / SPOOL_GRAMS) : 0,
    totalPlates: perPiece.reduce((s, p) => s + p.platesNeeded, 0),
    fitsBed: perPiece.every((p) => p.fitsBed),
    densityGPerCm3: density,
    printerName: printer.name,
    approximate: perPiece.some((p) => !p.fromMesh),
  }
}
