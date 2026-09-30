// Sample plates: small squares of the maker's own tile in every relief, laid out on a printer's plate, so a
// relief is held in the hand before a wall's worth of tiles is printed. Pure: the worker's own export meshes
// every piece, exactly as it meshes the wall's, and plateStl.ts lays its STL files out on the plates.
//
// Every sample is the design with one thing changed, so what a sample shows is the relief and never a
// different tile: the maker's tile size, base plate, joint edge and color stay, the fixings and the border
// go (a sample is a piece from inside the wall), and the texture, the edge or the depth is the one
// thing that moves.
import { DEFAULT_CONFIG, LIMITS } from '@/core/config'
import { sizeText } from '@/core/export/filenames'
import { pieceMaterialMm3, PLA_DENSITY_G_PER_CM3, PRINT_SETTINGS } from '@/core/estimate'
import type { PrinterBed } from '@/core/layout'
import { createHeightField, TEXTURES, textureById } from '@/core/textures/registry'
import type {
  CropRect,
  DesignConfig,
  ExportQuality,
  JointEdgeProfile,
  LayoutPlan,
  PerimeterProfile,
  PieceEdges,
  PieceSpec,
} from '@/core/types'
import { formatNumber } from '@/core/units'
import { estimateUnpackedBytes } from '@/features/export/sizes'
import { JOINT_COPY, JOINT_ORDER, PERIMETER_COPY, PERIMETER_ORDER, hasPerimeter, withPerimeterProfile } from '@/features/studio/edges'

/** The side of a sample, mm: 5 by 5 of them fill a 256 mm plate, so every relief fits one Bambu Lab plate. */
export const SAMPLE_MM = 45
/** Between the two strips of a joint sample on the plate, mm. */
export const STRIP_GAP_MM = 4
/** A strip narrower than this shows too little relief to judge a joint by, mm. */
const MIN_STRIP_MM = 12
/** The plate's own margin and gap, as `piecesPerPlate` in printers.ts counts them (held equal by the tests). */
export const PLATE_MARGIN_MM = 5
export const PLATE_GAP_MM = 4
/**
 * Always the standard mesh: a 0.4 mm grid is finer than any line a 0.4 mm nozzle lays, so the relief
 * prints as it will on the wall, and a finer one would only quadruple the plates.
 */
export const SAMPLE_QUALITY: ExportQuality = 'standard'

/** What a bed needs to be for this feature: its size only. */
export type PlateSize = Pick<PrinterBed, 'width' | 'depth'>

/** 'yours' is the design exactly as set (its relief, joint and border), 'relief' another pattern, 'extra' a variation. */
export type SampleGroup = 'yours' | 'relief' | 'extra'

/** What the plates hold: every relief of the catalogue, or only the maker's own relief as they set it. */
export type SampleScope = 'every' | 'yours'

/** What one sample varies, for the legend and the README. */
export type SampleKind = 'relief' | 'joint' | 'border' | 'depth' | 'invert' | 'turn'

export interface SamplePiece {
  spec: PieceSpec
  /** The piece's front-left corner in its sample's box, mm. */
  x: number
  y: number
}

export interface Sample {
  /** Stable and unique within a set: 'yours', 'joint', 'relief-coral', 'border-ogee', 'deeper'. */
  key: string
  group: SampleGroup
  kind: SampleKind
  /** "Your relief: Wavy", "Coral", "Rounded edge". */
  title: string
  /** One sentence on what it shows. */
  note: string
  /** The design the worker meshes its pieces from. */
  config: DesignConfig
  pieces: SamplePiece[]
}

export interface SampleSet {
  /** Every sample's box on the plate, mm: the joint's two strips share one. */
  box: { width: number; height: number }
  /** The maker's own relief, joint and border, then every other relief: always printed. */
  core: Sample[]
  /** Variations on the maker's relief, in the order they fill the spare places of the last plate. */
  extras: Sample[]
}

export interface PlateGrid {
  columns: number
  rows: number
  perPlate: number
  /** Front-left corner of the front-left box, mm from the plate's front-left corner: the grid is centred. */
  x0: number
  y0: number
}

export interface PlacedSample extends Sample {
  /** 1 onwards, across every plate in reading order: its place is its only label. */
  number: number
  /** 0 onwards. */
  plate: number
  /** 0 is the back row, which is the top of the map. */
  row: number
  column: number
  /** Front-left corner of its box on the plate, mm. */
  x: number
  y: number
}

