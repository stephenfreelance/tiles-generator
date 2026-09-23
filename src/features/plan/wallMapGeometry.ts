// The studio's wall map as plain geometry in CSS px: pure and DOM-free, so the layout rules are
// unit-tested and the renderer only paints boxes.
import { borderSides } from '@/core/layout'
import { tileCutSides, type ChainItem, type PlanMarkRow, type PlanModel, type PlanTile, type WallSide } from '@/core/plan/planModel'
import { SIDE_NAMES } from '@/core/sides'
import { formatLength, formatNumber } from '@/core/units'

export const CHIP_PX = 24
export const CHIP_GAP_PX = 6
export const STACK_GAP_PX = 4
export const MIN_STRIP_PX = 12
export const BOND_MIN_END_PX = 8
export const ROW_CHIP_MIN_PITCH_PX = 28
export const LINE_OVERRUN_PX = 4

/** A band holds one line of 24 px chips with 6 px of air on either side. */
const LINE_PX = CHIP_PX + 2 * CHIP_GAP_PX
/** Below this width the map says nothing a maker could read. */
const MIN_WIDTH_PX = 160
/** Two lengths closer than this are the same length (mm), as in layout.ts. */
const EPS = 0.01
const DOT_RING_PX = 7.5
const PILL_W = 46
const PILL_H = 22
const LABEL_H = 16
/** The corner start dot sits on the wall's left edge, so the left chips keep clear of its ring. */
const DOT_CLEARANCE_PX = 10
/** The start dimension stands this far out from the chips (or the wall), clear of the dot's 7.5 px ring. */
const DIM_OFFSET_PX = 16
/** Room between the dimension and the right edge of its lettering. */
const DIM_LABEL_GAP_PX = 10
/** An arrowhead's length and half its spread. */
const ARROW_PX = 4
const ARROW_HALF_PX = 3
/** A span shorter than this has no room for its arrowheads, which then point in from outside. */
const DIM_INSIDE_MIN_PX = 20
/** How far an outside arrowhead's stem reaches past the line it points at. */
const ARROW_STEM_PX = 9
/** Half the lane kept free of chips along each centre line, beyond the wall. */
const LINE_CLEARANCE_PX = 4
/** Room between a stacked side column and the wall for the leaders that tie each chip to its row. */
export const LEADER_LANE_PX = 20
const MAX_PASSES = 8
/** A clip mark is drawn at the clip's own length, kept between these lengths in px so it never blots or vanishes. */
export const CLIP_MARK_MIN_PX = 6
export const CLIP_MARK_MAX_PX = 14
/** Length of a wall clip along its catch, mm, and how thick its mark is against that length. */
const CLIP_LENGTH_MM = 48
const CLIP_MARK_ASPECT = 0.34
/** A key mark is drawn larger than the key (16 mm would be a speck), within these lengths in px. */
export const KEY_MARK_MIN_PX = 4
export const KEY_MARK_MAX_PX = 8
const KEY_MARK_SCALE = 1.6
/** Length across the joint of the key the marks stand for, mm (two 8 mm reaches). */
const KEY_LENGTH_MM = 16

type Side = WallSide

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface MapTile {
  pieceId: string
  mark: string
  cut: boolean
  x: number
  y: number
  width: number
  height: number
}

export interface MapChip {
  pieceId: string
  mark: string
  cut: boolean
  size: string | null
  box: Box
  leader: Segment | null
}

export interface MapLabel {
  text: string
  /** Anchor point; `y` is the vertical centre of the text. */
  x: number
  y: number
  anchor: 'end' | 'middle'
  strong: boolean
  box: Box
}

/** How far up the level line is: a vertical dimension from the wall's foot, its arrowheads in one path. */
export interface MapDimension {
  path: string
  box: Box
}

export interface MapStart {
  /**
   * What the marker is called: "Start", or "SO" once wall clips are placed, since a clipped wall goes up
   * from its own start line along the bottom edge, and the setting-out plan calls this point SO.
   */
  word: 'Start' | 'SO'
  dot: { x: number; y: number }
  lines: Segment[]
  dimension: MapDimension | null
  /** Extension lines carrying the level line and the wall's foot out to the dimension. */
  guides: Segment[]
  labels: MapLabel[]
  pill: Box | null
  pillLeader: Segment | null
}

/** A wall clip at the centre of its pocket. `upright` for a clip turned a quarter turn on a narrow piece. */
export interface MapClip {
  x: number
  y: number
  upright: boolean
}

/** A key across a joint, at its centre. `upright` for a key across a row joint (its length runs up the wall). */
export interface MapKey {
  x: number
  y: number
  upright: boolean
}

export interface WallMapGeometry {
  width: number
  height: number
  wall: Box
  tiles: MapTile[]
  chips: MapChip[]
  start: MapStart
  widened: boolean
  clips: MapClip[]
  /** Length of a clip mark, px. */
  clipPx: number
  keys: MapKey[]
  /** Length of a key mark, px. */
  keyPx: number
}

export interface AxisMap {
  at(mm: number): number
  widened: boolean
}

/**
 * Everything the map's layout depends on, as one string. A recolour rebuilds the plan model without
 * moving a tile, and this is how the map knows it has nothing to redraw. The pieces are part of it:
 * keys or a border profile split the same tiles into more models without moving any of them.
 */
export function planLayoutKey(model: PlanModel): string {
  const chain = (items: ChainItem[]) => items.map((i) => `${i.kind[0]}${i.length}`).join(',')
  return [
    model.width,
    model.height,
    model.joint,
    model.tile.width,
    model.tile.height,
    model.settingOut.origin,
    model.tiles.length,
    ...model.chains.columns.map((c) => chain(c.items)),
    chain(model.chains.rows.items),
    model.legend.map((row) => `${row.mark}=${row.pieceId}`).join(','),
    // Clips and keys are drawn too: turning either on changes the map without moving a tile.
    model.clips.length,
    model.clips.reduce((sum, c) => sum + c.x * 3 + c.y + (c.axis === 'v' ? 7 : 0), 0),
    model.keys.length,
    model.keys.reduce((sum, k) => sum + k.x * 3 + k.y, 0),
  ].join('|')
}

