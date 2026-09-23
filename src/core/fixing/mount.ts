// Wall clips: where the clip pockets go in each piece, the mount plan of a wall (every clip over every
// placed tile), the clip file with its spares, and the clip's mesh. The clip and its pocket are designed
// together in mechanism.ts; docs/architecture.md ("Fixings") has the rules in words.
// Pure maths: this runs in the geometry worker and in vitest's node environment.

import { float32Quantum } from '../geometry/grid'
import { checkMesh, componentCount, pinchedVertices } from '../geometry/meshChecks'
import { reverseRing, ringFromRect, signedArea, snapRing, triangulatePolygon } from '../geometry/polygon'
import { resolveJointEdge, resolvePerimeter, shapingEdges } from '../geometry/profiles'
import { partPrintNote } from '../printSettings'
import { SIDE_NAMES, SIDES } from '../sides'
import type { DesignConfig, FitClass, LayoutPlan, MeshData, PieceSpec } from '../types'
import { formatNumber } from '../units'
import { CLIP_SIDE_WALL, clipBandOffset, clipsPossible, KEY_CLEAR } from './capability'
import { keyPockets } from './joins'
import { pieceSockets } from './tabs'
import {
  BARB_TIP_HIGH,
  BARB_TIP_LOW,
  CATCH,
  CLIP_CLEARANCE,
  CLIP_HALF_LENGTH,
  CLIP_THICKNESS,
  clipOutlineAt,
  clipPocketLevels,
  COUNTERSINK_START,
  HOLE_SEGMENTS,
  holeRadius,
  POCKET_DEPTH,
  POCKET_HALF_LONG,
  POCKET_HALF_SHORT,
  POCKET_OPENING,
  returnFaceLow,
  stopRects,
} from './mechanism'
import type { AccessorySpec, BackFeature, ClipSite, MountPlan } from './types'

// ---------------------------------------------------------------------------------------------------
// Clip pockets

/** Room a pocket keeps beyond the perimeter band of a profiled side, mm: a dropping profile leaves no roof over a pocket. */
export const PERIMETER_CLEAR = 2
/** Least wall between two pockets of a piece, mm. */
export const POCKET_GAP = 2
/** Step of the last resort scan for a clip height, mm: fine enough to find the gaps key slots leave. */
const SCAN_STEP = 0.5
/** A tile at least this wide takes two clips per band (at W/4 and 3W/4); this tall, two turned clips, mm. */
export const DOUBLE_AT = 240
/** Spare clips printed on top of the count, as a fraction, rounded up: the keys' rule. */
const SPARES = 0.05

const EPS = 1e-6
const round2 = (v: number) => Math.round(v * 100) / 100
/** A number as it appears in an id: two decimals at most, no grouping. */
const idNum = (v: number) => formatNumber(round2(v), 2).replaceAll(',', '')

type PieceShape = Pick<PieceSpec, 'crop' | 'width' | 'height' | 'edges'>

/** Where one clip pocket sits in a piece: its centre, piece-local mm, and which way the clip lies. */
export interface ClipPocketSite {
  x: number
  y: number
  /** 'h': the clip lies along x, its catch up and down; 'v': turned a quarter turn, for a narrow piece. */
  axis: 'h' | 'v'
}

/**
 * How far a pocket keeps from each side of a piece, in Side order: a wall, clear of the joint edge's run
 * (it lowers the top there), and past the perimeter band of a profiled side plus PERIMETER_CLEAR.
 */
function sideMargins(config: DesignConfig, piece: PieceShape): number[] {
  const base = Math.max(CLIP_SIDE_WALL, resolveJointEdge(config).run)
  const margins = [base, base, base, base]
  const perimeter = resolvePerimeter(config)
  if (!perimeter) return margins
  const offsets = shapingEdges(config, piece.edges)
  for (const side of SIDES) {
    const offset = offsets[SIDE_NAMES[side]]
    if (offset !== undefined) margins[side] = Math.max(margins[side], perimeter.band - offset + PERIMETER_CLEAR)
  }
  return margins
}

/** How far a profiled side's band reaches into the piece, or 0: the band offset grows by it. */
function bandInset(config: DesignConfig, piece: PieceShape, side: 0 | 2): number {
  const perimeter = resolvePerimeter(config)
  const offset = perimeter ? shapingEdges(config, piece.edges)[SIDE_NAMES[side]] : undefined
  return perimeter && offset !== undefined ? Math.max(0, perimeter.band - offset) : 0
}

interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** A feature's footprint over all its levels. */
function featureBox(feature: BackFeature): Box {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const level of feature.levels) {
    for (const ring of level.ringTop ? [level.ring, level.ringTop] : [level.ring]) {
      for (let k = 0; k + 1 < ring.length; k += 2) {
        box.minX = Math.min(box.minX, ring[k])
        box.maxX = Math.max(box.maxX, ring[k])
        box.minY = Math.min(box.minY, ring[k + 1])
        box.maxY = Math.max(box.maxY, ring[k + 1])
      }
    }
  }
  return box
}

/**
 * The footprints of what the tile-to-tile lock cuts into this piece's plate: key notches, or the sockets of
 * the tabs. Only these; a tab itself stands outside the footprint, so it takes no clip room.
 */
function recessBoxes(config: DesignConfig, piece: PieceShape): Box[] {
  return [...keyPockets(config, piece), ...pieceSockets(config, piece)].map(featureBox)
}

/** Removes the open interval (a, b) from a list of closed intervals. */
function subtract(intervals: [number, number][], a: number, b: number): [number, number][] {
  const out: [number, number][] = []
  for (const [lo, hi] of intervals) {
    if (b <= lo || a >= hi) {
      out.push([lo, hi])
      continue
    }
    if (a > lo) out.push([lo, a])
    if (b < hi) out.push([b, hi])
  }
  return out
}

/**
 * Where along a line a pocket's centre may go: within [lo, hi], and KEY_CLEAR of plate from every recess of
 * the lock whose extent across the line comes that close to the pocket. `along` is the axis the line runs along,
 * `cross` its position on the other axis; the pocket reaches `halfAlong` and `halfCross` from its centre.
 */
function allowedAlong(lo: number, hi: number, along: 'x' | 'y', cross: number, halfAlong: number, halfCross: number, recesses: readonly Box[]): [number, number][] {
  let allowed: [number, number][] = hi >= lo - EPS ? [[lo, Math.max(lo, hi)]] : []
  for (const box of recesses) {
    const [c0, c1, a0, a1] = along === 'x' ? [box.minY, box.maxY, box.minX, box.maxX] : [box.minX, box.maxX, box.minY, box.maxY]
    if (c0 - KEY_CLEAR >= cross + halfCross || c1 + KEY_CLEAR <= cross - halfCross) continue
    allowed = subtract(allowed, a0 - KEY_CLEAR - halfAlong, a1 + KEY_CLEAR + halfAlong)
  }
  return allowed
}

/**
 * The positions of a line that take a clip: the preferred ones (the tile's lattice) that are allowed, or
 * else one in the middle of the widest allowed stretch, so a cut piece still gets its clip. Rounded to
 * 0.01 mm without leaving the stretch.
 */
function pick(preferred: readonly number[], allowed: readonly [number, number][]): number[] {
  const within = (v: number) => allowed.find(([a, b]) => v >= a - EPS && v <= b + EPS)
  const kept = preferred.flatMap((v) => {
    const stretch = within(v)
    return stretch ? [settle(v, stretch[0], stretch[1])] : []
  })
  if (kept.length > 0) return kept
  let best: [number, number] | null = null
  for (const [a, b] of allowed) if (!best || b - a > best[1] - best[0] + EPS) best = [a, b]
  return best ? [settle((best[0] + best[1]) / 2, best[0], best[1])] : []
}

/** A position rounded to 0.01 mm and kept inside [a, b], so the rounding never eats into a margin. */
const settle = (v: number, a: number, b: number) => Math.min(Math.max(round2(v), a), b)

/**
 * Heights to try when the preferred bands take no clip: out from the middle of [lo, hi] in SCAN_STEP steps,
 * lower first, and the two ends last. The first one whose stretch is clear wins, so a piece boxed in by key
 * slots on its bands still gets a clip, and the answer stays a function of the piece alone.
 */
function scanned(lo: number, hi: number): number[] {
  if (hi < lo - EPS) return []
  const mid = (lo + hi) / 2
  const out: number[] = []
  for (let k = 1; k <= Math.floor((hi - lo) / 2 / SCAN_STEP); k++) {
    out.push(settle(mid - k * SCAN_STEP, lo, hi), settle(mid + k * SCAN_STEP, lo, hi))
  }
  out.push(settle(lo, lo, hi), settle(hi, lo, hi))
  return out
}

