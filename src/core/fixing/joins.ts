// Keys between tiles (docs/architecture.md, "Fixings"). A flat printed key, a square-shouldered dog-bone
// that makers call a bow-tie key, is pressed from the back into two notches that straddle an interior
// joint. Square shoulders, not a flared bow-tie: a key pressed in square to the wall gains nothing from a
// flare, which only lets the joint open by the clearance over the flank's sine. A notch depends only on
// its own piece (crop, size, edges) and the design, never on a neighbour or on the fit class: a key goes
// wherever both neighbours happen to carry the notch, an empty notch is harmless at the back, and a wrong
// fit costs a reprint of the keys, never of a tile.
// Pure maths: this runs in the geometry worker and in vitest's node environment.

import { LIMITS } from '../config'
import { perimeterDrop, shapingEdges } from '../geometry/profiles'
import { loftSolid } from '../geometry/prism'
import { rowShiftCycle } from '../layout'
import { partPrintNote } from '../printSettings'
import { hasSide, SIDE_NAMES, SIDES } from '../sides'
import type { DesignConfig, FitClass, LayoutPlan, MeshData, PieceEdges, PieceSpec, Placement, RowOffset, Side } from '../types'
import { formatLength, formatNumber, formatSize } from '../units'
import { fitClearance } from './accessories'
// KEY_RECESS and KEY_MOUTH live in capability.ts, which imports nothing of the fixings: tabs.ts derives its
// own depth stack from them at module scope, and this module sits inside an import cycle (through accessories
// and the tile mesher) where a constant of its own would still be in its dead zone when tabs.ts read it.
import { keyNotchDepth, keysPossible, KEY_MOUTH, KEY_RECESS } from './capability'
import type { AccessorySpec, BackFeature, JoinPlan, KeySite, Ring } from './types'

/** How far a notch reaches into each tile, mm: a neck slot, then the head. */
const REACH = 8
/** Length of the neck slot inside one tile, mm; the head takes the rest of the reach. */
const NECK = 3
/** Material kept between a notch and the end of its side, a corner or another notch, mm. */
const MARGIN = 3
/** Head width: 12 mm, narrowed on small tiles down to 8 mm, below which a tile takes no keys. */
const HEAD_MAX = 12
const HEAD_MIN = 8
/** 45° lead-in on the key's top face, printed last and pressed in first. */
const LEAD_IN = 0.3
/** Fillets: the head's corners, and the shoulders where the neck meets the head. */
const HEAD_FILLET = 1
const SHOULDER_FILLET = 0.8
/** Segments per fillet. Fixed, so every notch ring has the same vertex count and rings stay stable. */
const FILLET_SEGMENTS = 4
/** Spare keys printed on top of the count, as a fraction, rounded up. */
const SPARES = 0.05
/** A side at least this long takes twice the keys, mm. */
const DOUBLE_AT = 240
const DOUBLE_AT_THIRD = 360
/** Fit-test marks: V notches this wide and deep on one end of the key, this far apart, mm. */
const MARK_WIDTH = 0.8
const MARK_DEPTH = 0.5
const MARK_PITCH = 1.6
/** Two lengths closer than this are the same length (mm), as in layout.ts. */
const EPS = 0.01
/** Two sites of neighbouring placements closer than this are one (placements are rounded to 0.01 mm). */
export const SITE_TOLERANCE = 0.05

const round1 = (v: number) => Math.round(v * 10) / 10
const round2 = (v: number) => Math.round(v * 100) / 100

/**
 * Where keys can go on a whole tile, tile-local mm. `x` runs along its bottom and top sides (keys across
 * the joints between rows), `y` along its left and right sides (keys across the joints within a row).
 */
export interface KeyLattice {
  x: number[]
  y: number[]
}

/** Every number of a design's key and notch, mm. One key model per design. */
export interface KeyGeometry {
  /** Depth of a notch into the back of the tile. */
  depth: number
  /** Thickness of the printed key: the depth less 0.4 mm. */
  thickness: number
  /** How far a notch reaches into one tile from the joint. */
  reach: number
  /** Length of the neck slot inside one tile; the head fills the rest of the reach. */
  neck: number
  headWidth: number
  neckWidth: number
  /** Wall kept around a notch along its side, and between two notches. */
  margin: number
  /** 45° chamfer around the notch's mouth. */
  mouth: number
  /** 45° lead-in on the key's top face. */
  leadIn: number
  headFillet: number
  shoulderFillet: number
  /** A piece takes a notch on a side only when it is at least this deep across it. */
  minDepth: number
  /** ... or this deep when the opposite side takes the same notch. */
  minDepthBoth: number
  lattice: KeyLattice
  /** Lattice steps from a top notch to the notch it meets in the next row up: 0 in a straight grid. */
  rowShift: number
  /** The `x` indices a bottom or top notch may take: the ones whose partner in the next row can exist. */
  rowIndices: { bottom: number[]; top: number[] }
}

