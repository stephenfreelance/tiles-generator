// The setting-out drawing of the surface as plain data: the studio renders it with React,
// planSvg turns it into the print-ready sheet that ships in the zip.
import { wallParts } from '../fixing/accessories'
import { fixingSystem, listText, usesClips, usesTabs, type FixingSystem } from '../fixing/guide'
import { joinPlan } from '../fixing/joins'
import { mountPlan } from '../fixing/mount'
import { tabPlan, type TabPlan } from '../fixing/tabs'
import type { AccessoryKind, AccessorySpec, ClipSite, JoinPlan, KeySite, MountPlan } from '../fixing/types'
import { axisStart, basePiece, rowShiftCycle } from '../layout'
import type { DesignConfig, LayoutOrigin, LayoutPlan, PieceEdges, PieceKind, RowOffset } from '../types'
import { formatLength, formatNumber } from '../units'

/** Two lengths closer than this are the same length (mm), as in layout.ts. */
const EPS = 0.01
/** A tile corner this close to the setting-out point is the tile the maker sets first (mm). */
const POINT_TOLERANCE = 0.5

const round2 = (v: number) => Math.round(v * 100) / 100
const mod = (a: number, n: number) => ((a % n) + n) % n

export interface PlanTile {
  pieceId: string
  mark: string
  kind: PieceKind
  label: string
  /** Bottom-left corner on the surface, mm (origin bottom-left, y up). */
  x: number
  y: number
  w: number
  h: number
  row: number
  col: number
  /** True for every piece that is not a full tile (drawn hatched with its mark). */
  cut: boolean
  /** How the piece meets the surface edge: a whole tile with edges is a border version, marked too. */
  edges: PieceEdges
}

/**
 * One stretch of a dimension chain. `tile` is a full-size tile along this axis, `cut` a piece
 * shorter than the nominal tile, `joint` the gap between two pieces, `gap` an edge strip left
 * to the joint (a dropped sliver).
 */
export type ChainItemKind = 'tile' | 'cut' | 'joint' | 'gap'

export interface ChainItem {
  kind: ChainItemKind
  start: number
  end: number
  length: number
  mark?: string
  pieceId?: string
}

export interface DimensionChain {
  axis: 'x' | 'y'
  /** "Row 1" for the bottom chain of a straight grid, one chain per row of a running-bond cycle. */
  title: string
  /** Contiguous from 0 to `total`: the lengths always sum to the surface size. */
  items: ChainItem[]
  total: number
}

export interface ChainLabel {
  start: number
  end: number
  center: number
  text: string
  cut: boolean
  /** Several equal full tiles summarized as "8 × 150". */
  grouped: boolean
  /** False when the text is wider than its span at the requested density (draw it offset). */
  fits: boolean
}

export interface PlanMarkRow {
  mark: string
  pieceId: string
  kind: PieceKind
  label: string
  width: number
  height: number
  count: number
  edges: PieceEdges
}

/** One printed part that is not a tile, as "Your pieces" lists it after the tiles. */
export interface PlanAccessoryRow {
  id: string
  mark: string
  kind: AccessoryKind
  label: string
  group: AccessorySpec['group']
  count: number
  /** Bounding box as printed, mm. */
  size: AccessorySpec['size']
}

/** How the grid is anchored along one axis. */
export type AxisSetOut = 'edge' | 'tile-centred' | 'joint-centred'

export interface SettingOut {
  origin: LayoutOrigin
  /** Bottom-left corner of the first piece to set, surface mm. */
  point: { x: number; y: number }
  /**
   * Lines to snap a chalk line on (null when set out from the edge). The level one is the middle of
   * the wall; in a running bond the upright one moves to the nearest tile centre or joint of the
   * start row, so it can sit a little off the middle.
   */
  centreLines: { x: number | null; y: number | null }
  modeX: AxisSetOut
  modeY: AxisSetOut
  /** Plain instructions for the installer, one sentence each. */
  notes: string[]
}