/** Half a clip mark's thickness across its length: the radius its rounded ends are drawn at. */
const clipMarkHalf = (length: number) => Math.max(1.25, (CLIP_MARK_ASPECT * length) / 2)

/** A key mark's width across its joint, as a share of its length. */
const KEY_MARK_WIDTH = 0.625

/** The box a clip mark covers, so the drawing can keep its lettering off it. */
export function clipMarkBox(clip: MapClip, length: number): Box {
  const [hw, hh] = clip.upright ? [clipMarkHalf(length), length / 2] : [length / 2, clipMarkHalf(length)]
  return { x: clip.x - hw, y: clip.y - hh, width: 2 * hw, height: 2 * hh }
}

/** The box a key mark covers. */
export function keyMarkBox(key: MapKey, length: number): Box {
  const across = (KEY_MARK_WIDTH * length) / 2
  const [hw, hh] = key.upright ? [across, length / 2] : [length / 2, across]
  return { x: key.x - hw, y: key.y - hh, width: 2 * hw, height: 2 * hh }
}

/**
 * One clip mark as path data: a small rounded bar of `length` px centred on the pocket, lying along the
 * wall, or up it for a turned clip. A bar, not a dog-bone, so a clip never reads as a key.
 */
export function clipMarkPath(clip: MapClip, length: number): string {
  const f = (v: number) => Math.round(v * 100) / 100
  const half = length / 2
  const r = clipMarkHalf(length)
  if (clip.upright) {
    const x0 = clip.x - r
    const x1 = clip.x + r
    const y0 = clip.y - half + r
    const y1 = clip.y + half - r
    return `M${f(x0)} ${f(y0)}A${f(r)} ${f(r)} 0 0 1 ${f(x1)} ${f(y0)}V${f(y1)}A${f(r)} ${f(r)} 0 0 1 ${f(x0)} ${f(y1)}Z`
  }
  const x0 = clip.x - half + r
  const x1 = clip.x + half - r
  const y0 = clip.y - r
  const y1 = clip.y + r
  return `M${f(x0)} ${f(y0)}H${f(x1)}A${f(r)} ${f(r)} 0 0 1 ${f(x1)} ${f(y1)}H${f(x0)}A${f(r)} ${f(r)} 0 0 1 ${f(x0)} ${f(y0)}Z`
}

/**
 * One key mark as path data: a small dog-bone of `length` px centred on the key, its heads across the
 * joint. Drawn larger than life, so a wall of keys reads at a glance.
 */
export function keyMarkPath(key: MapKey, length: number): string {
  const head = 0.325 * length
  const neck = length - 2 * head
  const w = KEY_MARK_WIDTH * length
  const step = (w - 0.25 * length) / 2
  const f = (v: number) => Math.round(v * 100) / 100
  // Drawn along x, then turned for a key across a row joint by swapping the axes.
  const moves: [number, number][] = [
    [head, 0],
    [0, step],
    [neck, 0],
    [0, -step],
    [head, 0],
    [0, w],
    [-head, 0],
    [0, -step],
    [-neck, 0],
    [0, step],
    [-head, 0],
  ]
  const [x0, y0] = key.upright ? [key.x - w / 2, key.y - length / 2] : [key.x - length / 2, key.y - w / 2]
  const rel = moves.map(([dx, dy]) => (key.upright ? `l${f(dy)} ${f(dx)}` : `l${f(dx)} ${f(dy)}`)).join('')
  return `M${f(x0)} ${f(y0)}${rel}z`
}

/**
 * Which wall edges each piece belongs to: a cut touches the edges of its cut axis, and a border
 * version (keys left out, or the border profile) the edges it sits on. A piece only near a profiled
 * edge, kept off it by a narrow cut, belongs to that edge when it has no other. The base whole tile,
 * and any piece no edge shapes, has none.
 */
export function pieceSides(model: PlanModel): Map<string, Set<Side>> {
  const sides = new Map<string, Set<Side>>()
  const setOf = (pieceId: string) => {
    let set = sides.get(pieceId)
    if (!set) {
      set = new Set()
      sides.set(pieceId, set)
    }
    return set
  }
  for (const t of model.tiles) {
    if (!t.cut) continue
    const set = setOf(t.pieceId)
    for (const side of tileCutSides(t, model)) set.add(side)
  }
  for (const row of model.legend) {
    if (row.pieceId === model.basePieceId) continue
    const { on, near } = borderSides(row.edges)
    const own = sides.get(row.pieceId)
    const border = on.length || own?.size ? on : near
    if (border.length === 0) continue
    const set = setOf(row.pieceId)
    for (const side of border) set.add(SIDE_NAMES[side])
  }
  return sides
}

/**
 * Piecewise-linear mm to px along one axis: a cut drawn thinner than `minPx` is held at `minPx` and
 * the rest share what is left, so the overall length stays exact.
 */
export function axisMap(items: ChainItem[], total: number, lengthPx: number, minPx: number): AxisMap {
  const linear: AxisMap = { at: (mm) => (total > 0 ? (mm / total) * lengthPx : 0), widened: false }
  const cutCount = items.filter((i) => i.kind === 'cut').length
  if (total <= 0 || cutCount === 0 || lengthPx < 2 * minPx * cutCount) return linear

  // Breakpoints come from the item ends, the last one pinned to the true total.
  const ends = items.map((item, i) => (i === items.length - 1 ? Math.max(total, item.end) : Math.min(item.end, total)))
  const starts = ends.map((_, i) => (i === 0 ? 0 : ends[i - 1]))
  const lengths = ends.map((end, i) => Math.max(0, end - starts[i]))
  const span = ends.at(-1) ?? total
  const fixed = new Array<boolean>(items.length).fill(false)
  let scale = lengthPx / span
  // Each round can only add fixed cuts, so this settles in at most cutCount rounds.
  for (let round = 0; round <= cutCount; round++) {
    let changed = false
    items.forEach((item, i) => {
      if (!fixed[i] && item.kind === 'cut' && lengths[i] * scale < minPx) {
        fixed[i] = true
        changed = true
      }
    })
    if (!changed) break
    const fixedMm = lengths.reduce((s, l, i) => (fixed[i] ? s + l : s), 0)
    const fixedCount = fixed.filter(Boolean).length
    if (span - fixedMm <= EPS) return linear
    scale = (lengthPx - fixedCount * minPx) / (span - fixedMm)
  }
  if (!fixed.some(Boolean)) return linear

  const pxStarts: number[] = []
  let cursor = 0
  lengths.forEach((l, i) => {
    pxStarts.push(cursor)
    cursor += fixed[i] ? minPx : l * scale
  })
  const at = (mm: number): number => {
    if (mm <= 0) return mm * scale
    if (mm >= span) return lengthPx + (mm - span) * scale
    let lo = 0
    let hi = items.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (ends[mid] < mm) lo = mid + 1
      else hi = mid
    }
    const segScale = fixed[lo] ? (lengths[lo] > 0 ? minPx / lengths[lo] : 0) : scale
    return pxStarts[lo] + (mm - starts[lo]) * segScale
  }
  return { at, widened: true }
}