/** Lattice positions along one side of a whole tile of that size: its middle, or its quarters from DOUBLE_AT. */
const lattice = (size: number, offset: number) => (size >= DOUBLE_AT - EPS ? [size / 4, (3 * size) / 4] : [size / 2]).map((p) => p - offset)

/**
 * Where a piece's clips go, piece-local mm, bottom band first. Horizontal clips sit on two bands, at
 * clipBandOffset from the bottom and top edges (further in past a profiled side's band), or on one centred
 * band when the piece is too short for two; along each band at the tile's middle, or its quarters from
 * DOUBLE_AT wide, where the pocket keeps its walls and KEY_CLEAR to every key notch, else in the middle of
 * the widest stretch that does. Bands blocked by key slots fall back to the centred band and then to a scan
 * of every height the piece's walls allow, so one clip is placed wherever one fits. A piece too narrow for a
 * horizontal clip but tall enough turns its clip a quarter turn, as near the middle across as its walls
 * allow and on the tile's height lattice along. Empty when the design is not on clips, the plate is too thin,
 * or no pocket fits at all. A pure function of the design and the piece's crop, size and edges, so every
 * placement of one piece id carries the same pockets.
 */
export function clipSites(config: DesignConfig, piece: PieceShape): ClipPocketSite[] {
  if (!clipsPossible(config)) return []
  const { width: W, height: H, crop } = piece
  const m = sideMargins(config, piece)
  // A socket is cut into the same plate as a pocket, so the pocket keeps KEY_CLEAR of plate to it exactly as
  // it does to a key notch: cut touching, the mesher refuses the piece. A tab adds material outside the
  // footprint instead, so it costs no clip room.
  const recesses = recessBoxes(config, piece)

  const b = clipBandOffset(config)
  const low = m[0] + POCKET_HALF_SHORT
  const high = H - m[2] - POCKET_HALF_SHORT
  const bottom = Math.max(b + bandInset(config, piece, 0), low)
  const top = Math.min(H - b - bandInset(config, piece, 2), high)
  const across = lattice(config.tile.width, crop.x0)
  /** The clips one or two heights take, at the tile's lattice across, or in the widest stretch left. */
  const along = (ys: readonly number[]): ClipPocketSite[] => {
    const out: ClipPocketSite[] = []
    for (const y of ys) {
      const allowed = allowedAlong(m[3] + POCKET_HALF_LONG, W - m[1] - POCKET_HALF_LONG, 'x', y, POCKET_HALF_LONG, POCKET_HALF_SHORT, recesses)
      for (const x of pick(across, allowed)) out.push({ x, y: settle(y, low, high), axis: 'h' })
    }
    return out
  }
  const middle = high >= low - EPS ? [settle((low + high) / 2, low, high)] : []
  const twoBands = top - bottom >= 2 * POCKET_HALF_SHORT + POCKET_GAP - EPS
  // The preferred bands first (a whole tile keeps the pair it has always had), then the centred band, then
  // one clip at the first height that takes one at all.
  for (const ys of twoBands ? [[bottom, top], middle] : [middle]) {
    const found = along(ys)
    if (found.length > 0) return found
  }
  // A piece too narrow for a clip along it takes none at any height, so the scan is skipped for one.
  if (W - m[1] - POCKET_HALF_LONG >= m[3] + POCKET_HALF_LONG - EPS) {
    for (const y of scanned(low, high)) {
      const found = along([y])
      if (found.length > 0) return found
    }
  }

  // Too narrow for a clip along it: one turned a quarter turn, as near its middle across as the walls allow,
  // and failing that at the first place across that key slots leave clear.
  const [xLo, xHi] = [m[3] + POCKET_HALF_SHORT, W - m[1] - POCKET_HALF_SHORT]
  if (xHi < xLo - EPS) return []
  const turned = (x: number): ClipPocketSite[] => {
    const allowed = allowedAlong(m[0] + POCKET_HALF_LONG, H - m[2] - POCKET_HALF_LONG, 'y', x, POCKET_HALF_LONG, POCKET_HALF_SHORT, recesses)
    return pick(lattice(config.tile.height, crop.y0), allowed).map((y) => ({ x, y, axis: 'v' as const }))
  }
  for (const x of [settle(W / 2, xLo, xHi), ...scanned(xLo, xHi)]) {
    const found = turned(x)
    if (found.length > 0) return found
  }
  return []
}