/** n positions centred on a side of `size`, `period / n` apart. With period = size: (2i + 1) * size / (2n). */
function centred(size: number, period: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => size / 2 + (i - (n - 1) / 2) * (period / n))
}

/** The widest head a lattice leaves room for: the footprint plus a margin fits within `e` of its centre. */
const headFor = (e: number) => Math.min(HEAD_MAX, Math.max(HEAD_MIN, Math.floor(20 * (e - MARGIN) + 1e-9) / 10))

/** A notch's footprint, piece-local: [x0, y0, x1, y1]. */
type Box = [number, number, number, number]

/**
 * A notch's footprint on a side of a piece, mouth included: what the plastic around it is measured from.
 * `grow` widens it on every face, as a socket's fit clearance widens the cavity itself.
 */
function footprint(headWidth: number, side: Side, along: number, width: number, height: number, grow = 0): Box {
  const half = headWidth / 2 + KEY_MOUTH + grow
  const deep = REACH + KEY_MOUTH + grow
  if (side === 0) return [along - half, 0, along + half, deep]
  if (side === 1) return [width - deep, along - half, width, along + half]
  if (side === 2) return [along - half, height - deep, along + half, height]
  return [0, along - half, deep, along + half]
}

/** Two footprints closer than the margin: the wall between them would be too thin to print. */
const near = (a: Box, b: Box) => a[0] < b[2] + MARGIN && b[0] < a[2] + MARGIN && a[1] < b[3] + MARGIN && b[1] < a[3] + MARGIN

/** Positive modulo. */
const mod = (a: number, n: number) => ((a % n) + n) % n

/**
 * The key lattice of a design. Keys across the vertical joints sit at y = (2i + 1)H / (2 n_v), n_v = 2
 * (4 from 240 mm). Keys across the row joints sit at x = (2i + 1)W / (2 n_h), n_h = 2 for a straight or
 * half bond and 3 for a third bond (doubled from 240 / 360 mm): no key then lands on the crossing joint of
 * the next row. In a running bond each row is shifted by a fraction of the pitch W + joint, so there the x
 * positions are spaced pitch / n_h around the tile's middle: the lattice then maps onto itself under the
 * row shift, joint included, and both rows' notches meet. With no joint that is exactly the formula above.
 * On a small tile, where the notches of two sides would crowd a corner (the same footprint test that
 * notchSites applies), each vertical joint takes one key at mid-height instead.
 */
function latticeOf(config: DesignConfig): { lattice: KeyLattice; headWidth: number; rowShift: number } {
  const W = config.tile.width
  const H = config.tile.height
  const cycle = rowShiftCycle(config.layout.rowOffset)
  const nh = cycle === 3 ? (W >= DOUBLE_AT_THIRD ? 6 : 3) : W >= DOUBLE_AT ? 4 : 2
  const x = centred(W, cycle === 1 ? W : W + config.joint, nh)
  const ex = Math.min(x[0], W - x[nh - 1])
  let y = centred(H, H, H >= DOUBLE_AT ? 4 : 2)
  let headWidth = headFor(Math.min(ex, y[0]))
  const crowded = (ey: number) => near(footprint(headWidth, 0, ex, W, H), footprint(headWidth, 3, ey, W, H))
  if (crowded(y[0])) {
    y = [H / 2]
    headWidth = headFor(Math.min(ex, H / 2))
  }
  // Each row sits pitch / cycle to the right of the one below it (computeLayout), which is nh / cycle
  // lattice steps: the top notch at index i meets the next row's bottom notch at index i - rowShift.
  return { lattice: { x, y }, headWidth, rowShift: cycle === 1 ? 0 : nh / cycle }
}

/**
 * Where a design's keys go on a whole tile, whether keys are on or not and whatever the plate: the
 * drawings and the fit test read it too.
 */
export function keyLattice(config: DesignConfig): KeyLattice {
  return latticeOf(config).lattice
}

/**
 * The `x` lattice indices a bottom and a top notch may take: those whose partner in the next row can
 * exist at all. A notch fits along a side only where its footprint and margins lie within the whole
 * tile, and a cut piece only ever loses positions, so a partner index that does not fit a whole tile
 * never carries a notch anywhere, and the notch facing it would stay empty on every piece. It is not cut
 * (a small tile in a third bond: its one middle notch per side meets the next row a lattice step along).
 */
function rowIndices(W: number, headWidth: number, x: readonly number[], rowShift: number): { bottom: number[]; top: number[] } {
  const n = x.length
  const fits = (i: number) => x[i] - headWidth / 2 - MARGIN >= -EPS && x[i] + headWidth / 2 + MARGIN <= W + EPS
  const all = x.map((_, i) => i)
  return {
    bottom: all.filter((k) => fits(k) && fits(mod(k + rowShift, n))),
    top: all.filter((i) => fits(i) && fits(mod(i - rowShift, n))),
  }
}