export interface SamplePlates {
  scope: SampleScope
  bed: PlateSize
  box: SampleSet['box']
  /** The grid the samples are laid on: the whole plate's, or a smaller one centred when a single plate is not full. */
  grid: PlateGrid
  /** Samples one plate of this bed takes. */
  capacity: number
  /** Every placed sample, in number order. */
  samples: PlacedSample[]
  /** The samples of each plate, in number order. */
  plates: PlacedSample[][]
  /** Variations that found a spare place. */
  extrasPlaced: number
}

const round2 = (v: number) => Math.round(v * 100) / 100
const round1 = (v: number) => Math.round(v * 10) / 10
const INTERIOR: PieceEdges = { boundary: 0, tabs: 0, profiled: {} }
const CORNER_SIDES = { bottom: true, left: true, top: false, right: false }
const CORNER_EDGES: PieceEdges = { boundary: 0, tabs: 0, profiled: { bottom: 0, left: 0 } }

/** The joint edge a design prints: a shape of no size prints square. */
const printedJoint = (config: Pick<DesignConfig, 'jointEdge' | 'bevel'>): JointEdgeProfile =>
  config.bevel > 0 ? config.jointEdge : 'square'

function pieceSpec(config: DesignConfig, key: string, crop: CropRect, edges: PieceEdges = INTERIOR): PieceSpec {
  const width = round2(crop.x1 - crop.x0)
  const height = round2(crop.y1 - crop.y0)
  const whole = width >= config.tile.width && height >= config.tile.height
  return {
    id: `${key}-p-${crop.x0}-${crop.y0}-${crop.x1}-${crop.y1}`,
    mark: 'S',
    kind: whole ? 'full' : 'edge',
    label: 'Sample',
    crop,
    width,
    height,
    count: 1,
    edges,
  }
}

/**
 * The design every sample starts from: nothing in its back and no border, on a surface the size of one
 * sample. The layout is kept, because a running bond changes the period the relief repeats over.
 */
function sampleBase(config: DesignConfig, box: SampleSet['box']): DesignConfig {
  return {
    ...config,
    surface: { width: box.width, height: box.height },
    perimeter: { ...config.perimeter, profile: 'none' },
    lock: 'none',
    mount: 'glue',
  }
}

/** Relief within this share of the best window counts as a tie, which the window nearest the middle wins. */
const TIE_SHARE = 0.97

/** Candidate starts along one axis: whole millimetres either side of the middle, one repeat of the pattern wide. */
function windowAxis(length: number, size: number, repeat: number): { start: number; steps: number } {
  const span = Math.max(0, length - size)
  const reach = Math.floor(Math.min(span / 2, repeat / 2))
  return { start: span / 2 - reach, steps: 2 * reach }
}

/**
 * Where in the tile a sample is cut. A 45 mm window from the middle can fall wholly inside one cell of a
 * large pattern (a Zellige tile is 50 mm) and miss every line that makes it that pattern, so the window is
 * the one, within a repeat of the middle, where the relief varies most: the heights on a 1 mm grid, every
 * candidate's variance read off summed-area tables. A pattern that looks the same everywhere keeps the middle.
 */
function reliefCrop(config: DesignConfig, box: SampleSet['box']): CropRect {
  const field = createHeightField(config)
  const x = windowAxis(config.tile.width, box.width, field.periodX / field.repeatsX)
  const y = windowAxis(config.tile.height, box.height, field.periodY / field.repeatsY)
  const cellsX = Math.max(1, Math.floor(box.width))
  const cellsY = Math.max(1, Math.floor(box.height))
  const nx = x.steps + cellsX
  const ny = y.steps + cellsY
  // Sums and sums of squares from the grid's corner, one row and one column of zeros ahead.
  const sum = new Float64Array((nx + 1) * (ny + 1))
  const squares = new Float64Array((nx + 1) * (ny + 1))
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const h = field(x.start + i + 0.5, y.start + j + 0.5)
      const at = (j + 1) * (nx + 1) + i + 1
      sum[at] = h + sum[at - 1] + sum[at - nx - 1] - sum[at - nx - 2]
      squares[at] = h * h + squares[at - 1] + squares[at - nx - 1] - squares[at - nx - 2]
    }
  }
  const area = (table: Float64Array, i: number, j: number) => {
    const at = (a: number, b: number) => table[b * (nx + 1) + a]
    return at(i + cellsX, j + cellsY) - at(i, j + cellsY) - at(i + cellsX, j) + at(i, j)
  }
  const n = cellsX * cellsY
  const windows: { i: number; j: number; variance: number }[] = []
  for (let j = 0; j <= y.steps; j++) {
    for (let i = 0; i <= x.steps; i++) {
      const mean = area(sum, i, j) / n
      windows.push({ i, j, variance: area(squares, i, j) / n - mean * mean })
    }
  }
  const best = Math.max(...windows.map((w) => w.variance))
  const off = (w: { i: number; j: number }) => (w.i - x.steps / 2) ** 2 + (w.j - y.steps / 2) ** 2
  const chosen = windows.filter((w) => w.variance >= best * TIE_SHARE).sort((a, b) => off(a) - off(b))[0]
  const x0 = round2(x.start + (chosen?.i ?? x.steps / 2))
  const y0 = round2(y.start + (chosen?.j ?? y.steps / 2))
  return { x0, y0, x1: round2(x0 + box.width), y1: round2(y0 + box.height) }
}