/** Mark in a 10 px-per-letter cell, the size after it, 8 px of padding on either side. */
export function chipWidth(mark: string, size: string | null): number {
  return Math.max(CHIP_PX, 8 + 10 * mark.length + (size ? 5 + 7.5 * size.length : 0) + 8)
}

const labelWidth = (text: string, strong: boolean) => text.length * (strong ? 7.8 : 6.8)

const intersects = (a: Box, b: Box, tolerance = 0) =>
  a.x < b.x + b.width - tolerance &&
  b.x < a.x + a.width - tolerance &&
  a.y < b.y + b.height - tolerance &&
  b.y < a.y + a.height - tolerance

const grow = (b: Box, by: number): Box => ({ x: b.x - by, y: b.y - by, width: b.width + 2 * by, height: b.height + 2 * by })

const inside = (inner: Box, outer: Box) =>
  inner.x >= outer.x - EPS &&
  inner.y >= outer.y - EPS &&
  inner.x + inner.width <= outer.x + outer.width + EPS &&
  inner.y + inner.height <= outer.y + outer.height + EPS

/** A stroke as a box grown to `thickness`, for clearance checks. */
const segmentBox = (s: Segment, thickness: number): Box => ({
  x: Math.min(s.x1, s.x2) - thickness / 2,
  y: Math.min(s.y1, s.y2) - thickness / 2,
  width: Math.abs(s.x2 - s.x1) + thickness,
  height: Math.abs(s.y2 - s.y1) + thickness,
})

const centreOf = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })

/** From the chip's edge (not its centre) toward a target, so the leader starts where the chip ends. */
function leaderFrom(box: Box, target: { x: number; y: number }): Segment {
  const c = centreOf(box)
  const dx = target.x - c.x
  const dy = target.y - c.y
  const tx = dx === 0 ? Infinity : box.width / 2 / Math.abs(dx)
  const ty = dy === 0 ? Infinity : box.height / 2 / Math.abs(dy)
  const t = Math.min(tx, ty, 1)
  return { x1: c.x + dx * t, y1: c.y + dy * t, x2: target.x, y2: target.y }
}

interface CornerPiece {
  row: PlanMarkRow
  v: 'top' | 'bottom'
  h: 'left' | 'right'
}

/** How the legend splits between the map's regions: none of this depends on the drawing scale. */
interface Groups {
  full: PlanMarkRow | null
  edges: Record<Side, PlanMarkRow[]>
  corners: CornerPiece[]
  /** Cut-to-fit pieces touching opposite edges, or none: they are called out in the bottom band. */
  loose: PlanMarkRow[]
  tilesByPiece: Map<string, PlanTile[]>
}

function groupPieces(model: PlanModel): Groups {
  const sides = pieceSides(model)
  const groups: Groups = {
    // The base whole tile stands on the wall; its border versions join the band of their edge.
    full: model.legend.find((r) => r.pieceId === model.basePieceId) ?? null,
    edges: { top: [], right: [], bottom: [], left: [] },
    corners: [],
    loose: [],
    tilesByPiece: new Map(),
  }
  for (const t of model.tiles) {
    const list = groups.tilesByPiece.get(t.pieceId)
    if (list) list.push(t)
    else groups.tilesByPiece.set(t.pieceId, [t])
  }
  for (const row of model.legend) {
    if (row.pieceId === model.basePieceId) continue
    const set = sides.get(row.pieceId) ?? new Set<Side>()
    const opposite = (set.has('left') && set.has('right')) || (set.has('top') && set.has('bottom'))
    if (set.size === 0 || opposite) {
      groups.loose.push(row)
      continue
    }
    const v = set.has('top') ? 'top' : set.has('bottom') ? 'bottom' : null
    const h = set.has('left') ? 'left' : set.has('right') ? 'right' : null
    if (v && h) groups.corners.push({ row, v, h })
    else groups.edges[(v ?? h) as Side].push(row)
  }
  return groups
}

/** Decisions a fallback can force, carried into the next pass. */
interface PassPlan {
  topLines: number
  bottomLines: number
  leftCols: number
  rightCols: number
  wholeInTop: boolean
  pillInColumn: boolean
  /** A side whose chips are stacked, so each needs a leader to the row it names. */
  leftLane: boolean
  rightLane: boolean
  /** A side whose marks cannot stand beside the wall, so they are called out in the bottom band. */
  leftInBand: boolean
  rightInBand: boolean
}

const samePlan = (a: PassPlan, b: PassPlan) =>
  a.topLines === b.topLines &&
  a.bottomLines === b.bottomLines &&
  a.leftCols === b.leftCols &&
  a.rightCols === b.rightCols &&
  a.wholeInTop === b.wholeInTop &&
  a.pillInColumn === b.pillInColumn &&
  a.leftLane === b.leftLane &&
  a.rightLane === b.rightLane &&
  a.leftInBand === b.leftInBand &&
  a.rightInBand === b.rightInBand

interface BandChip {
  row: PlanMarkRow
  size: string | null
  width: number
  centre: number
  /** A chip that does not sit beside its own piece points at it. */
  leader: boolean
}

/** A chip joining a band it does not belong to, placed from `centre` (else its piece's middle). */
interface BandExtra {
  row: PlanMarkRow
  size: string | null
  leader: boolean
  centre?: number
}

/**
 * One band of chips along the top or bottom: swept left to right with overlaps pushed right, the
 * row shifted back left when it overruns, and dealt across `lines` when one line cannot hold it.
 */