/**
 * The key and notch numbers of a design, or null when its plate cannot hold a notch (keyNotchDepth in
 * capability.ts has the rule). Independent of `config.lock`: the fit test, the tabs and the drawings read it too.
 */
export function keyGeometry(config: DesignConfig): KeyGeometry | null {
  const depth = keyNotchDepth(config)
  if (depth === null) return null
  const { lattice, headWidth, rowShift } = latticeOf(config)
  return {
    depth,
    thickness: round1(depth - KEY_RECESS),
    reach: REACH,
    neck: NECK,
    headWidth,
    neckWidth: headWidth / 2,
    margin: MARGIN,
    mouth: KEY_MOUTH,
    leadIn: LEAD_IN,
    headFillet: HEAD_FILLET,
    shoulderFillet: SHOULDER_FILLET,
    minDepth: REACH + MARGIN,
    minDepthBoth: 2 * REACH + MARGIN,
    lattice,
    rowShift,
    rowIndices: rowIndices(config.tile.width, headWidth, lattice.x, rowShift),
  }
}

// ---------------------------------------------------------------------------------------------------
// Outlines

/**
 * Rounds the corners of an outline whose edges meet at right angles. `corners` is [x0, y0, ...] and
 * `radii[k]` the fillet at corner k (0 keeps it sharp). The arc's ends are the exact tangent points; each
 * arc takes FILLET_SEGMENTS segments, so outlines of the same corner list always match vertex for vertex.
 */
function filletRing(corners: readonly number[], radii: readonly number[]): number[] {
  const n = radii.length
  const out: number[] = []
  for (let k = 0; k < n; k++) {
    const vx = corners[2 * k]
    const vy = corners[2 * k + 1]
    const r = radii[k]
    if (!(r > 0)) {
      out.push(vx, vy)
      continue
    }
    const p = (k + n - 1) % n
    const q = (k + 1) % n
    const unit = (x: number, y: number) => {
      const len = Math.hypot(x - vx, y - vy)
      return [(x - vx) / len, (y - vy) / len]
    }
    const [ax, ay] = unit(corners[2 * p], corners[2 * p + 1])
    const [bx, by] = unit(corners[2 * q], corners[2 * q + 1])
    // Right angles only: the tangent points sit r from the corner, the centre on the diagonal between them.
    const t1x = vx + r * ax
    const t1y = vy + r * ay
    const t2x = vx + r * bx
    const t2y = vy + r * by
    const cx = vx + r * (ax + bx)
    const cy = vy + r * (ay + by)
    const a1 = Math.atan2(t1y - cy, t1x - cx)
    let sweep = Math.atan2(t2y - cy, t2x - cx) - a1
    if (sweep > Math.PI) sweep -= 2 * Math.PI
    if (sweep <= -Math.PI) sweep += 2 * Math.PI
    out.push(t1x, t1y)
    for (let i = 1; i < FILLET_SEGMENTS; i++) {
      const a = a1 + (sweep * i) / FILLET_SEGMENTS
      out.push(cx + r * Math.cos(a), cy + r * Math.sin(a))
    }
    out.push(t2x, t2y)
  }
  return out
}

/**
 * One notch in its own frame: s along the side, t into the tile, the side line at t = 0. Counter-clockwise,
 * the opening (-N, 0) -> (N, 0) first. `grow` widens the cavity on every wall but the opening: the
 * mouth outline at the bottom face is the notch grown by the mouth chamfer, and a socket's is the notch
 * grown by its fit clearance. Every vertex of the grown ring sits exactly `grow` from the vertex of the same
 * index on the nominal one, along the outward normal, so a grown outline is the nominal one's offset curve.
 * `bridge` lengthens the neck before the head, which is how a tab's outline crosses the joint before it
 * reaches the socket; 0 for a notch, whose neck starts on its own side line.
 */
export function notchOutline(g: KeyGeometry, grow: number, bridge = 0): number[] {
  const N = g.neckWidth / 2 + grow
  const B = g.headWidth / 2 + grow
  const G = bridge + g.neck - grow
  const A = bridge + g.reach + grow
  const rh = g.headFillet + grow
  const rs = g.shoulderFillet - grow
  const corners = [-N, 0, N, 0, N, G, B, G, B, A, -B, A, -B, G, -N, G]
  return filletRing(corners, [0, 0, rs, rh, rh, rh, rh, rs])
}

/**
 * The notch frame placed on a side of the piece, `along` it (piece-local x for bottom and top, y for left
 * and right). Each side is a quarter turn of the bottom one, so the ring stays counter-clockwise and its
 * opening lies exactly on the side line. A tab's outline, mirrored to stand outside the line, comes through
 * the same quarter turn and stays counter-clockwise around the material it adds.
 */