function square(key: string, config: DesignConfig, box: SampleSet['box'], edges: PieceEdges = INTERIOR): SamplePiece[] {
  return [{ spec: pieceSpec(config, key, reliefCrop(config, box), edges), x: 0, y: 0 }]
}

/**
 * Two strips cut either side of the joint between two tiles of the wall: the right-hand end of one tile and
 * the left-hand end of the next. The relief is periodic over the tile, so butted together they show the
 * pattern running on across the joint, with the joint edge between them, exactly as the wall does.
 */
function jointStrips(key: string, config: DesignConfig, box: SampleSet['box'], strip: number): SamplePiece[] {
  const { y0, y1 } = reliefCrop(config, box)
  const tile = config.tile.width
  return [
    { spec: pieceSpec(config, `${key}-l`, { x0: round2(tile - strip), y0, x1: tile, y1 }), x: 0, y: 0 },
    { spec: pieceSpec(config, `${key}-r`, { x0: 0, y0, x1: strip, y1 }), x: round2(box.width - strip), y: 0 },
  ]
}

const mm = (value: number) => `${formatNumber(value, 2)} mm`

/**
 * Every sample a design can print. The core is always printed: the maker's relief as the wall prints it,
 * its joint, its border when it has one, then every other relief of the catalogue at its own depth and
 * feature size, in the studio's order. The extras vary one thing about the maker's relief, in the order the
 * studio asks about it: the other joint edges, the other borders, then the pattern's depth, invert and turn.
 * They only ever fill spare places.
 */
