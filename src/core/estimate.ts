// Filament weight, spools and plates for the whole surface. An estimate: the slicer knows best.
import { wallParts } from './fixing/accessories'
import { tabLimits } from './fixing/capability'
import { TAB_SIDE } from './fixing/tabs'
import type { AccessoryKind, AccessorySpec } from './fixing/types'
import { resolvePerimeter, shapingEdges } from './geometry/profiles'
import { piecesPerPlate, printerById } from './printers'
import { PART_PRINT_SETTINGS, PRINT_SETTINGS, type PrintSettings } from './printSettings'
import { hasSide } from './sides'
import type { DesignConfig, LayoutPlan, PieceSpec } from './types'

// The settings table lives in its own module (the fixings quote it in their print notes); re-exported
// here, where the weights that assume it are worked out.
export { PART_PRINT_SETTINGS, PRINT_SETTINGS, type PrintSettings } from './printSettings'

/**
 * Share of its printed bounding box a part fills, until its mesh is measured: a clip is a comb with slots,
 * a hole and barbs under its stops' height (its mesh fills about 0.6), a key a dog-bone.
 */
const PART_BOX_FILL: Record<AccessoryKind, number> = { clip: 0.6, key: 0.8, 'fit-test': 0.6 }

/** The two ends of the quoted range: the same tiles sliced sparser and denser than advised. */
export const INFILL_RANGE = { low: 0.1, high: 0.2 } as const

export const SPOOL_GRAMS = 1000