/** One clip pocket centred at piece-local (x, y), its clip along x ('h') or y ('v'): the section's levels (mechanism.ts). */
export function clipPocketAt(x: number, y: number, axis: 'h' | 'v'): BackFeature {
  return { role: 'clip-pocket', side: null, levels: clipPocketLevels(x, y, axis) }
}

/** The clip pockets of one piece; none when the design is not on clips or the piece is too small. */
export function clipPockets(config: DesignConfig, piece: PieceShape): BackFeature[] {
  return clipSites(config, piece).map((s) => clipPocketAt(s.x, s.y, s.axis))
}

// ---------------------------------------------------------------------------------------------------
// The wall's clips

/**
 * Every clip on the wall: one per pocket over every placed tile, surface mm, bottom to top then left to
 * right, and the pieces with no pocket at all. Empty for a glued design, or when the plate is too thin
 * for a pocket (the thin-base note says so; no piece is then named).
 */
export function mountPlan(config: DesignConfig, plan: LayoutPlan): MountPlan {
  if (!clipsPossible(config)) return { clips: 0, sites: [], unmountedPieceIds: [] }
  const sitesOf = new Map(plan.pieces.map((p) => [p.id, clipSites(config, p)]))
  const sites: ClipSite[] = []
  for (const placement of plan.placements) {
    for (const s of sitesOf.get(placement.pieceId) ?? []) {
      sites.push({ x: round2(placement.x + s.x), y: round2(placement.y + s.y), axis: s.axis, pieceId: placement.pieceId })
    }
  }
  sites.sort((a, b) => a.y - b.y || a.x - b.x)
  return {
    clips: sites.length,
    sites,
    unmountedPieceIds: plan.pieces.filter((p) => (sitesOf.get(p.id) ?? []).length === 0).map((p) => p.id),
  }
}

// ---------------------------------------------------------------------------------------------------
// The printed clip

/**
 * A clip's spec at a fit class: the wall's clips (no marks), or one of the fit test's, marked 1 to 3 by
 * notches in its spine's end. Its size is its box as printed: the barbs' clearance narrows it, and the
 * stops make it as tall as the pocket is deep.
 */
export function clipSpec(fit: FitClass, marks: 0 | 1 | 2 | 3 = 0): Omit<AccessorySpec, 'mark' | 'count' | 'group' | 'label'> {
  const clearance = CLIP_CLEARANCE[fit]
  return {
    id: `clip-c${idNum(clearance)}${marks ? `-m${marks}` : ''}`,
    kind: 'clip',
    size: { x: round2(2 * CLIP_HALF_LENGTH), y: round2(2 * (POCKET_OPENING + CATCH - clearance)), z: round2(POCKET_DEPTH) },
    printNote: partPrintNote('clip', 'Print flat on its back as it comes, stops up'),
    shape: { clearance, marks },
  }
}

/** One clip of the fit test at a fit class, marked by 1 to 3 notches (snug, standard, loose); the fit test renumbers its mark. */
export function clipSpecForFit(fit: FitClass, marks: 1 | 2 | 3): AccessorySpec {
  return { ...clipSpec(fit, marks), label: `Test clip ${marks}, ${fit}`, mark: `FC${marks}`, count: 1, group: 'fit-test' }
}

/**
 * The mount's printed parts: one clip file, as many as the wall has pockets plus 5 % spares, at the
 * design's fit. None when the design is glued, the plate is too thin, or no piece takes a clip.
 */
export function mountParts(config: DesignConfig, plan: LayoutPlan): AccessorySpec[] {
  const clips = mountPlan(config, plan).clips
  if (clips === 0) return []
  return [{ ...clipSpec(config.fit), mark: 'C1', label: `Wall clip, ${config.fit} fit`, count: clips + Math.ceil(clips * SPARES), group: 'mount' }]
}

// ---------------------------------------------------------------------------------------------------
// The clip's mesh

/** Grows flat per-face vertex, normal and index lists (the accessory builders' convention: one normal per face). */
class Faces {
  positions: number[] = []
  normals: number[] = []
  indices: number[] = []