export interface PlanModel {
  width: number
  height: number
  joint: number
  tile: { width: number; height: number }
  tiles: PlanTile[]
  chains: {
    /** Bottom chains, one per distinct row of the bond cycle (1 for a straight grid). */
    columns: DimensionChain[]
    /** Left chain, one item per row. */
    rows: DimensionChain
  }
  overall: { width: number; height: number }
  settingOut: SettingOut
  legend: PlanMarkRow[]
  /**
   * The whole tile the drawing leaves unlettered: the only full model, or the one no edge shapes.
   * Every other piece, cut or whole, carries its mark so the installer can tell A from B. Null when
   * every whole tile is a border version.
   */
  basePieceId: string | null
  fullCount: number
  cutCount: number
  exact: boolean
  /**
   * Every wall clip, one per pocket over every placed tile: the centre of its pocket, surface mm, and which
   * way it lies ('h' along the wall, 'v' turned for a narrow piece). Bottom to top, then left to right;
   * empty unless the wall really goes up on clips.
   */
  clips: ClipSite[]
  /** Pieces with no clip pocket (too small or too narrow for one), glued or held by their keys; empty without clips. */
  unclippedPieceIds: string[]
  /** Where each key goes, surface mm; empty with keys off. */
  keys: KeySite[]
  /** Joints left without a key (too short for one). */
  unkeyedSeams: number
  /** Pieces keyed to no neighbour at all: they are glued instead. */
  unkeyedPieceIds: string[]
  /**
   * Joints within a row that a tab holds shut; 0 with the tabs off. Nothing is drawn or set out for them
   * (every tile carries its own), so this is a count for the notes and the rail, never a place on the sheet.
   */
  locks: number
  /** Pieces no tab locks to either tile beside them: those joints are glued. Empty with the tabs off. */
  unlockedPieceIds: string[]
  /** The wall's own printed parts (wallParts), in print order: the clips, then the keys. The fit test is
   * not among them: it prints from its own page, and the plan sets out the wall. */
  accessories: PlanAccessoryRow[]
}

/** Chain of pieces along one axis, filling the holes with joints and edge gaps so it sums to `total`. */
function buildChain(
  axis: 'x' | 'y',
  title: string,
  total: number,
  nominal: number,
  joint: number,
  spans: { start: number; length: number; mark: string; pieceId: string }[],
): DimensionChain {
  const items: ChainItem[] = []
  let cursor = 0
  const push = (kind: ChainItemKind, start: number, end: number, extra: Partial<ChainItem> = {}) => {
    if (end - start < EPS / 2) return
    items.push({ kind, start: round2(start), end: round2(end), length: round2(end - start), ...extra })
  }
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    const end = Math.min(total, span.start + span.length)
    if (span.start > cursor + EPS / 2) {
      const hole = span.start - cursor
      // Between two pieces a hole the size of the joint is the joint; anything else is an absorbed sliver.
      const isJoint = cursor > 0 && joint > 0 && Math.abs(hole - joint) < EPS * 2
      push(isJoint ? 'joint' : 'gap', cursor, span.start)
    }
    const kind: ChainItemKind = span.length < nominal - EPS ? 'cut' : 'tile'
    push(kind, Math.max(cursor, span.start), end, { mark: span.mark, pieceId: span.pieceId })
    cursor = Math.max(cursor, end)
  }
  if (cursor < total - EPS / 2) push('gap', cursor, total)
  // Rounding each item to 0.01 mm can leave the last end a hair off the true total.
  const last = items.at(-1)
  if (last && Math.abs(last.end - total) < EPS) {
    last.end = total
    last.length = round2(total - last.start)
  }
  return { axis, title, items, total }
}

/** Where the centre line falls relative to the grid anchored at `start`. */
function axisMode(length: number, size: number, joint: number, origin: LayoutOrigin): AxisSetOut {
  if (origin === 'corner') return 'edge'
  const pitch = size + joint
  const start = axisStart(length, size, joint, origin)
  const within = mod(length / 2 - start, pitch)
  return Math.abs(within - size / 2) < EPS * 5 ? 'tile-centred' : 'joint-centred'
}

/**
 * Surface coordinate of the full-tile corner to measure from along one axis.
 * An `edge` axis anchored at its end (surface y, read from the top) puts the cut in the first row,
 * so the setting-out point is the start of the first WHOLE piece, not the surface corner.
 */
