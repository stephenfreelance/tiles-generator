import type {
  CropRect,
  DesignConfig,
  FitWarning,
  LayoutOrigin,
  LayoutPlan,
  PieceKind,
  PieceSpec,
  Placement,
  RowOffset,
} from './types'
import { formatLength, formatSize } from './units'

/** Two lengths closer than this are the same length (mm). */
const EPS = 0.01
/** Cuts thinner than this are not printed: the joint or the wall edge absorbs them. */
export const SLIVER_MM = 1
/** Cuts thinner than this print and glue badly; the layout warns about them. */
export const THIN_CUT_MM = 12
/** Above this many unique models the download gets tedious; the layout warns. */
const MANY_PIECES = 12

export interface PrinterBed {
  name: string
  width: number
  depth: number
}

export interface LayoutInput {
  surface: DesignConfig['surface']
  tile: Pick<DesignConfig['tile'], 'width' | 'height'>
  joint: number
  layout: DesignConfig['layout']
  bed?: PrinterBed
}

/** Positive modulo. */
const mod = (a: number, n: number) => ((a % n) + n) % n

const round2 = (v: number) => Math.round(v * 100) / 100

/** Number of distinct row shifts in a running-bond cycle (1 = straight grid). */
export function rowShiftCycle(rowOffset: RowOffset): number {
  return rowOffset === 0 ? 1 : Math.round(1 / rowOffset)
}

/** Brings a tile start into (-pitch, 0] so the first tile touches or overhangs the surface edge. */
function normalizeStart(start: number, pitch: number): number {
  const o = mod(start, pitch)
  if (o < EPS || pitch - o < EPS) return 0
  return o - pitch
}

/** Visible lengths of the first and last tile along one axis for a given (normalized) start. */
function edgeCuts(length: number, size: number, pitch: number, start: number): [number, number] {
  const first = start < -EPS ? start + size : size
  const lastIndex = Math.floor((length - EPS - start) / pitch)
  const lastStart = start + lastIndex * pitch
  const last = Math.min(size, length - lastStart)
  return [Math.max(0, first), Math.max(0, last)]
}

/**
 * Start of the first tile along one axis, in (-pitch, 0].
 * `balanced` picks between a tile-centred and a joint-centred grid, keeping the one whose
 * narrowest edge cut is widest; that is how tilers avoid slivers at the walls.
 * `anchor` only matters for `corner`: the wall is read from the top-left, so whole tiles start at
 * that corner and the leftover falls at the far end (the right edge, and the bottom of the wall).
 */
export function axisStart(
  length: number,
  size: number,
  joint: number,
  origin: LayoutOrigin,
  anchor: 'start' | 'end' = 'start',
): number {
  const pitch = size + joint
  // Anchoring at the end lands the last whole tile flush with `length`, so the cut is at the near end.
  if (origin === 'corner') return anchor === 'end' ? normalizeStart(length - size, pitch) : 0
  const tileCentred = normalizeStart(length / 2 - size / 2, pitch)
  if (origin === 'center') return tileCentred
  const jointCentred = normalizeStart(length / 2 + joint / 2, pitch)
  const narrowest = (start: number) => {
    // A cut too thin to print disappears into the joint, which is still the worst outcome.
    const cuts = edgeCuts(length, size, pitch, start).filter((c) => c > 0)
    return cuts.length ? Math.min(...cuts) : size
  }
  return narrowest(jointCentred) > narrowest(tileCentred) + EPS ? jointCentred : tileCentred
}

function pieceKind(crop: CropRect, tile: LayoutInput['tile']): PieceKind {
  const cutX = crop.x0 > EPS || crop.x1 < tile.width - EPS
  const cutY = crop.y0 > EPS || crop.y1 < tile.height - EPS
  if (cutX && cutY) return 'corner'
  return cutX || cutY ? 'edge' : 'full'
}