export function sampleSet(config: DesignConfig): SampleSet {
  const box = { width: round2(Math.min(SAMPLE_MM, config.tile.width)), height: round2(Math.min(SAMPLE_MM, config.tile.height)) }
  const base = sampleBase(config, box)
  const texture = textureById(config.texture.id)
  const strip = round2((box.width - STRIP_GAP_MM) / 2)
  const joints = strip >= MIN_STRIP_MM
  const joint = printedJoint(config)
  const tileText = `${sizeText(config.tile.width)} × ${sizeText(config.tile.height)} mm`

  const core: Sample[] = [
    {
      key: 'yours',
      group: 'yours',
      kind: 'relief',
      title: `Your relief: ${texture.name}`,
      note: `A ${sizeText(box.width)} × ${sizeText(box.height)} mm square of your ${tileText} tile, as the wall prints it.`,
      config: base,
      pieces: square('yours', base, box),
    },
  ]
  if (joints) {
    core.push({
      key: 'joint',
      group: 'yours',
      kind: 'joint',
      title: `Your joint: ${JOINT_COPY[joint].name.toLowerCase()} edge`,
      note: 'Two strips from either side of a joint between two of your tiles: butt them together, relief up, and the pattern runs on across the joint.',
      config: base,
      pieces: jointStrips('joint', base, box, strip),
    })
  }
  const ownBorder: PerimeterProfile | null = hasPerimeter(config) ? config.perimeter.profile : null
  const corner = (profile: Exclude<PerimeterProfile, 'none'>): Sample => {
    // The maker's own border keeps its width, drop and land; any other starts from its defaults, as picking it would.
    const shaped = profile === ownBorder ? { ...base, perimeter: config.perimeter } : withPerimeterProfile(base, profile)
    const bordered = { ...shaped, perimeter: { ...shaped.perimeter, profile, sides: CORNER_SIDES } }
    const heading = PERIMETER_COPY[profile].heading
    return {
      key: `border-${profile}`,
      group: profile === ownBorder ? 'yours' : 'extra',
      kind: 'border',
      title: profile === ownBorder ? `Your border: ${heading.toLowerCase()}` : heading,
      note: 'A corner of the wall, with this border along its two outer sides.',
      config: bordered,
      pieces: square(`border-${profile}`, bordered, box, CORNER_EDGES),
    }
  }
  // The design's own border is part of the design as set, so it always prints, beside its relief and joint.
  if (ownBorder && ownBorder !== 'none') core.push(corner(ownBorder))
  for (const other of TEXTURES) {
    if (other.id === texture.id) continue
    const relief = {
      ...base,
      texture: {
        ...DEFAULT_CONFIG.texture,
        id: other.id,
        params: {},
        depth: other.defaults.depth,
        scale: other.defaults.scale,
      },
    }
    core.push({
      key: `relief-${other.id}`,
      group: 'relief',
      kind: 'relief',
      title: other.name,
      note: `${other.mark}, at its own ${mm(other.defaults.depth)} depth and ${mm(other.defaults.scale)} feature size.`,
      config: relief,
      pieces: square(`relief-${other.id}`, relief, box),
    })
  }

  const extras: Sample[] = []
  if (joints) {
    for (const edge of JOINT_ORDER) {
      if (edge === joint) continue
      // A shape needs a size, or it prints square: the studio's own rule when a maker leaves Square.
      const edged = { ...base, jointEdge: edge, bevel: edge !== 'square' && base.bevel <= 0 ? DEFAULT_CONFIG.bevel : base.bevel }
      extras.push({
        key: `joint-${edge}`,
        group: 'extra',
        kind: 'joint',
        title: `${JOINT_COPY[edge].name} joint`,
        note: `Two strips like your joint, with a ${JOINT_COPY[edge].name.toLowerCase()} edge instead: butt them together to compare.`,
        config: edged,
        pieces: jointStrips(`joint-${edge}`, edged, box, strip),
      })
    }
  }
  for (const profile of PERIMETER_ORDER) {
    if (profile !== 'none' && profile !== ownBorder) extras.push(corner(profile))
  }
  const depth = config.texture.depth
  const low = Math.max(LIMITS.depth.min, texture.depthRange[0])
  const high = Math.min(LIMITS.depth.max, texture.depthRange[1])
  for (const [key, factor] of [
    ['deeper', 1.5],
    ['shallower', 0.5],
  ] as const) {
    const next = round1(Math.min(high, Math.max(low, depth * factor)))
    if (next === round1(depth)) continue
    const deep = { ...base, texture: { ...base.texture, depth: next } }
    extras.push({
      key,
      group: 'extra',
      kind: 'depth',
      title: `${texture.name}, ${mm(next)} deep`,
      note: `Your relief, ${key} than your ${mm(depth)}.`,
      config: deep,
      pieces: square(key, deep, box),
    })
  }
  if (depth > 0) {
    const inverted = { ...base, texture: { ...base.texture, invert: !base.texture.invert } }
    extras.push({
      key: 'invert',
      group: 'extra',
      kind: 'invert',
      title: `${texture.name}, inverted`,
      note: 'Your relief with its peaks and valleys swapped.',
      config: inverted,
      pieces: square('invert', inverted, box),
    })
  }
  if (texture.directional) {
    const turned = { ...base, texture: { ...base.texture, rotate: !base.texture.rotate } }
    extras.push({
      key: 'turn',
      group: 'extra',
      kind: 'turn',
      title: `${texture.name}, quarter turn`,
      note: 'Your relief turned a quarter, running across the tile instead of along it.',
      config: turned,
      pieces: square('turn', turned, box),
    })
  }
  return { box, core, extras }
}

/**
 * How many samples one plate takes, and where the grid starts: rows and columns of boxes with the same
 * margin and gap `piecesPerPlate` counts a plate with, centred on the plate. A box that only fits without
 * the margins still prints alone, as a tile does.
 */
export function plateGrid(bed: PlateSize, box: SampleSet['box']): PlateGrid {
  const fit = (usable: number, size: number) => Math.max(0, Math.floor((usable + PLATE_GAP_MM) / (size + PLATE_GAP_MM)))
  let columns = fit(bed.width - 2 * PLATE_MARGIN_MM, box.width)
  let rows = fit(bed.depth - 2 * PLATE_MARGIN_MM, box.height)
  if (columns * rows === 0) {
    const alone = box.width <= bed.width && box.height <= bed.depth
    columns = alone ? 1 : 0
    rows = alone ? 1 : 0
  }
  return centredGrid(bed, box, columns, rows)
}

