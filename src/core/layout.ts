import type {
  CropRect,
  DesignConfig,
  FitWarning,
  LayoutOrigin,
  LayoutPlan,
  PieceEdges,
  PieceKind,
  PieceSpec,
  Placement,
  RowOffset,
  Side,
  SurfaceSides,
} from './types'
import { keysPossible, tabLimits } from './fixing/capability'
import { perimeterBand } from './geometry/profiles'
import { hasSide, sideBit, SIDE_NAMES, SIDES } from './sides'
import { formatLength, formatSize } from './units'

/** Two lengths closer than this are the same length (mm). */
const EPS = 0.01
/** Cuts thinner than this are not printed: the joint or the wall edge absorbs them. */
export const SLIVER_MM = 1
/** Cuts thinner than this print and glue badly; the layout warns about them. */
export const THIN_CUT_MM = 12
/** Above this many unique models the download gets tedious; the layout warns. */
const MANY_PIECES = 12

/**
 * The side a tab stands out past, the right on every tile of every wall. `fixing/tabs.ts` owns the hand (its
 * TAB_SIDE) and may not be imported here: it reads this module, so the name would be a cycle. layout.test.ts
 * holds the two equal, as capability.test.ts does for the key notch's reach.
 */
const TAB_SIDE: Side = 1

export interface PrinterBed {
  name: string
  width: number
  depth: number
}

/** What makes two placements of the same crop two different models. */
export interface LayoutEdges {
  /** Surface sides carrying a perimeter profile, or null for none. */
  profiled: SurfaceSides | null
  /** Width of the perimeter band, mm (see perimeterBand): pieces within it of a profiled side are told how far. */
  band: number
  /**
   * True when a side on the surface boundary changes the model: a key slot, a socket or a tab can be cut, and
   * none of them is ever cut on the boundary.
   */
  boundaryMatters: boolean
  /**
   * The tabs' two numbers when the design really cuts them, else null: the least piece width that can hold a
   * socket, and how far a tab stands out past its side, so the printed box is that much wider than the tile.
   */
  tabs: { minWidth: number; projection: number } | null
}

export interface LayoutInput {
  surface: DesignConfig['surface']
  tile: Pick<DesignConfig['tile'], 'width' | 'height'>
  joint: number
  layout: DesignConfig['layout']
  bed?: PrinterBed
  /** Absent: every piece is told nothing about the surface edge, as before edges existed. */
  edges?: LayoutEdges
}