/** Where a piece sits on the surface, deduced from which sides of the full tile were cut away. */
function pieceLabel(crop: CropRect, tile: LayoutInput['tile']): string {
  // A crop starting past x = 0 keeps the right part of the tile, so it sits on the left wall.
  const left = crop.x0 > EPS
  const right = crop.x1 < tile.width - EPS
  const bottom = crop.y0 > EPS
  const top = crop.y1 < tile.height - EPS
  const horizontal = left && right ? 'narrow' : left ? 'left' : right ? 'right' : null
  const vertical = bottom && top ? 'narrow' : bottom ? 'bottom' : top ? 'top' : null
  if (!horizontal && !vertical) return 'Full tile'
  if (horizontal === 'narrow' || vertical === 'narrow') return 'Cut to fit'
  if (horizontal && vertical) {
    return `${vertical[0].toUpperCase()}${vertical.slice(1)}-${horizontal} corner`
  }
  const side = (horizontal ?? vertical) as string
  return `${side[0].toUpperCase()}${side.slice(1)} edge`
}

/** "A".."Z", then "AA", "AB"... */
function markFor(index: number): string {
  let n = index
  let mark = ''
  do {
    mark = String.fromCharCode(65 + (n % 26)) + mark
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return mark
}

const KIND_ORDER: Record<PieceKind, number> = { full: 0, edge: 1, corner: 2 }

/**
 * Lays tiles on the surface and derives every unique piece to print.
 * Surface coordinates: origin at the bottom-left corner, x to the right, y up.
 * Each placed tile is the intersection of its grid cell with the surface; the part of the
 * full tile it keeps is its crop, so a cut piece carries the exact slice of the pattern it
 * replaces and the texture stays continuous across every joint.
 */
export function computeLayout(input: LayoutInput): LayoutPlan {
  const { surface, tile, joint, layout, bed } = input
  const W = surface.width
  const H = surface.height
  const pitchX = tile.width + joint
  const pitchY = tile.height + joint
  const warnings: FitWarning[] = []

  const startX = axisStart(W, tile.width, joint, layout.origin)
  // Surface y runs upward, so anchoring the top-left corner means anchoring this axis at its end.
  const startY = axisStart(H, tile.height, joint, layout.origin, 'end')
  const cycle = rowShiftCycle(layout.rowOffset)

  const byKey = new Map<string, { crop: CropRect; count: number }>()
  const rawPlacements: { key: string; x: number; y: number; row: number; col: number }[] = []
  const dropped = new Set<string>()

  let row = 0
  // Running maximum: spreading a placements-sized array into Math.max blows the argument limit.
  let columns = 0
  for (let y = startY; y < H - EPS; y += pitchY) {
    const cy0 = Math.max(0, -y)
    const cy1 = Math.min(tile.height, H - y)
    const visibleH = cy1 - cy0
    if (visibleH < EPS) continue
    if (visibleH < SLIVER_MM) {
      dropped.add(`A ${formatLength(visibleH)} strip along the ${y < 0 ? 'bottom' : 'top'} edge`)
      continue
    }
    const shift = ((row % cycle) / cycle) * pitchX
    const rowStart = normalizeStart(startX + shift, pitchX)
    let col = 0
    for (let x = rowStart; x < W - EPS; x += pitchX) {
      const cx0 = Math.max(0, -x)
      const cx1 = Math.min(tile.width, W - x)
      const visibleW = cx1 - cx0
      if (visibleW < EPS) continue
      if (visibleW < SLIVER_MM) {
        dropped.add(`A ${formatLength(visibleW)} strip along the ${x < 0 ? 'left' : 'right'} edge`)
        continue
      }
      const crop: CropRect = {
        x0: cx0 < EPS ? 0 : round2(cx0),
        y0: cy0 < EPS ? 0 : round2(cy0),
        x1: tile.width - cx1 < EPS ? tile.width : round2(cx1),
        y1: tile.height - cy1 < EPS ? tile.height : round2(cy1),
      }
      const key = `${crop.x0}:${crop.y0}:${crop.x1}:${crop.y1}`
      const entry = byKey.get(key)
      if (entry) entry.count++
      else byKey.set(key, { crop, count: 1 })
      rawPlacements.push({ key, x: x + cx0, y: y + cy0, row, col })
      col++
    }
    if (col > columns) columns = col
    row++
  }

  const sorted = [...byKey.entries()].sort(([, a], [, b]) => {
    const ka = KIND_ORDER[pieceKind(a.crop, tile)]
    const kb = KIND_ORDER[pieceKind(b.crop, tile)]
    if (ka !== kb) return ka - kb
    const areaA = (a.crop.x1 - a.crop.x0) * (a.crop.y1 - a.crop.y0)
    const areaB = (b.crop.x1 - b.crop.x0) * (b.crop.y1 - b.crop.y0)
    return areaB - areaA
  })

  const pieces: PieceSpec[] = sorted.map(([key, { crop, count }], index) => {
    const kind = pieceKind(crop, tile)
    return {
      id: kind === 'full' ? 'full' : `p-${key.replaceAll(':', '-')}`,
      mark: markFor(index),
      kind,
      label: pieceLabel(crop, tile),
      crop,
      width: round2(crop.x1 - crop.x0),
      height: round2(crop.y1 - crop.y0),
      count,
    }
  })

  // Running bonds produce several cuts on the same side; the size tells them apart.
  const labelUse = new Map<string, number>()
  for (const p of pieces) labelUse.set(p.label, (labelUse.get(p.label) ?? 0) + 1)
  for (const p of pieces) {
    if ((labelUse.get(p.label) ?? 0) > 1) p.label = `${p.label} · ${formatSize(p.width, p.height)}`
  }

  const idByKey = new Map(sorted.map(([key], i) => [key, pieces[i].id]))
  const placements: Placement[] = rawPlacements.map((p) => ({
    pieceId: idByKey.get(p.key) as string,
    x: round2(p.x),
    y: round2(p.y),
    row: p.row,
    col: p.col,
  }))

  if (tile.width > W + EPS || tile.height > H + EPS) {
    warnings.push({
      code: 'tile-larger-than-surface',
      message: `The tile is larger than the surface, so every piece is a cut. Check the sizes.`,
    })
  }
  for (const text of dropped) {
    warnings.push({
      code: 'sliver-dropped',
      message: `${text} is too thin to print; the joint absorbs it.`,
    })
  }
  // One note covering every thin cut: the same sentence once per piece reads as a rendering bug.
  const thinCuts = pieces.filter((p) => p.kind !== 'full' && Math.min(p.width, p.height) < THIN_CUT_MM)
  if (thinCuts.length > 0) {
    const narrowest = thinCuts.reduce((a, b) => (Math.min(b.width, b.height) < Math.min(a.width, a.height) ? b : a))
    const narrow = Math.min(narrowest.width, narrowest.height)
    const marks = thinCuts.map((p) => p.mark).join(', ')
    warnings.push({
      code: 'thin-cut',
      // The narrowest piece is the one worth pointing at when the note is hovered.
      pieceId: narrowest.id,
      message:
        thinCuts.length === 1
          ? `Cut ${narrowest.mark} is only ${formatLength(narrow)} wide: fragile to print and to glue. Try the balanced layout or adjust the tile size.`
          : `${thinCuts.length} cuts (${marks}) are fragile to print and to glue, the narrowest only ${formatLength(narrow)} wide. Try the balanced layout or adjust the tile size.`,
    })
  }
  if (bed) {
    const fits =
      (tile.width <= bed.width && tile.height <= bed.depth) ||
      (tile.height <= bed.width && tile.width <= bed.depth)
    if (!fits) {
      warnings.push({
        code: 'exceeds-bed',
        message: `A ${formatSize(tile.width, tile.height)} tile does not fit the ${formatSize(bed.width, bed.depth)} bed of the ${bed.name}.`,
      })
    }
  }
  if (pieces.length > MANY_PIECES) {
    warnings.push({
      code: 'many-pieces',
      message: `This layout needs ${pieces.length} different models. A straight grid or the corner origin needs fewer.`,
    })
  }

  const fullCount = pieces.find((p) => p.kind === 'full')?.count ?? 0
  return {
    pieces,
    placements,
    columns,
    rows: row,
    fullCount,
    partialCount: placements.length - fullCount,
    exact: pieces.every((p) => p.kind === 'full'),
    warnings,
  }
}

/** Tile sizes people actually print and recognise, mm. The recommendation aims at the nearest one. */
export const STANDARD_TILE_SIZES = [50, 60, 75, 80, 100, 120, 125, 150, 175, 200, 250, 300]

const nearestStandard = (size: number): number =>
  STANDARD_TILE_SIZES.reduce((best, s) => (Math.abs(s - size) < Math.abs(best - size) ? s : best), STANDARD_TILE_SIZES[0])

/** A tile size offered as a preset, with what it does to the wall under the design's own layout. */
export interface TileFit {
  width: number
  height: number
  columns: number
  rows: number
  /** True when the wall is covered by full tiles only. */
  exact: boolean
  /** How many placed pieces are cuts. */
  cuts: number
  /** Pieces placed in total: a running bond does not fill a regular columns x rows grid. */
  tiles: number
  /** Pieces that are whole tiles, that is `tiles - cuts`. */
  whole: number
}

export interface TileSuggestOptions {
  min?: number
  max?: number
  bed?: PrinterBed
  /** The design's own layout, so a preset states the consequences of the bond actually in use. */
  layout?: DesignConfig['layout']
}

/** What a preset assumes when the caller does not say: a straight grid read from the corner. */
const PRESET_LAYOUT: DesignConfig['layout'] = { origin: 'corner', rowOffset: 0 }

/** Candidates verified with computeLayout before giving up, so a wall of many divisors stays fast. */
const MAX_VERIFIED_CANDIDATES = 8

/** A tile is a tile, not a plank: past this the recommendation stops offering it. */
const MAX_ASPECT = 2.5

/** The size makers reach for: it fits every common printer bed and prints in a sensible time. */
const SWEET_SPOT_MM = 150

/** A tile count along one axis and the size that divides it. */
interface AxisFit {
  count: number
  size: number
}

/**
 * Counts whose tile size divides `length` exactly, coarsest first. The size is rounded to the
 * hundredth so it can be shown and stored, then checked: a rounding that would leave a sliver at the
 * wall edge is not an exact fit and is dropped.
 */
function axisFits(length: number, joint: number, min: number, max: number): AxisFit[] {
  const fits: AxisFit[] = []
  for (let count = 1; count <= 500; count++) {
    const raw = (length - (count - 1) * joint) / count
    if (raw < min) break
    if (raw > max) continue
    const size = round2(raw)
    // Under computeLayout's own EPS: a residual it would treat as a cut must not pass as an exact fit.
    if (Math.abs(length - (count * size + (count - 1) * joint)) >= EPS) continue
    fits.push({ count, size })
  }
  return fits
}

/** A grid that does not start flush on an axis cuts that axis, whatever the tile size divides. */
function startsFlush(
  length: number,
  size: number,
  joint: number,
  origin: LayoutOrigin,
  anchor: 'start' | 'end',
): boolean {
  return axisStart(length, size, joint, origin, anchor) === 0
}

function fitsBed(width: number, height: number, bed?: PrinterBed): boolean {
  if (!bed) return true
  return (width <= bed.width && height <= bed.depth) || (height <= bed.width && width <= bed.depth)
}

/**
 * The tile size to offer first: it covers the surface with no cuts at all, square when the surface
 * allows one and rectangular when it does not, landing as close as it can to a size people know.
 */
export function recommendedTile(
  surface: DesignConfig['surface'],
  joint: number,
  options: TileSuggestOptions = {},
): TileFit | null {
  const min = options.min ?? 20
  const max = options.max ?? 400
  const layout = options.layout ?? PRESET_LAYOUT
  const columns = axisFits(surface.width, joint, min, max)
  const rows = axisFits(surface.height, joint, min, max)
  const candidates: { column: AxisFit; row: AxisFit; cost: number }[] = []
  for (const column of columns) {
    for (const row of rows) {
      if (!fitsBed(column.size, row.size, options.bed)) continue
      const aspect = Math.max(column.size, row.size) / Math.min(column.size, row.size)
      if (aspect > MAX_ASPECT) continue
      // Only a grid flush with both edges can be cut-free, and a running bond cuts every row end.
      if (!startsFlush(surface.width, column.size, joint, layout.origin, 'start')) continue
      if (!startsFlush(surface.height, row.size, joint, layout.origin, 'end')) continue
      if (layout.rowOffset !== 0 && row.count > 1) continue
      const square = Math.abs(column.size - row.size) <= 0.05
      const nominal = (column.size + row.size) / 2
      // Nearness to a standard size decides; a square beats a rectangle of equal nearness; a wall of
      // hundreds of tiny tiles is a worse answer than a wall of sensible ones.
      const cost =
        Math.abs(nominal - nearestStandard(nominal)) / nearestStandard(nominal) +
        (square ? 0 : 0.35 + (aspect - 1) * 0.25) +
        // Several exact squares can all be standard sizes (150 and 300 both divide 1200 x 600), so
        // break the tie towards the one that fits a common bed and does not print for nine hours.
        (Math.abs(nominal - SWEET_SPOT_MM) / SWEET_SPOT_MM) * 0.3 +
        (column.count * row.count > 400 ? 0.2 : 0)
      candidates.push({ column, row, cost })
    }
  }
  candidates.sort((a, b) => a.cost - b.cost)
  // The filters make a candidate exact by construction; computeLayout is the proof that it is,
  // so a size is only ever offered as "no cuts" once the real layout has agreed.
  for (const { column, row } of candidates.slice(0, MAX_VERIFIED_CANDIDATES)) {
    const plan = computeLayout({ surface, tile: { width: column.size, height: row.size }, joint, layout })
    if (!plan.exact) continue
    return {
      width: column.size,
      height: row.size,
      columns: plan.columns,
      rows: plan.rows,
      exact: true,
      cuts: plan.partialCount,
      tiles: plan.placements.length,
      whole: plan.fullCount,
    }
  }
  return null
}

/**
 * The square tile closest to `near`, cuts allowed, with what it really costs under the design's
 * layout. `tilePresets` drops it when it would just repeat the recommendation.
 */
export function squareTile(
  surface: DesignConfig['surface'],
  joint: number,
  near: number,
  options: TileSuggestOptions = {},
): TileFit | null {
  const min = options.min ?? 20
  const max = options.max ?? 400
  const candidates = STANDARD_TILE_SIZES.filter((s) => s >= min && s <= max && fitsBed(s, s, options.bed)).sort(
    (a, b) => Math.abs(a - near) - Math.abs(b - near),
  )
  const size = candidates[0]
  if (size === undefined) return null
  const plan = computeLayout({
    surface,
    tile: { width: size, height: size },
    joint,
    layout: options.layout ?? PRESET_LAYOUT,
  })
  return {
    width: size,
    height: size,
    columns: plan.columns,
    rows: plan.rows,
    exact: plan.exact,
    cuts: plan.partialCount,
    tiles: plan.placements.length,
    whole: plan.fullCount,
  }
}

/** The two presets the tile field offers: an exact fit, and the nearest familiar square. */
export function tilePresets(
  surface: DesignConfig['surface'],
  joint: number,
  options: TileSuggestOptions = {},
): { recommended: TileFit | null; square: TileFit | null } {
  const recommended = recommendedTile(surface, joint, options)
  const near = recommended ? (recommended.width + recommended.height) / 2 : SWEET_SPOT_MM
  const square = squareTile(surface, joint, near, options)
  // Offering the same size twice under two names helps nobody.
  const repeats =
    square !== null &&
    recommended !== null &&
    Math.abs(square.width - recommended.width) <= 0.05 &&
    Math.abs(square.height - recommended.height) <= 0.05
  return { recommended, square: repeats ? null : square }
}

/**
 * Tile sizes near `near` that cover `length` with full tiles only (corner origin), closest first.
 * n tiles and n - 1 joints fill the length exactly: n * size + (n - 1) * joint = length.
 */
export function perfectFitSizes(length: number, joint: number, near: number, count = 3): number[] {
  if (length <= 0 || near <= 0) return []
  const n0 = Math.max(1, Math.round((length + joint) / (near + joint)))
  const sizes = new Set<number>()
  for (let n = Math.max(1, n0 - 2); n <= n0 + 2; n++) {
    const size = (length - (n - 1) * joint) / n
    if (size > 0) sizes.add(Math.round(size * 10) / 10)
  }
  return [...sizes].sort((a, b) => Math.abs(a - near) - Math.abs(b - near)).slice(0, count)
}