export function placeOnSide(points: readonly number[], side: Side, along: number, width: number, height: number): Ring {
  const out = new Float64Array(points.length)
  for (let k = 0; k < points.length; k += 2) {
    const s = points[k]
    const t = points[k + 1]
    // `+ 0` keeps a -0 off the side line.
    const [x, y] =
      side === 0 ? [along + s, t] : side === 1 ? [width - t, along + s] : side === 2 ? [along - s, height - t] : [t, along - s]
    out[k] = x + 0
    out[k + 1] = y + 0
  }
  return out
}

function notchFeature(g: KeyGeometry, side: Side, along: number, width: number, height: number): BackFeature {
  const place = (grow: number) => placeOnSide(notchOutline(g, grow), side, along, width, height)
  const nominal = place(0)
  return {
    role: 'key-pocket',
    side,
    levels: [
      { ring: place(g.mouth), ringTop: nominal, z0: 0, z1: g.mouth },
      { ring: nominal, z0: g.mouth, z1: g.depth },
    ],
  }
}

/**
 * A single key notch at a chosen place, for the fit-test coupon: `along` is piece-local (x on the bottom
 * and top sides, y on the left and right). Null when the plate cannot hold one. Ignores `config.lock`.
 */
export function keyNotchAt(
  config: DesignConfig,
  side: Side,
  along: number,
  size: { width: number; height: number },
): BackFeature | null {
  const g = keyGeometry(config)
  return g ? notchFeature(g, side, along, size.width, size.height) : null
}

// ---------------------------------------------------------------------------------------------------
// Which notches a piece carries

export type PieceShape = Pick<PieceSpec, 'crop' | 'width' | 'height' | 'edges'>

export interface NotchSite {
  side: Side
  /** Index into the lattice: `x` for the bottom and top sides, `y` for the left and right. */
  index: number
  /** Piece-local position of the notch's centre along its side. */
  along: number
  /** The cavity's footprint, mouth included, piece-local. */
  box: Box
}

const NO_EDGES: PieceEdges = { boundary: 0, tabs: 0, profiled: {} }

/**
 * How far in from each side a notch must stay, piece-local: where a border profile drops towards the
 * surface edge (chamfer, bullnose, ogee), the top sinks below the plate and would leave no roof over a
 * notch. The flat margin and the raised frame never go below the plate, and neither does the relief fade.
 */
function dropZones(config: DesignConfig, edges: PieceEdges): number[] {
  const zones = [0, 0, 0, 0]
  const drop = perimeterDrop(config)
  if (drop === 0) return zones
  const offsets = shapingEdges(config, edges)
  for (const side of SIDES) {
    const offset = offsets[SIDE_NAMES[side]]
    if (offset !== undefined) zones[side] = Math.max(0, drop - offset)
  }
  return zones
}

/**
 * What a caller other than the keys may vary in notchSites. Every default is the keys' own behaviour, so a
 * call that passes none places exactly the notches it always did.
 */
export interface NotchSiteOptions {
  /** Sides to search. Default all four: a key crosses both kinds of joint, where a tab crosses only the vertical ones. */
  sides?: readonly Side[]
  /** How deep across itself a piece must be to take one, and how deep when its opposite side takes one too, mm. */
  minDepth?: number
  minDepthBoth?: number
  /**
   * How much wider than the key's own the cavity is, mm: a socket is its fit clearance wider. It grows the
   * footprint and the wall kept at each end of the side, so pass the WIDEST fit's clearance whatever the
   * design's own and which piece carries one never moves with Fit.
   */
  grow?: number
}

/**
 * The notches of one piece: on each interior side, at each lattice position whose footprint plus the
 * margin fits along that side, when the piece is deep enough across it (11 mm, or 19 mm when the opposite
 * side is interior too). Never on a side on the surface boundary or on a cut side (a cut only ever falls
 * on the surface edge), never under a dropping border profile, never across a row joint where the next
 * row can have no twin (rowIndices). Where two notches would crowd a corner, the one across the row joint
 * gives way. A pure function of the design and the piece, so two placements of one piece id always carry
 * the same notches.
 */