function axisPoint(
  length: number,
  size: number,
  joint: number,
  mode: AxisSetOut,
  origin: LayoutOrigin,
  anchor: 'start' | 'end',
): number {
  if (mode === 'edge') {
    const start = axisStart(length, size, joint, origin, anchor)
    if (start > -EPS) return 0
    const firstWhole = start + size + joint
    // A wall too short to hold a whole piece has no such corner; fall back to the surface edge.
    return firstWhole + size <= length + EPS ? round2(firstWhole) : 0
  }
  if (mode === 'tile-centred') return round2(length / 2 - size / 2)
  return round2(length / 2 + joint / 2)
}

export type WallSide = 'top' | 'right' | 'bottom' | 'left'

/** Clockwise from the top, the order a sentence lists the edges in. */
const SIDE_ORDER: readonly WallSide[] = ['top', 'right', 'bottom', 'left']

/** The wall edges a piece's cut sits on: along each axis where it is short, the edges it touches. */
export function tileCutSides(tile: PlanTile, model: Pick<PlanModel, 'width' | 'height' | 'tile'>): WallSide[] {
  const sides: WallSide[] = []
  if (!tile.cut) return sides
  if (tile.w < model.tile.width - EPS) {
    if (tile.x <= EPS) sides.push('left')
    if (tile.x + tile.w >= model.width - EPS) sides.push('right')
  }
  if (tile.h < model.tile.height - EPS) {
    if (tile.y <= EPS) sides.push('bottom')
    if (tile.y + tile.h >= model.height - EPS) sides.push('top')
  }
  return sides
}

/** Every wall edge that takes a cut, clockwise from the top. */
export function wallCutSides(model: Pick<PlanModel, 'width' | 'height' | 'tile' | 'tiles'>): WallSide[] {
  const found = new Set<WallSide>()
  for (const t of model.tiles) for (const side of tileCutSides(t, model)) found.add(side)
  return SIDE_ORDER.filter((side) => found.has(side))
}

/** True for a piece the drawing letters: every cut, and every whole tile but the base one. */
export const isLettered = (model: Pick<PlanModel, 'basePieceId'>, piece: { pieceId: string; kind: PieceKind }): boolean =>
  piece.kind !== 'full' || piece.pieceId !== model.basePieceId

/** The piece whose bottom-left corner sits on the setting-out point, if one does. */
export function tileAtPoint(tiles: readonly PlanTile[], point: { x: number; y: number }): PlanTile | null {
  return tiles.find((t) => Math.abs(t.x - point.x) <= POINT_TOLERANCE && Math.abs(t.y - point.y) <= POINT_TOLERANCE) ?? null
}

/**
 * A running bond lays every row on its own grid, so the upright line is read from the row the
 * setting-out point starts: the middle of the wall can fall on a joint there, or inside a tile, and
 * the line then moves to the nearest tile centre or joint of that row.
 */
function bondLineX(
  tiles: readonly PlanTile[],
  centre: number,
  rowBottom: number,
  size: number,
  joint: number,
): { mode: AxisSetOut; line: number } | null {
  let row: number | null = null
  let best = Infinity
  for (const t of tiles) {
    const d = Math.abs(t.y - rowBottom)
    if (d < best - EPS) {
      best = d
      row = t.row
    }
  }
  const whole = tiles.find((t) => t.row === row && Math.abs(t.w - size) < EPS)
  if (!whole) return null
  const pitch = size + joint
  const nearest = (offset: number) => whole.x + offset + Math.round((centre - whole.x - offset) / pitch) * pitch
  const tileLine = nearest(size / 2)
  const jointLine = nearest(size + joint / 2)
  return Math.abs(tileLine - centre) <= Math.abs(jointLine - centre) + EPS
    ? { mode: 'tile-centred', line: round2(tileLine) }
    : { mode: 'joint-centred', line: round2(jointLine) }
}

/** "Running bond: shift every row by half a tile against the one below it." */
const bondNote = (rowOffset: RowOffset): string =>
  `Running bond: shift every row by ${rowShiftCycle(rowOffset) === 2 ? 'half a tile' : 'a third of a tile'} against the one below it.`

const onLine = (mode: AxisSetOut, joint: number) =>
  mode === 'tile-centred' ? 'centre a tile on it' : joint > 0 ? 'centre a joint on it' : 'start a tile on it'

/**
 * Keys and clips put the tiles up from their bottom edge, row by row, whatever the grid: the README's
 * mounting steps and the download page say so, and a sheet that lays the whole tiles first would put the
 * keys between them and the bottom cuts in wrong. The centre lines stay, as the lines the rows are checked on.
 */