function sweepBand(
  chips: BandChip[],
  lines: number,
  lineCentre: (line: number) => number,
  leftLimit: number,
  rightLimit: number,
  obstacles: Box[],
): { lines: Box[][]; ok: boolean } {
  const sorted = [...chips].sort((a, b) => a.centre - b.centre)
  const out: Box[][] = []
  let ok = true
  for (let line = 0; line < lines; line++) {
    const members = sorted.filter((_, i) => i % lines === line)
    const y = lineCentre(line) - CHIP_PX / 2
    const placed: Box[] = []
    for (const chip of members) {
      const box: Box = { x: Math.max(leftLimit, chip.centre - chip.width / 2), y, width: chip.width, height: CHIP_PX }
      const prev = placed.at(-1)
      if (prev) box.x = Math.max(box.x, prev.x + prev.width + STACK_GAP_PX)
      for (let guard = 0; guard < obstacles.length + 1; guard++) {
        const hit = obstacles.find((o) => intersects(box, o))
        if (!hit) break
        box.x = hit.x + hit.width + STACK_GAP_PX
      }
      placed.push(box)
    }
    for (let i = placed.length - 1; i >= 0; i--) {
      const limit = i === placed.length - 1 ? rightLimit : placed[i + 1].x - STACK_GAP_PX
      const box = placed[i]
      if (box.x + box.width <= limit + EPS) continue
      box.x = limit - box.width
      for (let guard = 0; guard < obstacles.length + 1; guard++) {
        const hit = obstacles.find((o) => intersects(box, o))
        if (!hit) break
        box.x = hit.x - STACK_GAP_PX - box.width
      }
    }
    if (placed.length > 0 && placed[0].x < leftLimit - EPS) ok = false
    if (placed.some((b) => obstacles.some((o) => intersects(b, o)))) ok = false
    out.push(placed)
  }
  return { lines: out, ok }
}

interface PassResult {
  geometry: WallMapGeometry | null
  next: PassPlan
}