/** PLA density, g/cm³: the app advises PLA only, so one figure serves every color. */
export const PLA_DENSITY_G_PER_CM3 = 1.24

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
export function pieceMaterialMm3(
  volumeMm3: number,
  width: number,
  height: number,
  infill: number,
  settings: PrintSettings = PRINT_SETTINGS,
): number {
  const area = width * height
  if (!(area > 0) || !(volumeMm3 > 0)) return 0
  const { layerHeightMm, walls, wallLineWidthMm, bottomLayers, topLayers } = settings
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

/** One printed part that is not a tile, weighed at its own advised settings. */
export interface AccessoryFilament {
  accessoryId: string
  kind: AccessoryKind
  group: AccessorySpec['group']
  mark: string
  label: string
  count: number
  /** Solid volume of one part, mm³ (from its mesh when known, otherwise its bounding box times a fill share). */
  volumeMm3: number
  fromMesh: boolean
  materialMm3: number
  gramsEach: number
  /** Every copy of this part, grams. */
  grams: number
  /** The settings this weight assumes. */
  settings: PrintSettings
  /** Copies that fit one plate (0 when the part does not fit the bed). */
  perPlate: number
  fitsBed: boolean
}

/** The printed parts of one zip folder together: one line each on the page. */
export interface AccessoryGroupFilament {
  group: AccessorySpec['group']
  /** Copies to print across the group's parts. */
  count: number
  grams: number
  /** Plates for the group, its small parts sharing plates. */
  plates: number
}

export interface FilamentEstimate {
  perPiece: PieceFilament[]
  /** The printed parts weighed, in the order they were handed in (the app weighs wallParts: the wall clips,
   * then the keys); empty for a glued design without keys. */
  accessories: AccessoryFilament[]
  /** Those parts summed per folder, in GROUP_ORDER: the wall clips, then the keys (a fit test, handed in, first). */
  accessoryGroups: AccessoryGroupFilament[]
  /** The tiles alone, at the advised infill. */
  tileGrams: number
  /** The printed parts alone, at their own settings. */
  accessoryGrams: number
  /** Weight at the advised infill, tiles and printed parts: the figure to show. */
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
  /** Plates when each tile model prints on its own plates (cuts are not mixed with full tiles), plus the parts'. */
  totalPlates: number
  /** Every piece and part fits the printer bed. */
  fitsBed: boolean
  densityGPerCm3: number
  printerName: string
  /** Some volumes are still the slab approximation (draft meshes not computed yet). */
  approximate: boolean
}

/**
 * Solid volume before the mesh is known: base plate plus half the relief (relief averages mid-height). A
 * border piece swaps that average for its profile's own height across the shaped band: a raised frame
 * stands up to t + D + f there, a chamfer or a rounded edge drops towards its rim, and one that cuts the
 * relief takes the lower of the two.
 */
function slabVolume(config: DesignConfig, piece: Pick<PieceSpec, 'width' | 'height' | 'edges'>): number {
  const mean = config.tile.thickness + config.texture.depth / 2
  const base = piece.width * piece.height * mean
  const profile = resolvePerimeter(config)
  if (!profile) return base
  const offsets = shapingEdges(config, piece.edges)
  // The band's own top, averaged: the frame's top, the flat land, or halfway down a dropping profile.
  const dropping = profile.L - profile.h / 2
  // A cut only trims the relief, so its band never averages above the relief it trims.
  const bandTop =
    profile.profile === 'frame' ? profile.Zf : profile.profile === 'margin' ? profile.L : profile.cut ? Math.min(mean, dropping) : dropping
  let band = 0
  for (const [side, offset] of Object.entries(offsets)) {
    const along = side === 'left' || side === 'right' ? piece.height : piece.width
    const across = side === 'left' || side === 'right' ? piece.width : piece.height
    band += along * Math.min(across, Math.max(0, profile.shape - (offset ?? 0)))
  }
  return Math.max(0, base + Math.min(band, piece.width * piece.height) * (bandTop - mean))
}

const GROUP_ORDER: AccessorySpec['group'][] = ['fit-test', 'mount', 'join']

export function estimateFilament(
  config: DesignConfig,
  plan: LayoutPlan,
  volumes: Record<string, number>,
  // The wall's own parts by default: the fit test is weighed on its own page, never in this download's grams.
  parts: readonly AccessorySpec[] = wallParts(config, plan),
): FilamentEstimate {
  const printer = printerById(config.printerId)
  const density = PLA_DENSITY_G_PER_CM3
  // g/cm³ to g/mm³.
  const gramsPerMm3 = density / 1000
  // A tab stands out past the tile's right side, so a tabbed piece takes that much more of the plate than
  // it measures. Only the packing reads it: the weight, the schedule and the sizes stay the nominal tile.
  const tab = tabLimits(config)?.projection ?? 0

  const perPiece = plan.pieces.map((piece): PieceFilament => {
    const meshVolume = volumes[piece.id]
    const fromMesh = typeof meshVolume === 'number' && Number.isFinite(meshVolume) && meshVolume > 0
    const volumeMm3 = fromMesh ? meshVolume : slabVolume(config, piece)
    const materialMm3 = pieceMaterialMm3(volumeMm3, piece.width, piece.height, PRINT_SETTINGS.infill)
    const lowMm3 = pieceMaterialMm3(volumeMm3, piece.width, piece.height, INFILL_RANGE.low)
    const highMm3 = pieceMaterialMm3(volumeMm3, piece.width, piece.height, INFILL_RANGE.high)
    const gramsEach = materialMm3 * gramsPerMm3
    const gramsEachLow = lowMm3 * gramsPerMm3
    const gramsEachHigh = highMm3 * gramsPerMm3
    const perPlate = piecesPerPlate(piece.width + (hasSide(piece.edges.tabs, TAB_SIDE) ? tab : 0), piece.height, printer)
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

  // Printed parts at their own settings: no infill range, they are sliced as advised or they fail.
  const accessories = parts.map((spec): AccessoryFilament => {
    const meshVolume = volumes[spec.id]
    const fromMesh = typeof meshVolume === 'number' && Number.isFinite(meshVolume) && meshVolume > 0
    const box = spec.size.x * spec.size.y * spec.size.z
    const volumeMm3 = fromMesh ? meshVolume : box * PART_BOX_FILL[spec.kind]
    const settings = PART_PRINT_SETTINGS[spec.kind]
    const materialMm3 = pieceMaterialMm3(volumeMm3, spec.size.x, spec.size.y, settings.infill, settings)
    const gramsEach = materialMm3 * gramsPerMm3
    // Laid square to the bed, never corner to corner: a slicer's auto-arrange keeps parts square.
    const perPlate = piecesPerPlate(spec.size.x, spec.size.y, printer)
    return {
      accessoryId: spec.id,
      kind: spec.kind,
      group: spec.group,
      mark: spec.mark,
      label: spec.label,
      count: spec.count,
      volumeMm3,
      fromMesh,
      materialMm3,
      gramsEach,
      grams: gramsEach * spec.count,
      settings,
      perPlate,
      fitsBed: perPlate > 0,
    }
  })
  // Small parts share plates within their folder, so a group's plates add up the share each part takes.
  const accessoryGroups = GROUP_ORDER.flatMap((group): AccessoryGroupFilament[] => {
    const members = accessories.filter((a) => a.group === group)
    if (members.length === 0) return []
    const share = members.reduce((s, a) => s + (a.perPlate > 0 ? a.count / a.perPlate : 0), 0)
    return [
      {
        group,
        count: members.reduce((s, a) => s + a.count, 0),
        grams: members.reduce((s, a) => s + a.grams, 0),
        // A float sum of exact fractions can land a hair above a whole plate.
        plates: Math.ceil(share - 1e-9),
      },
    ]
  })

  const tileGrams = perPiece.reduce((s, p) => s + p.grams, 0)
  const accessoryGrams = accessories.reduce((s, a) => s + a.grams, 0)
  const totalGrams = tileGrams + accessoryGrams
  const totalGramsLow = perPiece.reduce((s, p) => s + p.gramsLow, 0) + accessoryGrams
  const totalGramsHigh = perPiece.reduce((s, p) => s + p.gramsHigh, 0) + accessoryGrams
  const totalSolidGrams =
    (perPiece.reduce((s, p) => s + p.volumeMm3 * p.count, 0) + accessories.reduce((s, a) => s + a.volumeMm3 * a.count, 0)) * gramsPerMm3
  const share = (grams: number) => (totalSolidGrams > 0 ? grams / totalSolidGrams : 0)
  return {
    perPiece,
    accessories,
    accessoryGroups,
    tileGrams,
    accessoryGrams,
    totalGrams,
    totalGramsLow,
    totalGramsHigh,
    totalSolidGrams,
    effectiveFill: share(totalGrams),
    fillFactor: { low: share(totalGramsLow), high: share(totalGramsHigh) },
    infillRange: { ...INFILL_RANGE },
    settings: PRINT_SETTINGS,
    spools: totalGramsHigh > 0 ? Math.ceil(totalGramsHigh / SPOOL_GRAMS) : 0,
    totalPlates: perPiece.reduce((s, p) => s + p.platesNeeded, 0) + accessoryGroups.reduce((s, g) => s + g.plates, 0),
    fitsBed: perPiece.every((p) => p.fitsBed) && accessories.every((a) => a.fitsBed),
    densityGPerCm3: density,
    printerName: printer.name,
    approximate: perPiece.some((p) => !p.fromMesh) || accessories.some((a) => !a.fromMesh),
  }
}