function fixedNotes(
  model: Pick<SettingOut, 'modeX' | 'modeY' | 'centreLines'>,
  joint: number,
  rowOffset: RowOffset,
  system: Exclude<FixingSystem, 'glue'>,
): string[] {
  const { modeX, modeY, centreLines } = model
  const notes =
    system === 'keys'
      ? ['Key the tiles together face down, in the order of this plan, then put the panel up with its bottom edge on a level line (see MOUNTING in the README).']
      : ['The start line is the bottom edge of the tiles: draw it level first, with a straight batten under it for the bottom row to stand on.']
  if (centreLines.x !== null) notes.push(`Snap a vertical line at ${formatLength(centreLines.x)} from the left edge and ${onLine(modeX, joint)}.`)
  if (centreLines.y !== null) notes.push(`Snap a level line at ${formatLength(centreLines.y)} from the bottom and ${onLine(modeY, joint)}.`)
  if (rowOffset !== 0) notes.push(bondNote(rowOffset))
  if (system === 'both') {
    notes.push('Press the tiles on from the bottom row up, each row from left to right with its keys, fitting the cut pieces as you reach them (see MOUNTING in the README).')
  } else if (usesClips(system)) {
    // No clip is set out on the wall: each tile carries its own and puts them where it goes.
    notes.push('Press the tiles on from the bottom row up, fitting the cut pieces as you reach them: each tile carries its own clips (see MOUNTING in the README).')
  }
  return notes
}

function settingOutNotes(
  model: Pick<SettingOut, 'modeX' | 'modeY' | 'centreLines' | 'point'>,
  joint: number,
  rowOffset: RowOffset,
  exact: boolean,
  first: PlanTile | null,
  system: FixingSystem,
  unlocked: readonly string[],
): string[] {
  const tabs = usesTabs(system)
  // A tabbed wall is glued in every other respect, so it keeps the glued setting-out; its order is the tabs'
  // own, strictly left to right, which is why the glued fitting order is left out for it.
  const notes = system === 'glue' || system === 'tabs' ? gluedNotes(model, joint, rowOffset, exact, first, !tabs) : fixedNotes(model, joint, rowOffset, system)
  if (tabs) {
    notes.push(
      `Set each row from left to right${exact ? '' : ', fitting the cut pieces as you reach them'}: each tile's socket ` +
        'goes over the tab of the tile already up. Nothing is set out for the tabs.',
    )
    if (unlocked.length > 0) {
      const one = unlocked.length === 1
      notes.push(
        `${one ? `Piece ${unlocked[0]} has` : `Pieces ${listText(unlocked)} have`} no room for a socket, so no tab locks ` +
          `${one ? 'it' : 'them'}: glue ${one ? 'it' : 'them'} to the tiles beside ${one ? 'it' : 'them'}.`,
      )
    }
  }
  return notes
}

/** Where a glued wall is set out from, and, unless the lock sets its own, the order it goes up in. */
function gluedNotes(
  model: Pick<SettingOut, 'modeX' | 'modeY' | 'centreLines' | 'point'>,
  joint: number,
  rowOffset: RowOffset,
  exact: boolean,
  first: PlanTile | null,
  order: boolean,
): string[] {
  const notes: string[] = []
  const { modeX, modeY, centreLines, point } = model
  if (modeX === 'edge' && modeY === 'edge') {
    if (point.y > EPS) {
      // The grid is anchored at the top, so the bottom row is cut and the set-out point sits above it.
      notes.push(
        `Measure ${formatLength(point.y)} up from the bottom edge at the left and draw a level line: the first full-height row sits on it.`,
      )
      notes.push('Lay the tiles up and to the right from that line; the strip below it is the bottom cut.')
    } else if (first && !first.cut) {
      notes.push('Set out from the bottom-left corner: the first whole tile sits in the corner.')
    } else {
      notes.push(`Set out from the bottom-left corner: piece ${first?.mark ?? 'A'} sits in the corner.`)
    }
  } else {
    if (centreLines.x !== null) {
      notes.push(`Snap a vertical line at ${formatLength(centreLines.x)} from the left edge and ${onLine(modeX, joint)}.`)
    } else {
      notes.push('Start the first column against the left edge.')
    }
    if (centreLines.y !== null) {
      notes.push(`Snap a level line at ${formatLength(centreLines.y)} from the bottom and ${onLine(modeY, joint)}.`)
    } else {
      notes.push('Start the first row on the bottom edge.')
    }
  }
  if (rowOffset !== 0) notes.push(bondNote(rowOffset))
  // An exact fit has no cuts to leave for last, and a row that starts on a cut cannot leave them.
  if (!order || exact) return notes
  if (first && !first.cut) notes.push('Fix the full tiles first, then the cuts at the edges.')
  else notes.push('Lay each row from its first piece, fitting the cut pieces as you reach them.')
  return notes
}