export function notchSites(config: DesignConfig, g: KeyGeometry, piece: PieceShape, options: NotchSiteOptions = {}): NotchSite[] {
  const { sides = SIDES, minDepth = g.minDepth, minDepthBoth = g.minDepthBoth, grow = 0 } = options
  const { crop, width, height } = piece
  const edges = piece.edges ?? NO_EDGES
  const W = config.tile.width
  const H = config.tile.height
  const cut = [crop.y0 > EPS, crop.x1 < W - EPS, crop.y1 < H - EPS, crop.x0 > EPS]
  const interior = (side: Side) => !cut[side] && !hasSide(edges.boundary, side)
  const zones = dropZones(config, edges)
  const half = g.headWidth / 2 + grow
  const sites: NotchSite[] = []
  for (const side of sides) {
    if (!interior(side)) continue
    const alongX = side === 0 || side === 2
    const depth = alongX ? height : width
    const need = interior(((side + 2) % 4) as Side) ? minDepthBoth : minDepth
    if (depth < need - EPS) continue
    const c0 = alongX ? crop.x0 : crop.y0
    const c1 = alongX ? crop.x1 : crop.y1
    const lattice = alongX ? g.lattice.x : g.lattice.y
    const paired = side === 0 ? g.rowIndices.bottom : side === 2 ? g.rowIndices.top : null
    lattice.forEach((p, index) => {
      if (paired && !paired.includes(index)) return
      if (p - half - g.margin < c0 - EPS || p + half + g.margin > c1 + EPS) return
      const along = p - c0
      const box = footprint(g.headWidth, side, along, width, height, grow)
      const clear = [box[1], width - box[2], height - box[3], box[0]]
      if (SIDES.some((q) => clear[q] < zones[q] - EPS)) return
      sites.push({ side, index, along, box })
    })
  }
  const upright = sites.filter((s) => s.side === 1 || s.side === 3)
  return sites.filter((s) => s.side === 1 || s.side === 3 || !upright.some((u) => near(s.box, u.box)))
}

/** The key notches of one piece: interior sides only, at the key lattice, where the side is long enough. */
export function keyPockets(config: DesignConfig, piece: PieceShape): BackFeature[] {
  if (config.lock !== 'keys') return []
  const g = keyGeometry(config)
  if (!g) return []
  return notchSites(config, g, piece).map((s) => notchFeature(g, s.side, s.along, piece.width, piece.height))
}

/** Where one key notch of a piece opens: its side, and its centre along that side (piece-local x on the bottom and top, y on the left and right). */
export interface KeyNotchSite {
  side: Side
  along: number
}

/** The sites of keyPockets, in the same order: what the seated keys and the drawings place a key by. */
export function keyNotchSites(config: DesignConfig, piece: PieceShape): KeyNotchSite[] {
  if (config.lock !== 'keys') return []
  const g = keyGeometry(config)
  if (!g) return []
  return notchSites(config, g, piece).map((s) => ({ side: s.side, along: s.along }))
}

// ---------------------------------------------------------------------------------------------------
// The wall's keys

/** The join plan, plus the pieces glued rather than keyed: a placement with neighbours but no key at all. */
export interface KeyJoinPlan extends JoinPlan {
  unkeyedPieceIds: string[]
  /**
   * Separate keyed groups: sets of two or more placements that keys hold together, with no key from one
   * set to another. 1 when the keys make the wall one block; 0 with no key at all. A placement keyed to
   * nothing is no group (unkeyedPieceIds names it).
   */
  blocks: number
}

const noJoins = (): KeyJoinPlan => ({ keys: 0, sites: [], unkeyedSeams: 0, unkeyedPieceIds: [], blocks: 0 })

/** Disjoint sets over placement indices, to find the blocks the keys hold together. */
function disjointSets(n: number) {
  const parent = Int32Array.from({ length: n }, (_, i) => i)
  const find = (i: number): number => {
    let root = i
    while (parent[root] !== root) root = parent[root]
    // Path compression keeps a wall of thousands of tiles linear.
    while (parent[i] !== root) {
      const next = parent[i]
      parent[i] = root
      i = next
    }
    return root
  }
  return {
    find,
    union: (a: number, b: number) => {
      parent[find(a)] = find(b)
    },
  }
}

/**
 * Every key site between neighbouring placements that both carry the notch. Neighbours share a side
 * segment: the next piece in a row, one joint along, and the pieces of the next row up whose extent
 * overlaps, one joint up (straight and running bonds alike). `unkeyedSeams` counts neighbour pairs with no
 * key between them, and `blocks` the separate groups the keys hold together. Empty when keys are off, and
 * when the plate cannot hold a notch at all (the thin-base note says so; every seam is then glued, which
 * is no news per seam).
 */