  face(points: readonly number[], tris: ArrayLike<number>, normal: readonly [number, number, number]): void {
    const base = this.positions.length / 3
    for (let k = 0; k < points.length; k += 3) {
      this.positions.push(points[k], points[k + 1], points[k + 2])
      this.normals.push(normal[0], normal[1], normal[2])
    }
    for (let k = 0; k < tris.length; k++) this.indices.push(base + tris[k])
  }

  /**
   * A wall quad a, b, c, d (counter-clockwise seen from outside), split along its shorter diagonal: a triangle
   * where one of its ends has no length (a barb starting from nothing), and nothing where neither has.
   */
  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]): void {
    const same = (p: readonly number[], q: readonly number[]) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2]
    const low = same(a, b)
    const high = same(c, d)
    if (low && high) return
    if (low || high) {
      const tri = low ? [a, c, d] : [a, b, c]
      this.face(tri.flat(), [0, 1, 2], newell(tri))
      return
    }
    const ac = (a[0] - c[0]) ** 2 + (a[1] - c[1]) ** 2 + (a[2] - c[2]) ** 2
    const bd = (b[0] - d[0]) ** 2 + (b[1] - d[1]) ** 2 + (b[2] - d[2]) ** 2
    this.face([...a, ...b, ...c, ...d], ac <= bd ? [0, 1, 2, 0, 2, 3] : [0, 1, 3, 1, 2, 3], newell([a, b, c, d]))
  }

  /** A flat face at height z over an outline with holes (every ring counter-clockwise), facing up or down. */
  cap(outer: Float64Array, holes: readonly Float64Array[], z: number, up: boolean): void {
    const rings = [dedupe(outer), ...holes.map((h) => reverseRing(dedupe(h)))]
    const tris = triangulatePolygon(rings[0], rings.slice(1))
    if (!up) for (let t = 0; t < tris.length; t += 3) [tris[t + 1], tris[t + 2]] = [tris[t + 2], tris[t + 1]]
    const points: number[] = []
    for (const r of rings) for (let k = 0; k < r.length; k += 2) points.push(r[k], r[k + 1], z)
    this.face(points, tris, [0, 0, up ? 1 : -1])
  }

  done(): MeshData {
    return {
      positions: Float32Array.from(this.positions),
      normals: Float32Array.from(this.normals),
      indices: Uint32Array.from(this.indices),
      topIndexCount: 0,
    }
  }
}

/** Unit Newell normal of a planar polygon of xyz points. */
function newell(points: readonly (readonly number[])[]): [number, number, number] {
  let x = 0
  let y = 0
  let z = 0
  for (let k = 0; k < points.length; k++) {
    const a = points[k]
    const b = points[(k + 1) % points.length]
    x += (a[1] - b[1]) * (a[2] + b[2])
    y += (a[2] - b[2]) * (a[0] + b[0])
    z += (a[0] - b[0]) * (a[1] + b[1])
  }
  const len = Math.hypot(x, y, z) || 1
  return [x / len, y / len, z / len]
}

/** A ring without vertices that repeat the one before them (a barb with no length yet). */
function dedupe(ring: Float64Array): Float64Array {
  const n = ring.length >> 1
  const out: number[] = []
  for (let k = 0; k < n; k++) {
    const j = (k + n - 1) % n
    if (ring[2 * k] === ring[2 * j] && ring[2 * k + 1] === ring[2 * j + 1]) continue
    out.push(ring[2 * k], ring[2 * k + 1])
  }
  return Float64Array.from(out)
}

/** One slab of the clip: its outline and its hole at z0 and at z1, lofted vertex to vertex. */
interface Slab {
  z0: number
  z1: number
  outer: [Float64Array, Float64Array]
  hole: [Float64Array, Float64Array]
}

/** Walls of one lofted ring between two heights; `inward` for a hole, whose walls face into it. */
function loftWalls(out: Faces, lo: Float64Array, hi: Float64Array, z0: number, z1: number, inward: boolean): void {
  const n = lo.length >> 1
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n
    const a = [lo[2 * k], lo[2 * k + 1], z0]
    const b = [lo[2 * j], lo[2 * j + 1], z0]
    const c = [hi[2 * j], hi[2 * j + 1], z1]
    const d = [hi[2 * k], hi[2 * k + 1], z1]
    if (inward) out.quad(b, a, d, c)
    else out.quad(a, b, c, d)
  }
}