function runPass(model: PlanModel, groups: Groups, width: number, maxWallHeight: number, plan: PassPlan): PassResult {
  const next: PassPlan = { ...plan }
  const W = model.width
  const H = model.height
  const so = model.settingOut
  const corner = so.modeX === 'edge'
  const bond = model.chains.columns.length > 1

  // A lone cut on a side says its size; a whole border version has nothing cut to say.
  const edgeSize = (side: Side, row: PlanMarkRow) =>
    row.kind !== 'full' && groups.edges[side].filter((r) => r.kind !== 'full').length === 1
      ? formatNumber(side === 'top' || side === 'bottom' ? row.height : row.width, 1)
      : null

  const inBand = (side: 'left' | 'right') => (side === 'left' ? plan.leftInBand : plan.rightInBand)
  // Side bands: the widest chip sets the column, stacked columns sit side by side.
  const sideWidest = (side: 'left' | 'right') => {
    const widths = [
      ...(inBand(side) ? [] : groups.edges[side].map((r) => chipWidth(r.mark, edgeSize(side, r)))),
      ...groups.corners.filter((c) => c.h === side).map((c) => chipWidth(c.row.mark, null)),
    ]
    return widths.length ? Math.max(...widths) : 0
  }
  const leftWidest = sideWidest('left')
  const rightWidest = sideWidest('right')
  const content = (widest: number, cols: number) => cols * widest + (cols - 1) * STACK_GAP_PX
  const leftInner = (corner ? DOT_CLEARANCE_PX : CHIP_GAP_PX) + (plan.leftLane && !plan.leftInBand ? LEADER_LANE_PX : 0)
  const rightInner = CHIP_GAP_PX + (plan.rightLane && !plan.rightInBand ? LEADER_LANE_PX : 0)
  const leftBand = leftWidest ? CHIP_GAP_PX + content(leftWidest, plan.leftCols) + leftInner : 0
  const rightBand = rightWidest ? rightInner + content(rightWidest, plan.rightCols) + CHIP_GAP_PX : 0
  const top = plan.topLines ? plan.topLines * LINE_PX : 8
  const bottom = plan.bottomLines ? plan.bottomLines * LINE_PX : 12

  // On clips "Start" would read as the start line the clipped wall goes up from, the bottom edge, not this point.
  const word: MapStart['word'] = model.clips.length > 0 ? 'SO' : 'Start'
  const startText = formatLength(so.point.y)
  let startCol: number
  if (corner && so.point.y > EPS) {
    // The measurement can outgrow 64 px ("137.5 mm"), so the column widens to hold it.
    const labelW = Math.max(labelWidth(word, false), labelWidth(startText, true))
    startCol = Math.max(64, Math.ceil(DIM_OFFSET_PX + DIM_LABEL_GAP_PX + labelW + 2))
  } else if (corner) startCol = 48
  else startCol = plan.pillInColumn ? 56 : 8

  const left = startCol + leftBand
  const right = rightBand || 8
  const availW = width - left - right
  if (availW <= 0 || W <= 0 || H <= 0) return { geometry: null, next }
  const scale = Math.min(availW / W, maxWallHeight / H)
  const wallW = W * scale
  const wallH = H * scale
  const wall: Box = { x: (width - (left + wallW + right)) / 2 + left, y: top, width: wallW, height: wallH }
  const foot = wall.y + wallH
  let height = top + wallH + bottom
  const assembly = { left: wall.x - left, right: wall.x + wallW + right }

  const Y = axisMap(model.chains.rows.items, H, wallH, MIN_STRIP_PX)
  const X = bond ? axisMap([], W, wallW, 0) : axisMap(model.chains.columns[0]?.items ?? [], W, wallW, MIN_STRIP_PX)
  let widened = X.widened || Y.widened
  const px = (mmX: number) => wall.x + X.at(mmX)
  const py = (mmY: number) => wall.y + wallH - Y.at(mmY)

  const tiles: MapTile[] = model.tiles.map((t) => {
    let x0 = px(t.x)
    let x1 = px(t.x + t.w)
    // Running-bond row ends cannot share one axis map, so a hairline end is overdrawn inward.
    if (bond && t.cut && t.w < model.tile.width - EPS && x1 - x0 < BOND_MIN_END_PX) {
      if (t.x <= EPS) x1 = x0 + BOND_MIN_END_PX
      else x0 = x1 - BOND_MIN_END_PX
      widened = true
    }
    const y0 = py(t.y + t.h)
    const y1 = py(t.y)
    return { pieceId: t.pieceId, mark: t.mark, cut: t.cut, x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
  })
  const tileBoxes = new Map<string, MapTile[]>()
  for (const t of tiles) {
    const list = tileBoxes.get(t.pieceId)
    if (list) list.push(t)
    else tileBoxes.set(t.pieceId, [t])
  }

  // Clips: a bar on each pocket, at the clip's own length where the drawing allows, never lost or blotted.
  const scaleX = W > 0 ? wallW / W : 0
  const clipPx = Math.min(CLIP_MARK_MAX_PX, Math.max(CLIP_MARK_MIN_PX, CLIP_LENGTH_MM * scaleX))
  const clips: MapClip[] = model.clips.map((c) => ({ x: px(c.x), y: py(c.y), upright: c.axis === 'v' }))

  // Keys: a mark on each, scaled with the drawing but never lost or blotted.
  const keyPx = Math.min(KEY_MARK_MAX_PX, Math.max(KEY_MARK_MIN_PX, KEY_MARK_SCALE * KEY_LENGTH_MM * scaleX))
  const keys: MapKey[] = model.keys.map((k) => ({ x: px(k.x), y: py(k.y), upright: k.seam === 'horizontal' }))
  // Drawn before the start marker, because the marker's tag has to find a spot that covers none of them.
  const markBoxes: Box[] = [...clips.map((c) => clipMarkBox(c, clipPx)), ...keys.map((k) => keyMarkBox(k, keyPx))]

  // The start marker, in ink.
  const labels: MapLabel[] = []
  const lines: Segment[] = []
  const guides: Segment[] = []
  let dimension: MapDimension | null = null
  let pill: Box | null = null
  let pillLeader: Segment | null = null
  let dot: { x: number; y: number }
  const label = (text: string, x: number, y: number, anchor: 'end' | 'middle', strong: boolean): MapLabel => {
    const w = labelWidth(text, strong)
    const bx = anchor === 'end' ? x - w : x - w / 2
    return { text, x, y, anchor, strong, box: { x: bx, y: y - LABEL_H / 2, width: w, height: LABEL_H } }
  }
  if (corner) {
    if (so.point.y > EPS) {
      const y = py(so.point.y)
      const dx = wall.x - leftBand - DIM_OFFSET_PX
      lines.push({ x1: wall.x - LINE_OVERRUN_PX, y1: y, x2: wall.x + wallW + LINE_OVERRUN_PX, y2: y })
      // A dimension from the wall's foot up to the level line, drawn the way a tape measure is read.
      const inward = foot - y >= DIM_INSIDE_MIN_PX
      const head = (tipY: number, open: 1 | -1) =>
        `M${dx - ARROW_HALF_PX} ${tipY + open * ARROW_PX} L${dx} ${tipY} L${dx + ARROW_HALF_PX} ${tipY + open * ARROW_PX}`
      const stemTop = inward ? y : y - ARROW_STEM_PX
      const stemBottom = inward ? foot : foot + ARROW_STEM_PX
      dimension = {
        path: `M${dx} ${stemTop} V${stemBottom} ${head(y, inward ? 1 : -1)} ${head(foot, inward ? -1 : 1)}`,
        box: { x: dx - ARROW_HALF_PX - 1, y: stemTop - 1, width: 2 * ARROW_HALF_PX + 2, height: stemBottom - stemTop + 2 },
      }
      guides.push(
        { x1: dx - ARROW_HALF_PX - 1, y1: y, x2: wall.x - LINE_OVERRUN_PX, y2: y },
        { x1: dx - ARROW_HALF_PX - 1, y1: foot, x2: wall.x - 2, y2: foot },
      )
      // The measurement sits beside the span it names, the word above it on the level line.
      const lx = dx - DIM_LABEL_GAP_PX
      let sizeY = (y + foot) / 2
      let startY = Math.min(y - 9, sizeY - LABEL_H)
      if (startY < LABEL_H / 2) {
        startY = LABEL_H / 2
        sizeY = Math.max(sizeY, startY + LABEL_H)
      }
      labels.push(label(word, lx, startY, 'end', false), label(startText, lx, sizeY, 'end', true))
      dot = { x: wall.x, y }
    } else {
      dot = { x: wall.x, y: foot }
      labels.push(label(word, wall.x - leftBand - 8, Math.max(LABEL_H / 2, dot.y - 9), 'end', false))
    }
    // Lettering pushed below the wall's foot takes the drawing down with it.
    for (const box of [...labels.map((l) => l.box), ...(dimension ? [dimension.box] : [])]) height = Math.max(height, box.y + box.height)
  } else {
    const cx = px(so.centreLines.x ?? so.point.x)
    const cy = py(so.centreLines.y ?? so.point.y)
    dot = { x: cx, y: cy }
    const level: Segment = { x1: wall.x - LINE_OVERRUN_PX, y1: cy, x2: wall.x + wallW + LINE_OVERRUN_PX, y2: cy }
    const upright: Segment = { x1: cx, y1: wall.y - LINE_OVERRUN_PX, x2: cx, y2: wall.y + wallH + LINE_OVERRUN_PX }
    lines.push(level, upright)
    if (plan.pillInColumn) {
      pill = { x: wall.x - leftBand - 52, y: cy - PILL_H / 2, width: PILL_W, height: PILL_H }
      pillLeader = { x1: pill.x + PILL_W, y1: cy, x2: cx, y2: cy }
    } else {
      const tries: Box[] = [
        { x: cx + 8, y: cy - 8 - PILL_H, width: PILL_W, height: PILL_H },
        { x: cx - 8 - PILL_W, y: cy - 8 - PILL_H, width: PILL_W, height: PILL_H },
        { x: cx + 8, y: cy + 8, width: PILL_W, height: PILL_H },
        { x: cx - 8 - PILL_W, y: cy + 8, width: PILL_W, height: PILL_H },
      ]
      const lineBoxes = [segmentBox(level, 4), segmentBox(upright, 4)]
      // The tag hides whatever it lands on, so it takes the first corner clear of the centre lines and of
      // every clip and key mark. With no corner clear, the next pass stands it in the side column instead.
      pill =
        tries.find((b) => {
          const clear = grow(b, 2)
          return inside(b, wall) && !lineBoxes.some((l) => intersects(b, l)) && !markBoxes.some((m) => intersects(clear, m))
        }) ?? null
      if (!pill) next.pillInColumn = true
    }
  }
  const dotBox: Box = { x: dot.x - DOT_RING_PX, y: dot.y - DOT_RING_PX, width: 2 * DOT_RING_PX, height: 2 * DOT_RING_PX }
  const lineBoxes = lines.map((l) => segmentBox(l, 4))
  const startObstacles: Box[] = [...labels.map((l) => l.box), dotBox, ...lineBoxes]
  if (pill) startObstacles.push(pill)
  if (dimension) startObstacles.push(dimension.box, ...guides.map((g) => segmentBox(g, 2)))
  const outer: Box = { x: 0, y: 0, width, height }
  // Left chips and their leaders stay above the level line, clear of the lines out to the dimension.
  const leftFloor = dimension ? dot.y - LINE_CLEARANCE_PX - STACK_GAP_PX : foot
  // A chip on the line of a centre mark reads as that line's label, so the lines' reach is kept clear.
  const levelBand: Box = { x: 0, y: dot.y - LINE_CLEARANCE_PX, width, height: 2 * LINE_CLEARANCE_PX }
  const lineBands: Box[] = corner
    ? []
    : [levelBand, { x: dot.x - LINE_CLEARANCE_PX, y: 0, width: 2 * LINE_CLEARANCE_PX, height }]

  const chips: MapChip[] = []
  const chipBoxes: Box[] = []
  const addChip = (row: PlanMarkRow, size: string | null, box: Box, leader: Segment | null) => {
    chips.push({ pieceId: row.pieceId, mark: row.mark, cut: row.kind !== 'full', size, box, leader })
    chipBoxes.push(box)
  }
  const nearest = (pieceId: string, x: number, y: number) => {
    let best: MapTile | null = null
    let bestD = Infinity
    for (const t of tileBoxes.get(pieceId) ?? []) {
      const c = centreOf(t)
      const d = (c.x - x) ** 2 + (c.y - y) ** 2
      if (d < bestD) {
        bestD = d
        best = t
      }
    }
    return best
  }

  // Corner pieces sit where the two bands cross, on the band's first line.
  const bandContentCentre = (side: 'left' | 'right') =>
    side === 'left'
      ? wall.x - leftInner - content(leftWidest, plan.leftCols) / 2
      : wall.x + wallW + rightInner + content(rightWidest, plan.rightCols) / 2
  for (const c of groups.corners) {
    const w = chipWidth(c.row.mark, null)
    const cx = bandContentCentre(c.h)
    const cy = c.v === 'top' ? wall.y - LINE_PX / 2 : wall.y + wallH + LINE_PX / 2
    const box: Box = { x: cx - w / 2, y: cy - CHIP_PX / 2, width: w, height: CHIP_PX }
    // A narrow cut can put a second piece in a corner (the tile it keeps off both edges). The second
    // steps along the band toward the wall's middle, where the drawing has room, and points back.
    for (let guard = 0; guard < chipBoxes.length + 1; guard++) {
      const hit = chipBoxes.find((b) => intersects(box, b))
      if (!hit) break
      box.x = c.h === 'left' ? hit.x + hit.width + STACK_GAP_PX : hit.x - STACK_GAP_PX - w
    }
    const cornerX = c.h === 'left' ? wall.x : wall.x + wallW
    const cornerY = c.v === 'top' ? wall.y : wall.y + wallH
    const target = nearest(c.row.pieceId, cornerX, cornerY)
    addChip(c.row, null, box, target ? leaderFrom(box, centreOf(target)) : null)
  }

  // The whole tile: one chip inside the wall, clear of the start marker, or else in the top band.
  const topExtra: BandExtra[] = []
  if (groups.full && model.fullCount > 0) {
    const row = groups.full
    const w = chipWidth(row.mark, null)
    if (plan.wholeInTop) {
      topExtra.push({ row, size: null, leader: true, centre: wall.x + 12 + w / 2 })
    } else {
      const tx = wall.x + 0.3 * wallW
      const ty = wall.y + 0.35 * wallH
      const candidates = (tileBoxes.get(row.pieceId) ?? [])
        .map((t) => ({ c: centreOf(t), d: (centreOf(t).x - tx) ** 2 + (centreOf(t).y - ty) ** 2 }))
        .sort((a, b) => a.d - b.d)
      const found = candidates.find(({ c }) => {
        const box: Box = { x: c.x - w / 2, y: c.y - CHIP_PX / 2, width: w, height: CHIP_PX }
        const grown = grow(box, 4)
        return inside(grown, wall) && !startObstacles.some((o) => intersects(grown, o))
      })
      if (found) {
        addChip(row, null, { x: found.c.x - w / 2, y: found.c.y - CHIP_PX / 2, width: w, height: CHIP_PX }, null)
      } else {
        next.wholeInTop = true
        next.topLines = Math.max(1, plan.topLines)
      }
    }
  }

  // Top and bottom bands.
  const extentX = (pieceId: string, pick: (t: MapTile) => boolean) => {
    const boxes = (tileBoxes.get(pieceId) ?? []).filter(pick)
    const list = boxes.length ? boxes : (tileBoxes.get(pieceId) ?? [])
    if (!list.length) return wall.x + wallW / 2
    return (Math.min(...list.map((t) => t.x)) + Math.max(...list.map((t) => t.x + t.width))) / 2
  }
  const bandObstacles = () => [...startObstacles, ...lineBands, ...chipBoxes]
  const placeBand = (side: 'top' | 'bottom', extra: BandExtra[]) => {
    const rows = groups.edges[side]
    const bandChips: BandChip[] = [
      ...rows.map((row) => {
        const size = edgeSize(side, row)
        return { row, size, width: chipWidth(row.mark, size), centre: extentX(row.pieceId, () => true), leader: false }
      }),
      ...extra.map((e) => ({
        row: e.row,
        size: e.size,
        width: chipWidth(e.row.mark, e.size),
        centre: e.centre ?? extentX(e.row.pieceId, () => true),
        leader: e.leader,
      })),
    ]
    if (!bandChips.length) return
    const linesNow = side === 'top' ? plan.topLines : plan.bottomLines
    const lineCount = Math.max(1, linesNow)
    const lineCentre = (line: number) =>
      side === 'top' ? wall.y - LINE_PX / 2 - line * LINE_PX : wall.y + wallH + LINE_PX / 2 + line * LINE_PX
    const placed = sweepBand(
      bandChips,
      lineCount,
      lineCentre,
      // Under a start dimension the bands begin at the wall, so no leader runs back across it.
      dimension ? wall.x : Math.max(0, assembly.left),
      Math.min(width, assembly.right),
      bandObstacles(),
    )
    // A line that cannot hold its chips deals them across one more line on the next pass.
    const wanted = Math.min(bandChips.length, placed.ok ? lineCount : lineCount + 1)
    if (side === 'top') next.topLines = Math.max(next.topLines, wanted)
    else next.bottomLines = Math.max(next.bottomLines, wanted)
    const sorted = [...bandChips].sort((a, b) => a.centre - b.centre)
    placed.lines.forEach((boxes, line) => {
      const members = sorted.filter((_, i) => i % lineCount === line)
      boxes.forEach((box, i) => {
        const { row, size, leader } = members[i]
        const target = leader ? nearest(row.pieceId, box.x + box.width / 2, box.y + box.height / 2) : null
        addChip(row, size, box, target ? leaderFrom(box, centreOf(target)) : null)
      })
    })
  }
  const sidesInBand = (['left', 'right'] as const)
    .filter(inBand)
    .flatMap((side) => groups.edges[side].map((row) => ({ row, size: edgeSize(side, row), leader: true })))
  placeBand('top', topExtra)
  placeBand('bottom', [...groups.loose.map((row) => ({ row, size: null, leader: false })), ...sidesInBand])

  // Left and right bands.
  const placeSide = (side: 'left' | 'right') => {
    const rows = groups.edges[side]
    if (!rows.length || inBand(side)) return
    // Chips beside their rows keep to the wall's height. A stacked column may stand into the margin
    // past either end, short of a band chip there, but on the left it stays above the level line.
    const lo = wall.y
    const hi = foot
    const room = (lines: number, margin: number) => (lines ? CHIP_GAP_PX : margin) - STACK_GAP_PX
    const ceiling = wall.y - room(plan.topLines, top)
    const floor = side === 'left' && dimension ? leftFloor : foot + room(plan.bottomLines, bottom)
    const widest = side === 'left' ? leftWidest : rightWidest
    const cols = side === 'left' ? plan.leftCols : plan.rightCols
    const contentLeft = side === 'left' ? wall.x - leftInner - content(widest, cols) : wall.x + wallW + rightInner
    const colX = (col: number, w: number) => contentLeft + col * (widest + STACK_GAP_PX) + (widest - w) / 2
    const chipFor = (row: PlanMarkRow) => {
      const size = edgeSize(side, row)
      return { row, size, width: chipWidth(row.mark, size) }
    }
    const fits = (boxes: Box[]) =>
      boxes.every((b, i) => b.y >= lo - EPS && b.y + b.height <= hi + EPS && boxes.slice(0, i).every((o) => !intersects(b, o))) &&
      boxes.every((b) => ![...startObstacles, ...lineBands, ...chipBoxes].some((o) => intersects(b, o)))
    // A run of chips `h` tall starting at `y`, moved just above the level line's lane (or below it).
    const offLevel = (y: number, h: number) => {
      const lane = lineBands[0]
      if (!lane || y >= lane.y + lane.height || y + h <= lane.y) return y
      const above = lane.y - STACK_GAP_PX - h
      if (above >= lo - EPS) return above
      const below = lane.y + lane.height + STACK_GAP_PX
      return below + h <= hi + EPS ? below : y
    }

    // The strips each mark covers along this side: the row ends of a running bond, else every tile. A
    // whole border version always lies along its side, even one a narrow cut keeps off the row end.
    const edgeIds = new Set(rows.map((r) => r.pieceId))
    const endBoxes = tiles.filter((_, i) => {
      const t = model.tiles[i]
      return edgeIds.has(t.pieceId) && (!bond || !t.cut || (side === 'left' ? t.x <= EPS : t.x + t.w >= W - EPS))
    })

    // Per mark on a straight grid, per row end on a running bond: the chip points at its own strip.
    const attempt: { row: PlanMarkRow; size: string | null; box: Box; leader: Segment | null }[] = []
    if (!bond) {
      const sorted = rows
        .map((row) => {
          const list = tileBoxes.get(row.pieceId) ?? []
          const yc = list.length ? (Math.min(...list.map((t) => t.y)) + Math.max(...list.map((t) => t.y + t.height))) / 2 : wall.y + wallH / 2
          return { ...chipFor(row), yc }
        })
        .sort((a, b) => a.yc - b.yc)
      let cursor = lo
      for (const chip of sorted) {
        const y = Math.max(cursor, offLevel(Math.min(chip.yc - CHIP_PX / 2, hi - CHIP_PX), CHIP_PX))
        attempt.push({ row: chip.row, size: chip.size, box: { x: colX(0, chip.width), y, width: chip.width, height: CHIP_PX }, leader: null })
        cursor = y + CHIP_PX + STACK_GAP_PX
      }
    } else {
      if (endBoxes.every((t) => t.height >= ROW_CHIP_MIN_PITCH_PX)) {
        for (const t of endBoxes) {
          const row = rows.find((r) => r.pieceId === t.pieceId) as PlanMarkRow
          const chip = chipFor(row)
          const yc = t.y + t.height / 2
          attempt.push({
            row,
            size: chip.size,
            box: { x: colX(0, chip.width), y: yc - CHIP_PX / 2, width: chip.width, height: CHIP_PX },
            leader: null,
          })
        }
      }
    }
    // Every mark needs a chip: a row end two pieces share cannot hold both, so the side stacks.
    const covers = rows.every((row) => attempt.some((a) => a.row.pieceId === row.pieceId))
    let chosen = attempt.length && covers && fits(attempt.map((a) => a.box)) ? attempt : null

    if (!chosen) {
      // Stack: marks around the wall's middle, wrapping into columns when too tall. A stacked chip no
      // longer sits beside its own row, so a leader ties it to one: the rows are taken in the order
      // they are drawn, which keeps the leaders from crossing.
      const middle = (ceiling + floor) / 2
      const targetOf = new Map<string, MapTile>()
      for (const row of rows) {
        let best: MapTile | null = null
        for (const t of endBoxes) {
          if (t.pieceId !== row.pieceId) continue
          if (!best || Math.abs(centreOf(t).y - middle) < Math.abs(centreOf(best).y - middle)) best = t
        }
        if (best) targetOf.set(row.pieceId, best)
      }
      const order = [...rows].sort((a, b) => {
        const ta = targetOf.get(a.pieceId)
        const tb = targetOf.get(b.pieceId)
        return (ta ? centreOf(ta).y : middle) - (tb ? centreOf(tb).y : middle)
      })
      const capacity = Math.max(1, Math.floor((floor - ceiling + STACK_GAP_PX) / (CHIP_PX + STACK_GAP_PX)))
      const needed = Math.ceil(rows.length / capacity)
      if (needed > cols) {
        if (side === 'left') next.leftCols = needed
        else next.rightCols = needed
      }
      // Only a single column next to the wall can reach it without crossing another chip.
      if (Math.max(cols, needed) === 1) {
        if (side === 'left') next.leftLane = true
        else next.rightLane = true
      }
      const perCol = Math.ceil(rows.length / Math.max(cols, needed))
      const pitch = CHIP_PX + STACK_GAP_PX
      // Tops of a column of `n` chips: centred, moved off the level line, or split either side of it.
      const columnTops = (n: number): number[] => {
        const colH = n * pitch - STACK_GAP_PX
        const centred = (ceiling + floor) / 2 - colH / 2
        const y0 = offLevel(centred, colH)
        const lane = lineBands[0]
        const clear = !lane || y0 >= lane.y + lane.height || y0 + colH <= lane.y
        if (clear || n < 2) return Array.from({ length: n }, (_, k) => y0 + k * pitch)
        const nAbove = Math.ceil(n / 2)
        const top = lane.y - STACK_GAP_PX - (nAbove * pitch - STACK_GAP_PX)
        const below = lane.y + lane.height + STACK_GAP_PX
        const bottom = below + (n - nAbove) * pitch - STACK_GAP_PX
        if (top < ceiling - EPS || bottom > floor + EPS) return Array.from({ length: n }, (_, k) => centred + k * pitch)
        return Array.from({ length: n }, (_, k) => (k < nAbove ? top + k * pitch : below + (k - nAbove) * pitch))
      }
      const wallEdge = side === 'left' ? wall.x : wall.x + wallW
      chosen = order.map((row, i) => {
        const col = Math.min(cols - 1, Math.floor(i / perCol))
        const inCol = Math.min(perCol, rows.length - col * perCol)
        const chip = chipFor(row)
        const box: Box = { x: colX(col, chip.width), y: columnTops(inCol)[i - col * perCol], width: chip.width, height: CHIP_PX }
        const target = targetOf.get(row.pieceId)
        const reaches = cols === 1 && (side === 'left' ? plan.leftLane : plan.rightLane) && target
        const leader: Segment | null = reaches
          ? { x1: side === 'left' ? box.x + box.width : box.x, y1: box.y + CHIP_PX / 2, x2: wallEdge, y2: centreOf(target).y }
          : null
        return { row, size: chip.size, box, leader }
      })
      // A wall too short to stand a column beside runs it into the corner chips: call the side out below.
      if (chosen.some((c) => [...startObstacles, ...chipBoxes].some((o) => intersects(c.box, o)))) {
        if (side === 'left') next.leftInBand = true
        else next.rightInBand = true
      }
    }
    for (const c of chosen) addChip(c.row, c.size, c.box, c.leader)
  }
  placeSide('left')
  placeSide('right')

  const geometry: WallMapGeometry = {
    width,
    height,
    wall,
    tiles,
    chips,
    start: { word, dot, lines, dimension, guides, labels, pill, pillLeader },
    widened,
    clips,
    clipPx,
    keys,
    keyPx,
  }
  // Anything pushed out of the drawing is a layout the next pass has to make room for.
  if (!chips.every((c) => inside(c.box, outer))) {
    const escaped = chips.filter((c) => !inside(c.box, outer))
    if (escaped.some((c) => c.box.y < 0)) next.topLines = Math.max(1, next.topLines)
    if (escaped.some((c) => c.box.y + c.box.height > height)) next.bottomLines = Math.max(1, next.bottomLines)
  }
  return { geometry, next }
}

/** Lays out the wall map for a measured width. Null when the box is too narrow to draw in. */
export function layoutWallMap(model: PlanModel, opts: { width: number; maxWallHeight: number }): WallMapGeometry | null {
  const { width, maxWallHeight } = opts
  if (!(width >= MIN_WIDTH_PX) || model.tiles.length === 0) return null
  const groups = groupPieces(model)
  const cornerTouches = (side: Side) => groups.corners.some((c) => c.v === side || c.h === side)
  let plan: PassPlan = {
    topLines: groups.edges.top.length || cornerTouches('top') ? 1 : 0,
    bottomLines: groups.edges.bottom.length || cornerTouches('bottom') || groups.loose.length ? 1 : 0,
    leftCols: 1,
    rightCols: 1,
    wholeInTop: false,
    pillInColumn: false,
    leftLane: false,
    rightLane: false,
    leftInBand: false,
    rightInBand: false,
  }
  let result = runPass(model, groups, width, maxWallHeight, plan)
  for (let pass = 1; pass < MAX_PASSES; pass++) {
    let next = result.next
    // Stacked side columns that squeeze the wall out of the drawing give their chips to the bands.
    if (!result.geometry && (next.leftCols > 1 || next.rightCols > 1)) {
      next = {
        ...next,
        leftInBand: next.leftInBand || next.leftCols > 1,
        rightInBand: next.rightInBand || next.rightCols > 1,
        leftCols: 1,
        rightCols: 1,
      }
    }
    if (samePlan(next, plan)) break
    plan = next
    result = runPass(model, groups, width, maxWallHeight, plan)
  }
  return result.geometry
}