export function joinPlan(config: DesignConfig, plan: LayoutPlan): KeyJoinPlan {
  if (config.lock !== 'keys') return noJoins()
  const g = keyGeometry(config)
  if (!g) return noJoins()
  const joint = config.joint
  const pieces = new Map(plan.pieces.map((p) => [p.id, p]))
  const cache = new Map<string, Set<number>[]>()
  /** Lattice indices of a piece's notches, per side. */
  const notchesOf = (piece: PieceSpec): Set<number>[] => {
    let sides = cache.get(piece.id)
    if (!sides) {
      sides = [new Set(), new Set(), new Set(), new Set()]
      for (const s of notchSites(config, g, piece)) sides[s.side].add(s.index)
      cache.set(piece.id, sides)
    }
    return sides
  }

  const rows = new Map<number, number[]>()
  plan.placements.forEach((p, i) => {
    const list = rows.get(p.row)
    if (list) list.push(i)
    else rows.set(p.row, [i])
  })
  const pieceAt = (i: number): PieceSpec => {
    const piece = pieces.get(plan.placements[i].pieceId)
    if (!piece) throw new Error(`Placement refers to unknown piece "${plan.placements[i].pieceId}"`)
    return piece
  }
  for (const list of rows.values()) list.sort((a, b) => plan.placements[a].x - plan.placements[b].x)

  const neighbours = new Uint32Array(plan.placements.length)
  const keyed = new Uint32Array(plan.placements.length)
  const sets = disjointSets(plan.placements.length)
  const sites: KeySite[] = []
  let unkeyedSeams = 0
  const seam = (a: number, b: number, found: KeySite[]) => {
    neighbours[a]++
    neighbours[b]++
    if (found.length === 0) {
      unkeyedSeams++
      return
    }
    keyed[a] += found.length
    keyed[b] += found.length
    sets.union(a, b)
    sites.push(...found)
  }

  // Within a row: the right side of one piece against the left side of the next.
  for (const list of rows.values()) {
    for (let k = 0; k + 1 < list.length; k++) {
      const a: Placement = plan.placements[list[k]]
      const b: Placement = plan.placements[list[k + 1]]
      const pa = pieceAt(list[k])
      const pb = pieceAt(list[k + 1])
      if (Math.abs(b.x - (a.x + pa.width + joint)) > SITE_TOLERANCE) continue
      const left = notchesOf(pb)[3]
      const found: KeySite[] = []
      for (const index of notchesOf(pa)[1]) {
        if (!left.has(index)) continue
        const y = g.lattice.y[index]
        // Both pieces share the row, so their crops agree along y; check it rather than trust it.
        if (Math.abs(a.y + y - pa.crop.y0 - (b.y + y - pb.crop.y0)) > SITE_TOLERANCE) continue
        found.push({ x: round2(a.x + pa.width + joint / 2), y: round2(a.y + y - pa.crop.y0), seam: 'vertical' })
      }
      seam(list[k], list[k + 1], found)
    }
  }

  // Between rows: the top side of each piece against the bottom side of every piece above that overlaps it.
  const order = [...rows.keys()].sort((a, b) => a - b)
  for (let r = 0; r + 1 < order.length; r++) {
    if (order[r + 1] !== order[r] + 1) continue
    const lower = rows.get(order[r]) as number[]
    const upper = rows.get(order[r + 1]) as number[]
    let i = 0
    let k = 0
    while (i < lower.length && k < upper.length) {
      const a = plan.placements[lower[i]]
      const b = plan.placements[upper[k]]
      const pa = pieceAt(lower[i])
      const pb = pieceAt(upper[k])
      const a1 = a.x + pa.width
      const b1 = b.x + pb.width
      const overlap = Math.min(a1, b1) - Math.max(a.x, b.x)
      if (overlap > EPS && Math.abs(b.y - (a.y + pa.height + joint)) <= SITE_TOLERANCE) {
        const above = [...notchesOf(pb)[0]].map((index) => b.x + g.lattice.x[index] - pb.crop.x0)
        const found: KeySite[] = []
        for (const index of notchesOf(pa)[2]) {
          const x = a.x + g.lattice.x[index] - pa.crop.x0
          if (!above.some((other) => Math.abs(other - x) <= SITE_TOLERANCE)) continue
          found.push({ x: round2(x), y: round2(a.y + pa.height + joint / 2), seam: 'horizontal' })
        }
        seam(lower[i], upper[k], found)
      }
      if (a1 < b1) i++
      else k++
    }
  }

  const unkeyed = new Set<string>()
  const groups = new Set<number>()
  plan.placements.forEach((p, i) => {
    if (neighbours[i] > 0 && keyed[i] === 0) unkeyed.add(p.pieceId)
    if (keyed[i] > 0) groups.add(sets.find(i))
  })
  return {
    keys: sites.length,
    sites,
    unkeyedSeams,
    unkeyedPieceIds: plan.pieces.filter((p) => unkeyed.has(p.id)).map((p) => p.id),
    blocks: groups.size,
  }
}

/**
 * Whether whole tiles of a design key to the next row: a top notch of an interior whole tile meets a
 * bottom notch of the whole tile above it. False when the plate cannot hold a notch.
 */
function rowsKey(config: DesignConfig): boolean {
  const g = keyGeometry(config)
  if (!g) return false
  const W = config.tile.width
  const H = config.tile.height
  const whole: PieceShape = { crop: { x0: 0, y0: 0, x1: W, y1: H }, width: W, height: H, edges: NO_EDGES }
  const sites = notchSites(config, g, whole)
  const n = g.lattice.x.length
  const bottoms = new Set(sites.filter((s) => s.side === 0).map((s) => s.index))
  return sites.some((s) => s.side === 2 && bottoms.has(mod(s.index - g.rowShift, n)))
}