export function buildPlanModel(config: DesignConfig, plan: LayoutPlan): PlanModel {
  const W = config.surface.width
  const H = config.surface.height
  const { joint } = config
  const byId = new Map(plan.pieces.map((p) => [p.id, p]))

  const tiles: PlanTile[] = plan.placements.map((pl) => {
    const piece = byId.get(pl.pieceId)
    if (!piece) throw new Error(`Placement refers to unknown piece "${pl.pieceId}"`)
    return {
      pieceId: piece.id,
      mark: piece.mark,
      kind: piece.kind,
      label: piece.label,
      x: pl.x,
      y: pl.y,
      w: piece.width,
      h: piece.height,
      row: pl.row,
      col: pl.col,
      cut: piece.kind !== 'full',
      edges: piece.edges,
    }
  })

  const rowsByIndex = new Map<number, PlanTile[]>()
  for (const t of tiles) {
    const list = rowsByIndex.get(t.row)
    if (list) list.push(t)
    else rowsByIndex.set(t.row, [t])
  }
  const rowIndexes = [...rowsByIndex.keys()].sort((a, b) => a - b)

  // A running bond repeats every `cycle` rows, so that many bottom chains describe every column line.
  const cycle = rowShiftCycle(config.layout.rowOffset)
  const columns = rowIndexes.slice(0, cycle).map((rowIndex, i) =>
    buildChain(
      'x',
      `Row ${i + 1}`,
      W,
      config.tile.width,
      joint,
      (rowsByIndex.get(rowIndex) ?? []).map((t) => ({ start: t.x, length: t.w, mark: t.mark, pieceId: t.pieceId })),
    ),
  )
  const rows = buildChain(
    'y',
    'Rows',
    H,
    config.tile.height,
    joint,
    rowIndexes.map((rowIndex) => {
      const first = (rowsByIndex.get(rowIndex) ?? [])[0]
      return { start: first.y, length: first.h, mark: first.mark, pieceId: first.pieceId }
    }),
  )

  let modeX = axisMode(W, config.tile.width, joint, config.layout.origin)
  const modeY = axisMode(H, config.tile.height, joint, config.layout.origin)
  // Surface y runs upward and the corner grid is anchored at its end, as in computeLayout.
  const pointY = axisPoint(H, config.tile.height, joint, modeY, config.layout.origin, 'end')
  let lineX = round2(W / 2)
  if (modeX !== 'edge' && cycle > 1) {
    const bond = bondLineX(tiles, W / 2, pointY, config.tile.width, joint)
    if (bond) {
      modeX = bond.mode
      lineX = bond.line
    }
  }
  const centreLines = {
    x: modeX === 'edge' ? null : lineX,
    y: modeY === 'edge' ? null : round2(H / 2),
  }
  const point = {
    x:
      modeX === 'edge'
        ? axisPoint(W, config.tile.width, joint, modeX, config.layout.origin, 'start')
        : round2(modeX === 'tile-centred' ? lineX - config.tile.width / 2 : lineX + joint / 2),
    y: pointY,
  }
  const join = joinPlan(config, plan)
  const tab = tabPlan(config, plan)
  // A glued design never asks where clips would go.
  const mount = config.mount === 'clips' ? mountPlan(config, plan) : null
  const system = fixingSystem(config, mount ?? { clips: 0 }, join, tab)
  const settingOut: SettingOut = {
    origin: config.layout.origin,
    point,
    centreLines,
    modeX,
    modeY,
    notes: settingOutNotes(
      { modeX, modeY, centreLines, point },
      joint,
      config.layout.rowOffset,
      plan.exact,
      tileAtPoint(tiles, point),
      // What the plans really place, as the guide reads it: keys asked for on a plate too thin are glue.
      system,
      plan.pieces.filter((p) => tab.unlockedPieceIds.includes(p.id)).map((p) => p.mark),
    ),
  }

  return {
    width: W,
    height: H,
    joint,
    tile: { width: config.tile.width, height: config.tile.height },
    tiles,
    chains: { columns, rows },
    overall: { width: W, height: H },
    settingOut,
    legend: plan.pieces.map((p) => ({
      mark: p.mark,
      pieceId: p.id,
      kind: p.kind,
      label: p.label,
      width: p.width,
      height: p.height,
      count: p.count,
      edges: p.edges,
    })),
    basePieceId: basePiece(plan.pieces)?.id ?? null,
    fullCount: plan.fullCount,
    cutCount: plan.partialCount,
    exact: plan.exact,
    ...fixingsOf(config, plan, join, mount, tab),
  }
}