/**
 * The fewest places that hold `count` samples within a plate's grid: no empty place if it can be helped, then
 * as square as it can be, then wider, since a plate is read across. Two samples sit side by side in the
 * middle of the plate, not in the corner of an empty 5 by 5.
 */
export function compactGrid(bed: PlateSize, box: SampleSet['box'], full: PlateGrid, count: number): PlateGrid {
  let best = { columns: full.columns, rows: full.rows, empty: Infinity, skew: Infinity }
  for (let columns = Math.max(1, Math.ceil(count / full.rows)); columns <= Math.min(full.columns, count); columns++) {
    const rows = Math.ceil(count / columns)
    const empty = columns * rows - count
    const skew = Math.abs(columns - rows)
    if (empty < best.empty || (empty === best.empty && skew <= best.skew)) best = { columns, rows, empty, skew }
  }
  return centredGrid(bed, box, best.columns, best.rows)
}

function centredGrid(bed: PlateSize, box: SampleSet['box'], columns: number, rows: number): PlateGrid {
  const gridWidth = columns * box.width + Math.max(0, columns - 1) * PLATE_GAP_MM
  const gridDepth = rows * box.height + Math.max(0, rows - 1) * PLATE_GAP_MM
  return {
    columns,
    rows,
    perPlate: columns * rows,
    x0: round2((bed.width - gridWidth) / 2),
    y0: round2((bed.depth - gridDepth) / 2),
  }
}

/**
 * The plates for one bed. Every relief: as many plates as the core needs, the spare places of the last one
 * filled with extras. Yours only: the design exactly as set (its relief, its joint, its border when it has
 * one) and nothing varied, since a variation is a parameter the maker did not choose. Samples are numbered in
 * reading order, from the back-left of plate 1 (the top-left of its map), so a number is a place and the map
 * is the only label a sample needs. Null when the bed takes no sample at all.
 */
export function samplePlates(
  config: DesignConfig,
  bed: PlateSize,
  set: SampleSet = sampleSet(config),
  scope: SampleScope = 'every',
): SamplePlates | null {
  const full = plateGrid(bed, set.box)
  if (full.perPlate === 0) return null
  let chosen: Sample[]
  let extrasPlaced = 0
  if (scope === 'yours') {
    chosen = [...set.core, ...set.extras].filter((sample) => sample.group === 'yours')
  } else {
    const spare = Math.ceil(set.core.length / full.perPlate) * full.perPlate - set.core.length
    const extras = set.extras.slice(0, spare)
    chosen = [...set.core, ...extras]
    extrasPlaced = extras.length
  }
  const plateCount = Math.ceil(chosen.length / full.perPlate)
  const grid = chosen.length < full.perPlate ? compactGrid(bed, set.box, full, chosen.length) : full
  const samples = chosen.map((sample, index): PlacedSample => {
    const slot = index % grid.perPlate
    const row = Math.floor(slot / grid.columns)
    const column = slot % grid.columns
    return {
      ...sample,
      number: index + 1,
      plate: Math.floor(index / grid.perPlate),
      row,
      column,
      x: round2(grid.x0 + column * (set.box.width + PLATE_GAP_MM)),
      y: round2(grid.y0 + (grid.rows - 1 - row) * (set.box.height + PLATE_GAP_MM)),
    }
  })
  const plates = Array.from({ length: plateCount }, (_, plate) => samples.filter((sample) => sample.plate === plate))
  return { scope, bed, box: set.box, grid, capacity: full.perPlate, samples, plates, extrasPlaced }
}

/** What the worker is asked for one sample: its design, a plan holding its pieces, and their ids. */
export interface SampleJob {
  config: DesignConfig
  plan: LayoutPlan
  pieceIds: string[]
}

function planOf(pieces: readonly PieceSpec[]): LayoutPlan {
  return {
    pieces: [...pieces],
    placements: pieces.map((piece, col) => ({ pieceId: piece.id, x: 0, y: 0, row: 0, col })),
    columns: pieces.length,
    rows: 1,
    fullCount: pieces.filter((piece) => piece.kind === 'full').length,
    partialCount: pieces.filter((piece) => piece.kind !== 'full').length,
    exact: false,
    warnings: [],
  }
}