/** The brick patterns, named as the studio's Brick pattern control names them. */
const PATTERNS: { rowOffset: RowOffset; name: string }[] = [
  { rowOffset: 0, name: 'Straight' },
  { rowOffset: 0.5, name: 'Half brick' },
  { rowOffset: 0.3333, name: 'Third brick' },
]

/**
 * The smallest tile of the design's proportions, in 1 mm steps of its width, from which every larger one
 * keys its rows; null when even the largest tile does not. Scanned from the top down, because a joint
 * can make row keys come and go over a millimetre or two just above the first size that has them.
 */
function smallestRowKeyedTile(config: DesignConfig): { width: number; height: number } | null {
  const { width: W, height: H } = config.tile
  const sized = (w: number) => ({ ...config.tile, width: w, height: Math.round((H * w) / W) })
  let found: { width: number; height: number } | null = null
  const largest = Math.floor(Math.min(LIMITS.tile.max, (LIMITS.tile.max * W) / H))
  for (let w = largest; w > W; w--) {
    const tile = sized(w)
    if (!rowsKey({ ...config, tile })) break
    found = { width: tile.width, height: tile.height }
  }
  return found
}

/**
 * The note for a keyed wall that the keys do not hold in one block, or null. Keys that join each row but
 * never one row to the next leave a stack of loose strips, and nothing else says so: every piece is keyed
 * to something. The fix is glue between the strips, or a brick pattern or tile size whose rows key (both
 * computed). Null when keys are off or impossible (the thin-base note covers that) and when the keys make
 * one block.
 */
export function keyCoverageNote(config: DesignConfig, plan: LayoutPlan, joins: KeyJoinPlan = joinPlan(config, plan)): string | null {
  if (!keysPossible(config) || joins.blocks <= 1) return null
  const n = joins.blocks
  if (rowsKey(config)) {
    return `Keys hold this wall in ${n} separate groups that no key joins to each other: glue the joints between them to make one panel.`
  }
  const patterns = PATTERNS.filter(
    (p) => p.rowOffset !== config.layout.rowOffset && rowsKey({ ...config, layout: { ...config.layout, rowOffset: p.rowOffset } }),
  ).map((p) => p.name)
  const tile = smallestRowKeyedTile(config)
  const size = tile ? `tiles of at least ${formatSize(tile.width, tile.height)}` : null
  const pattern = patterns.length > 0 ? `The ${patterns.join(' or ')} pattern` : null
  let other = ''
  if (pattern && size) other = ` ${pattern} would key the rows, and so would ${size}.`
  else if (pattern) other = ` ${pattern} would key the rows.`
  else if (size) other = ` T${size.slice(1)} would key the rows.`
  const why = config.layout.rowOffset === 0 ? 'at this tile size' : 'at this tile size and brick pattern'
  return `Keys hold this wall in ${n} separate strips: ${why}, no key fits across the joints between rows. Glue between the rows to make one panel.${other}`
}

// ---------------------------------------------------------------------------------------------------
// The printed key

/** A key's spec with the given clearance, cut to span a joint `joint` mm wide; null when the plate cannot hold a notch. */
function keySpec(
  config: DesignConfig,
  clearance: number,
  marks: number,
  joint = config.joint,
): Omit<AccessorySpec, 'mark' | 'count' | 'group'> | null {
  const g = keyGeometry(config)
  if (!g) return null
  const length = round2(2 * g.reach + joint - 2 * clearance)
  const width = round2(g.headWidth - 2 * clearance)
  const n = (v: number) => formatNumber(v, 2).replaceAll(',', '')
  return {
    id: `key-${n(2 * g.reach + joint)}x${n(g.headWidth)}x${n(g.thickness)}-c${n(clearance)}${marks ? `-m${marks}` : ''}`,
    kind: 'key',
    label: `Key, ${formatLength(round1(length))}`,
    size: { x: length, y: width, z: g.thickness },
    printNote: partPrintNote('key', 'Print flat as it comes, chamfered face up (it goes into the slots first)'),
    shape: {
      reach: g.reach,
      neck: g.neck,
      headWidth: g.headWidth,
      neckWidth: g.neckWidth,
      joint,
      clearance,
      thickness: g.thickness,
      leadIn: g.leadIn,
      headFillet: g.headFillet,
      shoulderFillet: g.shoulderFillet,
      marks,
    },
  }
}

/**
 * The wall's key at the design's fit, as the download holds it (the K1 file without its count), whether or
 * not a joint takes one: the seated keys of the 3D view are built from it. Null when the plate cannot hold
 * a notch.
 */
export function wallKeySpec(config: DesignConfig): Omit<AccessorySpec, 'mark' | 'count' | 'group'> | null {
  return keySpec(config, fitClearance(config.fit, 'key'), 0)
}