/** The layout a design asks for. Every caller goes through this, so the studio, the landing and the register agree. */
export function layoutInputOf(config: DesignConfig, bed?: PrinterBed): LayoutInput {
  const profiled = config.perimeter.profile === 'none' ? null : config.perimeter.sides
  const tabs = tabLimits(config)
  return {
    surface: config.surface,
    tile: config.tile,
    joint: config.joint,
    layout: config.layout,
    bed,
    // Keys or tabs asked for on a plate that cannot hold a recess cut nothing, so they must not split one
    // model into nine. A tab is cut on the boundary no more than a key slot is, so it counts there too.
    edges: { profiled, band: profiled ? perimeterBand(config) : 0, boundaryMatters: keysPossible(config) || tabs !== null, tabs },
  }
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

/** Surface sides a crop was cut along: a cut only ever falls on the surface edge, so these meet it. */
function cutSides(crop: CropRect, tile: LayoutInput['tile']): Side[] {
  // A crop starting past x = 0 keeps the right part of the tile, so it sits on the left wall.
  const cut = [crop.y0 > EPS, crop.x1 < tile.width - EPS, crop.y1 < tile.height - EPS, crop.x0 > EPS]
  return SIDES.filter((side) => cut[side])
}

/** Where a piece sits on the surface, deduced from which sides of the full tile were cut away. */
function cropLabel(crop: CropRect, tile: LayoutInput['tile']): string {
  const sides = cutSides(crop, tile)
  const left = sides.includes(3)
  const right = sides.includes(1)
  const bottom = sides.includes(0)
  const top = sides.includes(2)
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

/** Sides of a piece that meet the surface edge in a way that shapes it, in Side order. */
export function edgeSides(edges: PieceEdges): Side[] {
  return SIDES.filter((side) => hasSide(edges.boundary, side) || edges.profiled[SIDE_NAMES[side]] !== undefined)
}

/** True for a piece that is shaped by the surface edge: a border version of its crop. */
export const hasEdges = (edges: PieceEdges): boolean => edgeSides(edges).length > 0

/**
 * The sides a piece has ON the surface edge (on the boundary, or at the profiled edge itself), and
 * the sides merely NEAR a profiled edge, which a narrow cut keeps a few millimetres away.
 */
export function borderSides(edges: PieceEdges): { on: Side[]; near: Side[] } {
  const on = SIDES.filter((side) => hasSide(edges.boundary, side) || edges.profiled[SIDE_NAMES[side]] === 0)
  const near = SIDES.filter((side) => !on.includes(side) && edges.profiled[SIDE_NAMES[side]] !== undefined)
  return { on, near }
}

/**
 * The whole tile the plan is read from: the only full model, or the one no edge shapes. Every other
 * piece is a cut or a border version and carries its mark on the drawing. Undefined when there is none.
 */
export function basePiece(pieces: readonly PieceSpec[]): PieceSpec | undefined {
  const full = pieces.filter((p) => p.kind === 'full')
  return full.length === 1 ? full[0] : full.find((p) => !hasEdges(p.edges))
}

/** Order the words read in: the vertical side first, as in "top-left corner". */
const WORD_ORDER: readonly Side[] = [2, 0, 3, 1]

const joinAnd = (words: string[]) =>
  words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`

/** "top border", "top-left corner", "top and bottom borders", "every border". */
function borderWords(sides: readonly Side[]): string {
  const names = WORD_ORDER.filter((side) => sides.includes(side)).map((side) => SIDE_NAMES[side])
  if (names.length === 1) return `${names[0]} border`
  if (names.length === 4) return 'every border'
  const vertical = sides.filter((side) => side === 0 || side === 2)
  if (names.length === 2 && vertical.length === 1) return `${names[0]}-${names[1]} corner`
  return `${joinAnd(names)} borders`
}

/**
 * The crop's own label, then how it meets the surface edge: "Full tile, top border", "Right edge,
 * top-right corner", "Bottom-right corner, border" (its cut sides carry the profile), "Full tile,
 * 8 mm from the right border" (a narrow cut lets the profile spill onto it). On a wall with tabs, a piece
 * that carries none although it has a tile beside it says so too ("Full tile, no tab"): that is the one
 * thing telling its pile apart from the ordinary whole tiles.
 */
function pieceLabel(crop: CropRect, tile: LayoutInput['tile'], edges: PieceEdges, locked: boolean): string {
  const base = cropLabel(crop, tile)
  const cut = cutSides(crop, tile)
  const distance = (side: Side) => edges.profiled[SIDE_NAMES[side]]
  const { on, near } = borderSides(edges)
  const words: string[] = []
  // The crop label already names the sides it was cut along; only a side beyond those needs saying.
  if (on.some((side) => !cut.includes(side))) words.push(borderWords(on))
  else if (on.some((side) => distance(side) === 0)) words.push('border')
  for (const side of near) words.push(`${formatLength(distance(side) as number)} from the ${SIDE_NAMES[side]} border`)
  // A piece whose tab side is the wall's own edge has no neighbour there: nothing is missing from it.
  if (locked && edges.tabs === 0 && !hasSide(edges.boundary, TAB_SIDE) && !cut.includes(TAB_SIDE)) words.push('no tab')
  return words.length ? `${base}, ${words.join(', ')}` : base
}

const SIDE_LETTERS = ['B', 'R', 'T', 'L'] as const

/**
 * What an id adds for a border version of a crop: "-b" and the boundary mask when it counts, "-t" and the
 * tab mask on a wall with tabs, then "-e" and each profiled side's letter (B, R, T, L) with its distance to
 * the edge. "full-b12-eT0L0" is the top-left whole tile of a wall with keys and a profile. The tab mask is
 * written for every piece of a tabbed wall, so "full-t2" and "full-t0" are both explicit: they are two
 * models with two different backs. Empty for an interior piece of a wall with neither, so a design without
 * edges keeps "full" and "p-x0-y0-x1-y1".
 */
function edgeSuffix(edges: PieceEdges, locked: boolean): string {
  const profiled = SIDES.filter((side) => edges.profiled[SIDE_NAMES[side]] !== undefined)
  return (
    (edges.boundary ? `-b${edges.boundary}` : '') +
    (locked ? `-t${edges.tabs}` : '') +
    (profiled.length ? `-e${profiled.map((side) => `${SIDE_LETTERS[side]}${edges.profiled[SIDE_NAMES[side]]}`).join('')}` : '')
  )
}

/** The edges a layout actually tells pieces about, or null when no piece is told anything. */
interface ActiveEdges {
  /** Surface sides carrying the profile, in Side order. */
  profiled: Side[]
  band: number
  boundary: boolean
  /** Non-null when the design cuts tabs: the least piece width that can hold the socket one goes into. */
  tabs: { minWidth: number } | null
}

function activeEdges(edges: LayoutEdges | undefined): ActiveEdges | null {
  if (!edges) return null
  const sides = edges.profiled
  const profiled = sides && edges.band > 0 ? SIDES.filter((side) => sides[SIDE_NAMES[side]]) : []
  if (!edges.boundaryMatters && profiled.length === 0) return null
  // Tabs always turn boundaryMatters on, so this never drops them on the way through.
  return { profiled, band: edges.band, boundary: edges.boundaryMatters, tabs: edges.tabs }
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

interface RawPlacement {
  /** The model's key: the crop key, plus the edge suffix once edges are known. */
  key: string
  cropKey: string
  crop: CropRect
  x: number
  y: number
  row: number
  col: number
}

/** One unique model before it gets its mark: a crop, and how it meets the surface edge. */
interface Model {
  crop: CropRect
  cropKey: string
  edges: PieceEdges
  count: number
}

const noEdges = (): PieceEdges => ({ boundary: 0, tabs: 0, profiled: {} })

/**
 * The unique models of a layout. Without edges they are the crops, exactly as before edges existed.
 * With edges, a second pass tells each placement how it meets the surface edge, which is only known
 * once the loop is done: the last row is the top. The boundary comes from rows and columns, never from
 * positions, because a dropped sliver leaves a row end short of the wall. The profiled edge is the
 * bounding box of the placements, so the band follows the tiles actually laid. The same pass reads each
 * placement's right neighbour for its tab, the one thing in `PieceEdges` a piece cannot answer alone.
 */
function modelsOf(
  byCrop: Map<string, { crop: CropRect; count: number }>,
  placements: RawPlacement[],
  edges: ActiveEdges | null,
): Map<string, Model> {
  const models = new Map<string, Model>()
  if (!edges || placements.length === 0) {
    for (const [cropKey, { crop, count }] of byCrop) models.set(cropKey, { crop, cropKey, edges: noEdges(), count })
    return models
  }

  // Placements are emitted row by row, bottom first and left to right.
  const firstRow = placements[0].row
  const lastRow = placements[placements.length - 1].row
  const lastCol = new Map<number, number>()
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of placements) {
    lastCol.set(p.row, Math.max(lastCol.get(p.row) ?? 0, p.col))
    const x = round2(p.x)
    const y = round2(p.y)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, round2(x + round2(p.crop.x1 - p.crop.x0)))
    maxY = Math.max(maxY, round2(y + round2(p.crop.y1 - p.crop.y0)))
  }

  // Wide enough across itself to hold a socket, which is what a tab needs of the tile it goes into.
  const tabs = edges.tabs
  const wide = tabs ? (q: RawPlacement) => round2(q.crop.x1 - q.crop.x0) >= tabs.minWidth - EPS : () => false

  const distances: number[] = [0, 0, 0, 0]
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]
    let boundary = 0
    if (edges.boundary) {
      if (p.row === firstRow) boundary |= 1
      if (p.col === lastCol.get(p.row)) boundary |= 2
      if (p.row === lastRow) boundary |= 4
      if (p.col === 0) boundary |= 8
    }
    // Placements are emitted left to right within a row, so the next one of the same row is the neighbour
    // the tab reaches into. A tab with nothing to go into would bear on that tile's back plate and stand it
    // off the wall, so it is cut only where both pieces are wide enough for the socket; an empty socket is
    // harmless, which is why only the tab looks across the joint.
    const next = placements[i + 1]
    const right = next && next.row === p.row ? next : undefined
    const tab = right && wide(p) && wide(right) ? sideBit(TAB_SIDE) : 0
    const x = round2(p.x)
    const y = round2(p.y)
    const x1 = round2(x + round2(p.crop.x1 - p.crop.x0))
    const y1 = round2(y + round2(p.crop.y1 - p.crop.y0))
    // From each piece side out to the surface edge it faces, in Side order; -1 when out of the band.
    distances[0] = y - minY
    distances[1] = maxX - x1
    distances[2] = maxY - y1
    distances[3] = x - minX
    // The tab mask is part of the model's identity, so two placements of one id always have the same back.
    let suffix = (boundary ? `|b${boundary}` : '') + (tabs ? `|t${tab}` : '')
    for (const side of SIDES) {
      const d = distances[side] < EPS ? 0 : round2(distances[side])
      distances[side] = edges.profiled.includes(side) && d < edges.band ? d : -1
      if (distances[side] >= 0) suffix += `|${SIDE_LETTERS[side]}${d}`
    }
    p.key = suffix ? `${p.cropKey}${suffix}` : p.cropKey
    const model = models.get(p.key)
    if (model) {
      model.count++
      continue
    }
    const profiled: PieceEdges['profiled'] = {}
    for (const side of SIDES) if (distances[side] >= 0) profiled[SIDE_NAMES[side]] = distances[side]
    models.set(p.key, { crop: p.crop, cropKey: p.cropKey, edges: { boundary, tabs: tab, profiled }, count: 1 })
  }
  return models
}

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

  const byCrop = new Map<string, { crop: CropRect; count: number }>()
  const rawPlacements: RawPlacement[] = []
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
      const cropKey = `${crop.x0}:${crop.y0}:${crop.x1}:${crop.y1}`
      const entry = byCrop.get(cropKey)
      if (entry) entry.count++
      else byCrop.set(cropKey, { crop, count: 1 })
      rawPlacements.push({ key: cropKey, cropKey, crop: entry?.crop ?? crop, x: x + cx0, y: y + cy0, row, col })
      col++
    }
    if (col > columns) columns = col
    row++
  }

  const active = activeEdges(input.edges)
  // Every piece of a tabbed wall carries the mask in its id and its label, so both piles are named.
  const locked = active?.tabs != null
  const models = modelsOf(byCrop, rawPlacements, active)
  const sorted = [...models.entries()].sort(([, a], [, b]) => {
    const ka = KIND_ORDER[pieceKind(a.crop, tile)]
    const kb = KIND_ORDER[pieceKind(b.crop, tile)]
    if (ka !== kb) return ka - kb
    // Fewer shaped sides first, so the interior whole tile stays A and each border version follows it.
    const wa = edgeSides(a.edges).length
    const wb = edgeSides(b.edges).length
    if (wa !== wb) return wa - wb
    // A tab is not a surface edge, but the tile that carries one is the wall's ordinary tile: it stays A.
    if (a.edges.tabs !== b.edges.tabs) return b.edges.tabs - a.edges.tabs
    const areaA = (a.crop.x1 - a.crop.x0) * (a.crop.y1 - a.crop.y0)
    const areaB = (b.crop.x1 - b.crop.x0) * (b.crop.y1 - b.crop.y0)
    return areaB - areaA
  })

  const pieces: PieceSpec[] = sorted.map(([, { crop, cropKey, edges, count }], index) => {
    const kind = pieceKind(crop, tile)
    return {
      id: (kind === 'full' ? 'full' : `p-${cropKey.replaceAll(':', '-')}`) + edgeSuffix(edges, locked),
      mark: markFor(index),
      kind,
      label: pieceLabel(crop, tile, edges, locked),
      crop,
      width: round2(crop.x1 - crop.x0),
      height: round2(crop.y1 - crop.y0),
      count,
      edges,
    }
  })

  // Running bonds produce several cuts on the same side; the size tells them apart.
  const labelUse = new Map<string, number>()
  for (const p of pieces) labelUse.set(p.label, (labelUse.get(p.label) ?? 0) + 1)
  for (const p of pieces) {
    if ((labelUse.get(p.label) ?? 0) > 1) p.label = `${p.label} · ${formatSize(p.width, p.height)}`
  }
  // Two border versions a tenth of a millimetre apart read the same even with their size: number them.
  const seen = new Map<string, number>()
  for (const p of pieces) {
    const n = (seen.get(p.label) ?? 0) + 1
    seen.set(p.label, n)
    if (n > 1 && hasEdges(p.edges)) p.label = `${p.label} (${n})`
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
    // The tab stands out past the tile's right side, so the file is wider than the tile and the bed has to
    // take that. Everything else (the plan's chains, the file name, the schedule, the sizes) stays nominal.
    const grow = input.edges?.tabs?.projection ?? 0
    const printedW = round2(tile.width + grow)
    const fits =
      (printedW <= bed.width && tile.height <= bed.depth) ||
      (tile.height <= bed.width && printedW <= bed.depth)
    if (!fits) {
      const printer = `the ${formatSize(bed.width, bed.depth)} bed of the ${bed.name}`
      warnings.push({
        code: 'exceeds-bed',
        message:
          grow > 0
            ? `A ${formatSize(tile.width, tile.height)} tile prints ${formatLength(printedW)} wide with its tab, which does not fit ${printer}.`
            : `A ${formatSize(tile.width, tile.height)} tile does not fit ${printer}.`,
      })
    }
  }
  if (pieces.length > MANY_PIECES) {
    // Border versions are real files too, but saying how many there are tells the maker where they come from.
    const versions = pieces.length - new Set([...models.values()].map((m) => m.cropKey)).size
    // A straight grid from the corner already cuts the fewest models; only the border can add more.
    const advice =
      versions > 0 && layout.rowOffset === 0 && layout.origin === 'corner'
        ? 'Each border piece is its own model, so the count grows with the sides that carry keys, tabs or a profile.'
        : 'A straight grid or the corner origin needs fewer.'
    warnings.push({
      code: 'many-pieces',
      message:
        versions > 0
          ? `This layout needs ${pieces.length} different models, ${versions} of them border versions of another piece. ${advice}`
          : `This layout needs ${pieces.length} different models. ${advice}`,
    })
  }

  // Border versions of the whole tile are whole tiles too.
  const fullCount = pieces.reduce((sum, p) => (p.kind === 'full' ? sum + p.count : sum), 0)
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
  /** What a tab adds to a tile's printed width, mm: a size is only offered while that box fits the bed. */
  grow?: number
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

/** Does the printed box fit the bed either way round? `grow` is what a tab adds to the tile's width. */
function fitsBed(width: number, height: number, bed?: PrinterBed, grow = 0): boolean {
  if (!bed) return true
  const w = width + grow
  return (w <= bed.width && height <= bed.depth) || (height <= bed.width && w <= bed.depth)
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
      if (!fitsBed(column.size, row.size, options.bed, options.grow)) continue
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
  const candidates = STANDARD_TILE_SIZES.filter((s) => s >= min && s <= max && fitsBed(s, s, options.bed, options.grow)).sort(
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