/** A number or list a spec's shape must carry. */
function shapeNumber(spec: Pick<AccessorySpec, 'id' | 'shape'>, key: string): number {
  const v = spec.shape[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${spec.id}: shape.${key} is missing`)
  return v
}

/**
 * The clip as printed: flat on its back (the wall side on the bed, z = 0), its bounding box from the origin
 * with the clip along x, so its centre is the middle of that box. The body is a stack of lofted slabs
 * between the heights where the barbs' profile or the screw hole changes (the barbs' outer vertices move
 * across the catch, the hole widens into its countersink), and the two stops stand on its top. Every
 * face is flat, the only faces that look down are the bed and the barbs' 40 degree return faces, and the
 * solid is checked closed, manifold and in one piece before it is returned.
 */
export function buildClipMesh(spec: Pick<AccessorySpec, 'id' | 'shape'>): MeshData {
  const clearance = shapeNumber(spec, 'clearance')
  const marks = typeof spec.shape.marks === 'number' ? Math.max(0, Math.min(3, Math.round(spec.shape.marks))) : 0
  const dx = CLIP_HALF_LENGTH
  const dy = POCKET_OPENING + CATCH - clearance
  const quantum = float32Quantum(Math.max(2 * dx, 2 * dy, POCKET_DEPTH))
  const snapZ = (z: number) => Math.round(z / quantum) * quantum + 0
  const place = (ring: readonly number[]) => snapRing(ring.map((v, k) => v + (k % 2 === 0 ? dx : dy)), quantum)
  const circle = (r: number) => {
    const ring: number[] = []
    for (let k = 0; k < HOLE_SEGMENTS; k++) {
      const a = (2 * Math.PI * (k + 0.5)) / HOLE_SEGMENTS
      ring.push(r * Math.cos(a), r * Math.sin(a))
    }
    return place(ring)
  }
  const outline = (z: number) => place(clipOutlineAt(z, clearance, marks))

  const breaks = [0, returnFaceLow(clearance), BARB_TIP_LOW, BARB_TIP_HIGH, COUNTERSINK_START, CLIP_THICKNESS]
    .filter((z) => z >= 0 && z <= CLIP_THICKNESS)
    .sort((a, b) => a - b)
    .filter((z, i, all) => i === 0 || z - all[i - 1] > 1e-6)
  const slabs: Slab[] = []
  for (let i = 0; i + 1 < breaks.length; i++) {
    const [z0, z1] = [breaks[i], breaks[i + 1]]
    slabs.push({ z0: snapZ(z0), z1: snapZ(z1), outer: [outline(z0), outline(z1)], hole: [circle(holeRadius(z0)), circle(holeRadius(z1))] })
  }
  const top = snapZ(CLIP_THICKNESS)
  const stopTop = snapZ(POCKET_DEPTH)
  const stops = stopRects().map(([x0, y0, x1, y1]) => place(Array.from(ringFromRect(x0, y0, x1, y1))))

  const first = slabs[0]
  const last = slabs[slabs.length - 1]
  if (slabs.some((s) => !(s.z1 > s.z0)) || !(signedArea(first.outer[0]) > 0)) throw new Error(`buildClipMesh: ${spec.id} has a flat slab or a reversed outline`)
  const out = new Faces()
  out.cap(first.outer[0], [first.hole[0]], first.z0, false)
  for (const s of slabs) {
    loftWalls(out, s.outer[0], s.outer[1], s.z0, s.z1, false)
    loftWalls(out, s.hole[0], s.hole[1], s.z0, s.z1, true)
  }
  out.cap(last.outer[1], [last.hole[1], ...stops], top, true)
  for (const stop of stops) {
    loftWalls(out, stop, stop, top, stopTop, false)
    out.cap(stop, [], stopTop, true)
  }
  const mesh = out.done()
  const check = checkMesh(mesh)
  if (!check.closed || !check.manifold || !check.oriented || !(check.volume > 0) || pinchedVertices(mesh) > 0 || componentCount(mesh) !== 1) {
    throw new Error(`buildClipMesh: ${spec.id} did not close into one solid`)
  }
  return mesh
}