/**
 * The key file: one model for the whole wall, counted from the join plan plus 5 % spares (rounded up).
 * None when keys are off, when the plate cannot hold them, or when no joint takes one.
 */
export function keyAccessories(config: DesignConfig, plan: LayoutPlan): AccessorySpec[] {
  const keys = joinPlan(config, plan).keys
  if (keys === 0) return []
  const spec = wallKeySpec(config)
  if (!spec) return []
  return [{ ...spec, mark: 'K1', count: keys + Math.ceil(keys * SPARES), group: 'join' }]
}

/**
 * One key of the fit test at a fit class, told apart by 1 to 3 small V notches on one end of the key (off
 * the faces that locate it). Mark "FK1" to "FK3" and group 'fit-test'; the fit test may rename it. Null when
 * the plate cannot hold a notch. Cut for a closed joint: test coupons A and B butt, and the clearance under
 * test is per side, the same at any joint, so the wall's own keys keep the joint and these do not.
 */
export function keySpecForFit(config: DesignConfig, fit: FitClass, marks: 1 | 2 | 3): AccessorySpec | null {
  const spec = keySpec(config, fitClearance(fit, 'key'), marks, 0)
  if (!spec) return null
  return { ...spec, label: `Test key ${marks}, ${fit}`, mark: `FK${marks}`, count: 1, group: 'fit-test' }
}

/** The numbers a key spec carries, checked: a spec from elsewhere must not build a broken solid. */
function keyShape(spec: Pick<AccessorySpec, 'id' | 'shape'>) {
  const num = (key: string): number => {
    const v = spec.shape[key]
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Key ${spec.id}: shape.${key} is missing`)
    return v
  }
  return {
    reach: num('reach'),
    neck: num('neck'),
    headWidth: num('headWidth'),
    neckWidth: num('neckWidth'),
    joint: num('joint'),
    clearance: num('clearance'),
    thickness: num('thickness'),
    leadIn: num('leadIn'),
    headFillet: num('headFillet'),
    shoulderFillet: num('shoulderFillet'),
    marks: Math.max(0, Math.min(3, Math.round(typeof spec.shape.marks === 'number' ? spec.shape.marks : 0))),
  }
}

/**
 * The key's outline, `inset` in from the key's nominal outline on every face. The nominal outline is both
 * notches j apart, shrunk by the clearance c; the end at +x carries the fit-test marks. Counter-clockwise,
 * centred on the origin, x across the joint.
 */
function keyOutline(shape: ReturnType<typeof keyShape>, inset: number): number[] {
  const c = shape.clearance + inset
  const L = shape.reach + shape.joint / 2 - c
  const G = shape.neck + shape.joint / 2 + c
  const B = shape.headWidth / 2 - c
  const N = shape.neckWidth / 2 - c
  const rh = shape.headFillet - c
  const rs = shape.shoulderFillet + c
  const corners: number[] = [L, -B]
  const radii: number[] = [rh]
  // The marks cut the +x end, centred on it: an end is never pressed on unless the joint is open.
  for (let m = 0; m < shape.marks; m++) {
    const y = (m - (shape.marks - 1) / 2) * MARK_PITCH
    corners.push(L, y - MARK_WIDTH / 2, L - MARK_DEPTH, y, L, y + MARK_WIDTH / 2)
    radii.push(0, 0, 0)
  }
  corners.push(L, B, G, B, G, N, -G, N, -G, B, -L, B, -L, -B, -G, -B, -G, -N, G, -N, G, -B)
  radii.push(rh, rh, rs, rs, rh, rh, rh, rh, rs, rs, rh)
  return filletRing(corners, radii)
}

/**
 * The closed mesh of a key spec made by keyAccessories or keySpecForFit: the outline as a prism printed
 * flat, its bottom on the bed at z = 0 and its bounding box from the origin, with the 45° lead-in on the
 * top face. Reads only the spec's shape, so a fit-test key with its own clearance builds the same way.
 */
export function buildKeyMesh(_config: DesignConfig, spec: Pick<AccessorySpec, 'id' | 'kind' | 'shape'>): MeshData {
  if (spec.kind !== 'key') throw new Error(`Not a key: ${spec.id}`)
  const shape = keyShape(spec)
  const k = shape.thickness
  if (!(k > shape.leadIn)) throw new Error(`Key ${spec.id}: ${k} mm is too thin for its lead-in`)
  const L = shape.reach + shape.joint / 2 - shape.clearance
  const B = shape.headWidth / 2 - shape.clearance
  const ring = (inset: number) => {
    const points = keyOutline(shape, inset)
    for (let i = 0; i < points.length; i += 2) {
      points[i] += L
      points[i + 1] += B
    }
    return points
  }
  const body = ring(0)
  return loftSolid([
    { z: 0, ring: body },
    { z: k - shape.leadIn, ring: body },
    { z: k, ring: ring(shape.leadIn) },
  ])
}