export function sampleJob(sample: Pick<Sample, 'config' | 'pieces'>): SampleJob {
  const specs = sample.pieces.map((piece) => piece.spec)
  return { config: sample.config, plan: planOf(specs), pieceIds: specs.map((spec) => spec.id) }
}

/**
 * Filament for every plate, grams: each piece weighed as a slab at its mean height (the base plate plus half
 * its relief), then through the same skins, walls and infill the wall's own estimate uses. An estimate.
 */
export function samplePlatesGrams(plates: Pick<SamplePlates, 'samples'>): number {
  let mm3 = 0
  for (const sample of plates.samples) {
    const height = sample.config.tile.thickness + sample.config.texture.depth / 2
    for (const { spec } of sample.pieces) {
      mm3 += pieceMaterialMm3(spec.width * spec.height * height, spec.width, spec.height, PRINT_SETTINGS.infill)
    }
  }
  return (mm3 / 1000) * PLA_DENSITY_G_PER_CM3
}

/**
 * Deflate on a plate of samples, measured at level 6 on the default design and two others (a 256 mm plate in
 * Wavy and in Terrazzo, three 180 mm plates in Coral): 3.6 to 4.0. Small squares of relief repeat more than a
 * wall's own models do, which sizes.ts measured at 2.3.
 */
const SAMPLE_ZIP_RATIO = 3.5

/** What the zip weighs, bytes: its plates are exactly the pieces' own STL triangles, deflated. */
export function samplePlatesBytes(plates: Pick<SamplePlates, 'samples'>): number {
  const first = plates.samples[0]
  if (!first) return 0
  // Every sample is cut from one tile, so the worker meshes them all on the same grid.
  const pieces = plates.samples.flatMap((sample) => sample.pieces.map((piece) => piece.spec))
  return estimateUnpackedBytes(planOf(pieces), first.config, 'stl', SAMPLE_QUALITY, []) / SAMPLE_ZIP_RATIO
}

/** One line of the legend under the plates: a run of numbers and what they hold. */
export interface LegendLine {
  numbers: string
  text: string
}

const runText = (first: number, last: number) => (first === last ? `${first}` : `${first} to ${last}`)

const EXTRA_WORDS: Record<Exclude<SampleKind, 'relief'>, [string, string]> = {
  joint: ['joint edge', 'joint edges'],
  border: ['border', 'borders'],
  depth: ['depth', 'depths'],
  invert: ['inverted', 'inverted'],
  turn: ['quarter turn', 'quarter turns'],
}

/**
 * The plates in a few lines: the maker's own samples one by one, the other reliefs as one run, and the
 * extras as one run named by what they vary. Every number is a place on a plate.
 */
export function plateLegend(plates: Pick<SamplePlates, 'samples'>): LegendLine[] {
  const lines: (LegendLine & { first: number })[] = []
  const { samples } = plates
  for (const sample of samples.filter((s) => s.group === 'yours')) {
    lines.push({ first: sample.number, numbers: `${sample.number}`, text: sample.title })
  }
  const reliefs = samples.filter((s) => s.group === 'relief')
  if (reliefs.length > 0) {
    lines.push({
      first: reliefs[0].number,
      numbers: runText(reliefs[0].number, reliefs[reliefs.length - 1].number),
      text: reliefs.length === 1 ? reliefs[0].title : `The ${reliefs.length} other reliefs, in the studio's order`,
    })
  }
  const extras = samples.filter((s) => s.group === 'extra')
  if (extras.length > 0) {
    const kinds: string[] = []
    for (const kind of ['joint', 'border', 'depth', 'invert', 'turn'] as const) {
      const count = extras.filter((s) => s.kind === kind).length
      if (count === 0) continue
      const [one, many] = EXTRA_WORDS[kind]
      kinds.push(kind === 'invert' || kind === 'turn' ? one : count === 1 ? `1 ${one}` : `${count} ${many}`)
    }
    const list = kinds.length === 1 ? kinds[0] : `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}`
    lines.push({
      first: extras[0].number,
      numbers: runText(extras[0].number, extras[extras.length - 1].number),
      text: extras.length === 1 ? `In the spare place: ${extras[0].title}` : `In the spare places, your relief varied: ${list}`,
    })
  }
  // The maker's own border fills a spare place after the other reliefs, so the lines go by number, not by group.
  return lines.sort((a, b) => a.first - b.first).map(({ numbers, text }) => ({ numbers, text }))
}