/** The clips, keys, tabs and printed parts a design adds to its plan: all empty for a plain glued wall. */
function fixingsOf(
  config: DesignConfig,
  plan: LayoutPlan,
  joins: JoinPlan,
  mount: MountPlan | null,
  tab: TabPlan,
): Pick<PlanModel, 'clips' | 'unclippedPieceIds' | 'keys' | 'unkeyedSeams' | 'unkeyedPieceIds' | 'locks' | 'unlockedPieceIds' | 'accessories'> {
  const clips = mount?.sites ?? []
  return {
    clips,
    // With no clip placed the wall is glued, so no piece is "without" one.
    unclippedPieceIds: clips.length > 0 ? (mount?.unmountedPieceIds ?? []) : [],
    keys: joins.sites,
    unkeyedSeams: joins.unkeyedSeams,
    unkeyedPieceIds: joins.unkeyedPieceIds,
    locks: tab.joints,
    // With no tab placed nothing claimed to lock, so no piece is "unlocked".
    unlockedPieceIds: tab.tabs > 0 ? tab.unlockedPieceIds : [],
    accessories: wallParts(config, plan).map((a) => ({
      id: a.id,
      mark: a.mark,
      kind: a.kind,
      label: a.label,
      group: a.group,
      count: a.count,
      size: a.size,
    })),
  }
}

/** Dimension text in mm without the unit (the sheet states "dimensions in mm"). */
export const dimText = (mm: number): string => formatNumber(mm, 1)

/**
 * Labels for a chain, thinned for the drawing scale. A label fits when its span (surface mm) holds
 * its text (`charWidthMm` per character, converted to surface mm) plus `paddingMm` of air; with
 * charWidthMm = 0, paddingMm is simply the minimum span. Every piece gets its own label when they
 * all fit; otherwise runs of equal full tiles collapse into "n × size" and only cuts keep their own.
 */
export function chainLabels(chain: DimensionChain, paddingMm: number, charWidthMm = 0): ChainLabel[] {
  const pieces = chain.items.filter((i) => i.kind === 'tile' || i.kind === 'cut')
  const needed = (text: string) => paddingMm + text.length * charWidthMm
  const single = (i: ChainItem): ChainLabel => {
    const text = dimText(i.length)
    return {
      start: i.start,
      end: i.end,
      center: (i.start + i.end) / 2,
      text,
      cut: i.kind === 'cut',
      grouped: false,
      fits: i.length >= needed(text),
    }
  }
  const singles = pieces.map(single)
  if (singles.every((l) => l.fits)) return singles

  const labels: ChainLabel[] = []
  let run: ChainItem[] = []
  const flush = () => {
    if (run.length === 1) labels.push(single(run[0]))
    else if (run.length > 1) {
      const start = run[0].start
      const end = run[run.length - 1].end
      const text = `${run.length} × ${dimText(run[0].length)}`
      labels.push({ start, end, center: (start + end) / 2, text, cut: false, grouped: true, fits: end - start >= needed(text) })
    }
    run = []
  }
  for (const item of pieces) {
    const sameAsRun = run.length > 0 && item.kind === 'tile' && Math.abs(item.length - run[0].length) < EPS
    if (item.kind === 'tile' && (run.length === 0 || sameAsRun)) {
      run.push(item)
      continue
    }
    flush()
    if (item.kind === 'tile') run.push(item)
    else labels.push(single(item))
  }
  flush()
  return labels
}
