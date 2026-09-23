// The back of a tile solid: the pockets and notches a piece carries and the tabs standing out of it
// (BackFeature, outward or not), checked and turned into flat faces. Every outline is snapped to the piece's
// float32 lattice first, so the faces share whole edges at exactly the same positions (the bottom outline,
// the side-wall chains, the pocket walls, the ledges between levels and the ceilings) and the solid stays
// closed with no T-junction. Pure maths: no DOM, no three.

import type { BackFeature } from '../fixing/types'
import { SIDE_NAMES } from '../sides'
import type { Side } from '../types'
import { pointInRing, reverseRing, ringsTouch, ringSelfIntersects, signedArea, triangulatePolygon } from './polygon'

/** Least plastic left over a pocket's ceiling, mm: a bridge layer plus a few solid layers. */
export const MIN_SKIN_MM = 0.8

/** Least wall between a pocket (not a notch) and the sides of its piece, mm: two perimeters. */
export const MIN_WALL_MM = 0.8

/** A coordinate this close to a side line is on it (feature builders work from the unrounded piece size). */
const SIDE_SNAP_MM = 1e-4

/** One slab of a checked feature: its outline at z0 (`ring`) and at z1 (`top`, the same array when upright). */
export interface SolidLevel {
  ring: Float64Array
  top: Float64Array
  z0: number
  z1: number
}

/** A back feature after snapping and checking; every ring runs counter-clockwise. */
export interface SolidFeature {
  /** Position in the list the piece was given, for error messages. */
  index: number
  role: BackFeature['role']
  side: Side | null
  /** True for material added beyond the side line (a join tab) instead of a cavity cut into the footprint. */
  outward: boolean
  levels: SolidLevel[]
  /** Notches only: per level, the vertex k whose edge k -> k + 1 is the opening on the side line. */
  opening: number[]
}

/** Receives the flat faces of the back: points as [x, y, z, ...], triangles local to them, one normal. */
export interface FaceSink {
  face(points: readonly number[], tris: ArrayLike<number>, normal: readonly [number, number, number]): void
}

/** A vertex of a side wall's bottom chain: `s` along the wall seen from outside, `z` up, and its position. */
export interface ChainPoint {
  s: number
  z: number
  x: number
  y: number
}

/** Twice the signed area of a, b, c (positive counter-clockwise); exact on snapped coordinates. */
const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)

/** Distance along a side, the way the walls measure it (from the corner the wall starts at, seen from outside). */
export function sideS(side: Side, x: number, y: number, w: number, h: number): number {
  return side === 0 ? x : side === 1 ? y : side === 2 ? w - x : h - y
}

/** Is (x, y) on the line of that side? */
const onSideLine = (side: Side, x: number, y: number, w: number, h: number) =>
  side === 0 ? y === 0 : side === 1 ? x === w : side === 2 ? y === h : x === 0

/** How far (x, y) stands beyond that side's line, mm: positive outside the footprint, negative inside. */
const beyondSide = (side: Side, x: number, y: number, w: number, h: number) =>
  side === 0 ? -y : side === 1 ? x - w : side === 2 ? y - h : -x

const sameRing = (a: Float64Array, b: Float64Array) => a.length === b.length && a.every((v, k) => v === b[k])

/** Vertices of `ring` strictly inside the segment a-b, in order from a. */
function pointsOnSegment(ring: Float64Array, ax: number, ay: number, bx: number, by: number): number[] {
  const dx = bx - ax
  const dy = by - ay
  const length2 = dx * dx + dy * dy
  const found: [number, number, number][] = []
  for (let k = 0; k < ring.length; k += 2) {
    const px = ring[k]
    const py = ring[k + 1]
    if (orient(ax, ay, bx, by, px, py) !== 0) continue
    const t = (px - ax) * dx + (py - ay) * dy
    if (t > 0 && t < length2) found.push([t, px, py])
  }
  found.sort((p, q) => p[0] - q[0])
  return found.flatMap(([, x, y]) => [x, y])
}

/** The edges of `ring` cut at every vertex of `other` lying on them, as [ax, ay, bx, by] in ring order. */
function splitEdges(ring: Float64Array, other: Float64Array): number[][] {
  const n = ring.length >> 1
  const out: number[][] = []
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n
    const pts = [ring[2 * k], ring[2 * k + 1]]
    pts.push(...pointsOnSegment(other, ring[2 * k], ring[2 * k + 1], ring[2 * j], ring[2 * j + 1]), ring[2 * j], ring[2 * j + 1])
    for (let p = 0; p + 3 < pts.length; p += 2) out.push([pts[p], pts[p + 1], pts[p + 2], pts[p + 3]])
  }
  return out
}

/** Do the two segments cross at a single point inside both (a proper crossing)? */
function crossesProperly(a: number[], b: number[]): boolean {
  const d1 = orient(a[0], a[1], a[2], a[3], b[0], b[1])
  const d2 = orient(a[0], a[1], a[2], a[3], b[2], b[3])
  const d3 = orient(b[0], b[1], b[2], b[3], a[0], a[1])
  const d4 = orient(b[0], b[1], b[2], b[3], a[2], a[3])
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/**
 * Does `inner` lie inside `outer`, touching its boundary at most along whole stretches of it (both
 * counter-clockwise)? Every piece of inner's boundary, cut at outer's vertices, must stay inside or on outer.
 */
export function ringInside(inner: Float64Array, outer: Float64Array): boolean {
  const parts = splitEdges(inner, outer)
  const walls = splitEdges(outer, inner)
  for (const [ax, ay, bx, by] of parts) {
    if (pointInRing(outer, ax, ay) < 0 || pointInRing(outer, (ax + bx) / 2, (ay + by) / 2) < 0) return false
  }
  for (const a of parts) for (const b of walls) if (crossesProperly(a, b)) return false
  return true
}

/**
 * Boundary of the flat face between two nested outlines, `outer` minus `inner` (both counter-clockwise,
 * inner inside outer): loops counter-clockwise around each piece of face and clockwise around holes. Where
 * the outlines share a stretch of boundary it cancels, so a lip that shares its ends with a wider cavity
 * leaves two strips, and a notch's openings leave only the bits of side line between them. Every vertex of
 * both outlines on the face's boundary is kept, which is what the walls above and below expect.
 */
export function ringDifference(outer: Float64Array, inner: Float64Array): Float64Array[] {
  const key = (x: number, y: number) => `${x},${y}`
  const outerEdges = splitEdges(outer, inner)
  const innerEdges = splitEdges(inner, outer)
  const pending = new Map<string, number[]>()
  innerEdges.forEach((e, k) => {
    const id = `${key(e[0], e[1])}>${key(e[2], e[3])}`
    pending.set(id, [...(pending.get(id) ?? []), k])
  })
  const cancelled = new Uint8Array(innerEdges.length)
  const edges: number[][] = []
  for (const e of outerEdges) {
    const same = pending.get(`${key(e[0], e[1])}>${key(e[2], e[3])}`)
    if (same && same.length) cancelled[same.pop() as number] = 1
    else edges.push(e)
  }
  innerEdges.forEach((e, k) => {
    if (!cancelled[k]) edges.push([e[2], e[3], e[0], e[1]])
  })
  const from = new Map<string, number[]>()
  edges.forEach((e, k) => {
    const id = key(e[0], e[1])
    from.set(id, [...(from.get(id) ?? []), k])
  })
  const seen = new Uint8Array(edges.length)
  /**
   * The edge leaving the end of edge k. Where two pieces of face meet at a vertex (one outline's corner on
   * the other's reflex corner) it has two: the sharpest left turn keeps each loop around its own piece.
   */
  const nextOf = (k: number, first: number): number | undefined => {
    const [px, py, vx, vy] = edges[k]
    const out = (from.get(key(vx, vy)) ?? []).filter((e) => !seen[e] || e === first)
    if (out.length < 2) return out[0]
    const bx = px - vx
    const by = py - vy
    const clockwiseFromBack = (e: number) => {
      const dx = edges[e][2] - vx
      const dy = edges[e][3] - vy
      const angle = Math.atan2(bx * dy - by * dx, bx * dx + by * dy)
      return angle <= 0 ? -angle : 2 * Math.PI - angle
    }
    return out.reduce((best, e) => (clockwiseFromBack(e) < clockwiseFromBack(best) ? e : best))
  }
  const loops: Float64Array[] = []
  for (let first = 0; first < edges.length; first++) {
    if (seen[first]) continue
    const loop: number[] = []
    const visited = new Set<string>()
    let k: number | undefined = first
    while (k !== undefined && !seen[k]) {
      seen[k] = 1
      const id = key(edges[k][0], edges[k][1])
      // A loop through one vertex twice is a face pinched onto itself: no simple outline, no sound solid.
      if (visited.has(id)) throw new Error(`ringDifference: the outlines touch at a single point (${id})`)
      visited.add(id)
      loop.push(edges[k][0], edges[k][1])
      k = nextOf(k, first)
    }
    if (k !== first) throw new Error('ringDifference: the outlines are not nested')
    loops.push(Float64Array.from(loop))
  }
  return loops
}

/** Loops from ringDifference grouped into polygons: each counter-clockwise loop with the holes inside it. */
export function loopsToPolygons(loops: readonly Float64Array[]): { outer: Float64Array; holes: Float64Array[] }[] {
  const outers = loops.filter((l) => signedArea(l) > 0).map((outer) => ({ outer, holes: [] as Float64Array[], area: signedArea(outer) }))
  for (const hole of loops.filter((l) => signedArea(l) < 0)) {
    const owner = outers
      .filter((o) => pointInRing(o.outer, hole[0], hole[1]) === 1)
      .sort((a, b) => a.area - b.area)[0]
    if (!owner) throw new Error('loopsToPolygons: a hole lies in no face')
    owner.holes.push(hole)
  }
  return outers.map(({ outer, holes }) => ({ outer, holes }))
}

/** The feature's outlines, snapped, oriented and checked, or a clear error naming what is wrong. */
function prepareFeature(feature: BackFeature, index: number, w: number, h: number, quantum: number): SolidFeature {
  const side = feature.side
  const outward = feature.outward === true
  const who = `back feature ${index} (${feature.role}${side === null ? '' : `, ${SIDE_NAMES[side]} side`})`
  const fail = (message: string): never => {
    throw new Error(`buildPieceMesh: ${who} ${message}`)
  }
  const snap = (v: number, lines: readonly number[]) => {
    if (!Number.isFinite(v)) fail('has a coordinate that is not a number')
    for (const line of lines) if (Math.abs(v - line) <= SIDE_SNAP_MM) return line
    return Math.round(v / quantum) * quantum + 0 // + 0 turns -0 into 0
  }
  const snapRing = (ring: ArrayLike<number>) => {
    if (ring.length < 6 || ring.length % 2 !== 0) fail('has an outline with fewer than 3 vertices')
    const out = new Float64Array(ring.length)
    for (let k = 0; k < ring.length; k += 2) {
      out[k] = snap(ring[k], [0, w])
      out[k + 1] = snap(ring[k + 1], [0, h])
    }
    const n = out.length >> 1
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n
      if (out[2 * k] === out[2 * j] && out[2 * k + 1] === out[2 * j + 1]) fail('has an outline with a repeated vertex')
    }
    if (signedArea(out) === 0) fail('has an outline with no area')
    if (ringSelfIntersects(out)) fail('has an outline that crosses itself')
    return out
  }

  if (feature.levels.length === 0) fail('has no levels')
  if (outward && side === null) fail('stands outside the footprint with no side to stand on')
  const levels: SolidLevel[] = feature.levels.map((level) => {
    let ring: Float64Array = snapRing(level.ring)
    let top: Float64Array = level.ringTop ? snapRing(level.ringTop) : ring
    if (top.length !== ring.length) fail('lofts between outlines with different vertex counts')
    if (Math.sign(signedArea(top)) !== Math.sign(signedArea(ring))) fail('lofts between outlines running opposite ways')
    if (signedArea(ring) < 0) {
      const upright = top === ring
      ring = reverseRing(ring)
      top = upright ? ring : reverseRing(top)
    }
    const z0 = snap(level.z0, [])
    const z1 = snap(level.z1, [])
    if (!(z1 > z0)) fail(`has a level with no height (${level.z0} to ${level.z1} mm)`)
    return { ring, top, z0, z1 }
  })
  if (levels[0].z0 !== 0) fail(`levels are not stacked: the first starts at ${levels[0].z0} mm, not on the bottom face`)
  for (let k = 1; k < levels.length; k++) {
    if (levels[k].z0 !== levels[k - 1].z1) {
      fail(`levels are not stacked: level ${k} starts at ${levels[k].z0} mm where level ${k - 1} ends at ${levels[k - 1].z1} mm`)
    }
  }

  const opening: number[] = []
  const outlines = levels.flatMap((l) => (l.top === l.ring ? [l.ring] : [l.ring, l.top]))
  if (side === null) {
    for (const ring of outlines) {
      for (let k = 0; k < ring.length; k += 2) {
        if (!(ring[k] > 0 && ring[k] < w && ring[k + 1] > 0 && ring[k + 1] < h)) fail('leaves the footprint (a pocket must stay inside the piece)')
        // The extreme points of an outline towards each side are vertices, so this is the thinnest wall.
        if (Math.min(ring[k], w - ring[k], ring[k + 1], h - ring[k + 1]) < MIN_WALL_MM) fail(`leaves less than ${MIN_WALL_MM} mm of wall to a side`)
      }
    }
  } else {
    const length = side === 0 || side === 2 ? w : h
    const openingOf = (ring: Float64Array) => {
      const n = ring.length >> 1
      const on: number[] = []
      for (let k = 0; k < n; k++) {
        const x = ring[2 * k]
        const y = ring[2 * k + 1]
        if (onSideLine(side, x, y, w, h)) {
          on.push(k)
          continue
        }
        if (outward) {
          // A tab's body stands beyond its own side line, and within the span of that side: the side wall
          // has to step over it and back down again, so both flanks need side line left either side.
          if (!(beyondSide(side, x, y, w, h) > 0)) fail('has a vertex that is not beyond its side (a tab stands outside the footprint)')
          const s = sideS(side, x, y, w, h)
          if (!(s >= MIN_WALL_MM && s <= length - MIN_WALL_MM)) fail(`reaches within ${MIN_WALL_MM} mm of a corner of its side`)
          continue
        }
        if (!(x > 0 && x < w && y > 0 && y < h)) fail('leaves the footprint (only its opening may lie on a side)')
        // Its own side is open anyway; the other three keep a wall.
        const walls = [y, w - x, h - y, x].filter((_, s) => s !== side)
        if (Math.min(...walls) < MIN_WALL_MM) fail(`leaves less than ${MIN_WALL_MM} mm of wall to another side`)
      }
      if (on.length !== 2) fail(`does not touch its side along one edge (${on.length} vertices on the side line, 2 needed)`)
      const k = (on[0] + 1) % n === on[1] ? on[0] : (on[1] + 1) % n === on[0] ? on[1] : fail('does not touch its side along one edge')
      const j = (k + 1) % n
      const sa = sideS(side, ring[2 * k], ring[2 * k + 1], w, h)
      const sb = sideS(side, ring[2 * j], ring[2 * j + 1], w, h)
      // Counter-clockwise, a cavity's opening edge runs along its side with s rising; added material, being
      // on the other hand of the same line, runs the other way. That sign is the whole difference.
      if (outward ? !(sa > sb) : !(sa < sb)) fail('opens onto its side the wrong way round')
      const [low, high] = outward ? [sb, sa] : [sa, sb]
      if (!(low > 0 && high < length)) fail('reaches a corner of the piece (a notch must open within its side)')
      return k
    }
    for (const level of levels) {
      const k = openingOf(level.ring)
      if (level.top !== level.ring && openingOf(level.top) !== k) fail('lofts its opening onto a different edge')
      opening.push(k)
    }
  }

  // Consecutive outlines are the same or nested; a notch may only narrow along its side going up.
  const sOf = (ring: Float64Array, k: number) => sideS(side as Side, ring[2 * k], ring[2 * k + 1], w, h)
  const n = (ring: Float64Array) => ring.length >> 1
  // A tab's opening edge runs the other way, so its ends swap: the same "upper span inside lower span" rule.
  const narrows = (a: Float64Array, ka: number, b: Float64Array, kb: number) =>
    outward
      ? sOf(a, ka) >= sOf(b, kb) && sOf(a, (ka + 1) % n(a)) <= sOf(b, (kb + 1) % n(b))
      : sOf(a, ka) <= sOf(b, kb) && sOf(a, (ka + 1) % n(a)) >= sOf(b, (kb + 1) % n(b))
  for (let k = 0; k < levels.length; k++) {
    const level = levels[k]
    if (side !== null && !narrows(level.ring, opening[k], level.top, opening[k])) {
      fail('widens along its side going up (the side wall would be undercut)')
    }
    if (k === 0) continue
    const below = levels[k - 1].top
    const above = level.ring
    if (sameRing(below, above)) continue
    const grows = signedArea(above) > signedArea(below)
    if (!(grows ? ringInside(below, above) : ringInside(above, below))) {
      fail(`levels are not stacked: level ${k} is neither inside nor around the level below`)
    }
    if (side !== null && !narrows(below, opening[k - 1], above, opening[k])) {
      fail('widens along its side going up (the side wall would be undercut)')
    }
  }
  return { index, role: feature.role, side, outward, levels, opening }
}

/** Do two checked features share any point, level by level where their heights overlap? */
function featuresMeet(a: SolidFeature, b: SolidFeature): boolean {
  const ba = featureBounds(a)
  const bb = featureBounds(b)
  // Most features sit far apart: the outline tests below are quadratic, the boxes are not.
  if (ba.minX > bb.maxX || bb.minX > ba.maxX || ba.minY > bb.maxY || bb.minY > ba.maxY) return false
  for (const la of a.levels) {
    for (const lb of b.levels) {
      if (la.z0 > lb.z1 || lb.z0 > la.z1) continue
      for (const ra of [la.ring, la.top]) {
        for (const rb of [lb.ring, lb.top]) {
          if (ringsTouch(ra, rb)) return true
          if (pointInRing(rb, ra[0], ra[1]) >= 0 || pointInRing(ra, rb[0], rb[1]) >= 0) return true
        }
      }
    }
  }
  return false
}

/**
 * Snaps and checks the features of a w x h piece (w and h float32 values): outlines on the `quantum`
 * lattice, or exactly on a side line within 1e-4 mm of it; levels stacked from z = 0 with nested outlines;
 * a pocket strictly inside the footprint; a notch touching its own side along exactly one edge, within the
 * side, and never widening along it going up; an outward feature (a tab) standing wholly beyond its side
 * line instead, its root the one edge on it and wound the other way round; no two features touching. Throws
 * a clear error otherwise, so a feature bug fails a test instead of shipping a broken file. The skin over a
 * ceiling, and the rim over a tab, are checked by the mesher, which has the top surface.
 */
export function prepareFeatures(features: readonly BackFeature[], w: number, h: number, quantum: number): SolidFeature[] {
  const out = features.map((f, i) => prepareFeature(f, i, w, h, quantum))
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      if (featuresMeet(out[i], out[j])) throw new Error(`buildPieceMesh: back features ${i} (${out[i].role}) and ${j} (${out[j].role}) touch`)
    }
  }
  return out
}

/** Bounding box of every outline of a feature, mm. */
export function featureBounds(feature: SolidFeature): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const level of feature.levels) {
    for (const ring of [level.ring, level.top]) {
      for (let k = 0; k < ring.length; k += 2) {
        minX = Math.min(minX, ring[k])
        maxX = Math.max(maxX, ring[k])
        minY = Math.min(minY, ring[k + 1])
        maxY = Math.max(maxY, ring[k + 1])
      }
    }
  }
  return { minX, minY, maxX, maxY }
}

/** Height of a feature's ceiling, mm. */
export const ceilingOf = (feature: SolidFeature): number => feature.levels[feature.levels.length - 1].z1

/**
 * The bottom face (z = 0) of a w x h piece: the footprint, counter-clockwise from (0, 0), with every notch's
 * z = 0 outline cut into it, every tab's detoured around the outside, and every pocket's z = 0 outline as a
 * hole. A notch is walked backwards from the opening's start, a tab forwards from its end: either way the
 * outline enters the ring at the opening vertex with the smaller s and leaves at the larger one.
 */
export function bottomOutline(features: readonly SolidFeature[], w: number, h: number): { outer: Float64Array; holes: Float64Array[] } {
  const corners = [0, 0, w, 0, w, h, 0, h]
  const outer: number[] = []
  for (let side = 0; side < 4; side++) {
    outer.push(corners[2 * side], corners[2 * side + 1])
    const notches = features
      .filter((f) => f.side === side)
      .map((f) => {
        const ring = f.levels[0].ring
        const n = ring.length >> 1
        const k = f.opening[0]
        // Where the outline joins the ring, and which way round it then walks.
        const start = f.outward ? (k + 1) % n : k
        return { ring, n, start, step: f.outward ? 1 : -1, entry: sideS(side as Side, ring[2 * start], ring[2 * start + 1], w, h) }
      })
      .sort((a, b) => a.entry - b.entry)
    for (const { ring, n, start, step } of notches) {
      for (let k = 0; k < n; k++) {
        const v = (((start + step * k) % n) + n) % n
        outer.push(ring[2 * v], ring[2 * v + 1])
      }
    }
  }
  const holes = features.filter((f) => f.side === null).map((f) => f.levels[0].ring)
  return { outer: Float64Array.from(outer), holes }
}

/**
 * Bottom chain of a side wall that notches open onto, from s = 0 to the side's length: the corner, then for
 * each notch its left profile up (level by level, a loft giving a sloped step), across its ceiling, and its
 * right profile back down, then the far corner. Null when no notch opens onto that side. A tab on that side
 * gives exactly the same chain: over its span the side plane is inside the solid, so there is no wall below
 * its top either, and only which opening vertex is the rising flank differs.
 */
export function notchChain(features: readonly SolidFeature[], side: Side, w: number, h: number): ChainPoint[] | null {
  const notches = features.filter((f) => f.side === side)
  if (notches.length === 0) return null
  const point = (ring: Float64Array, k: number, z: number): ChainPoint => ({
    s: sideS(side, ring[2 * k], ring[2 * k + 1], w, h),
    z,
    x: ring[2 * k],
    y: ring[2 * k + 1],
  })
  const push = (chain: ChainPoint[], p: ChainPoint) => {
    const last = chain[chain.length - 1]
    if (!last || last.s !== p.s || last.z !== p.z) chain.push(p)
  }
  const profiles = notches.map((f) => {
    const left: ChainPoint[] = []
    const right: ChainPoint[] = []
    f.levels.forEach((level, k) => {
      const n = level.ring.length >> 1
      const o = f.opening[k]
      // The flank the chain rises at is the opening vertex with the smaller s, which a tab's edge reaches last.
      const a = f.outward ? (o + 1) % n : o
      const b = f.outward ? o : (o + 1) % n
      push(left, point(level.ring, a, level.z0))
      push(left, point(level.top, a, level.z1))
      right.unshift(point(level.top, b, level.z1), point(level.ring, b, level.z0))
    })
    const chain = left.slice()
    for (const p of right) push(chain, p)
    return chain
  })
  profiles.sort((a, b) => a[0].s - b[0].s)
  const length = side === 0 || side === 2 ? w : h
  const corners: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ]
  const [x0, y0] = corners[side]
  const [x1, y1] = corners[(side + 1) % 4]
  return [{ s: 0, z: 0, x: x0, y: y0 }, ...profiles.flat(), { s: length, z: 0, x: x1, y: y1 }]
}

/** Unit Newell normal of a planar polygon of xyz points. */
function newell(points: readonly number[]): [number, number, number] {
  let x = 0
  let y = 0
  let z = 0
  const n = points.length / 3
  for (let k = 0; k < n; k++) {
    const a = 3 * k
    const b = 3 * ((k + 1) % n)
    x += (points[a + 1] - points[b + 1]) * (points[a + 2] + points[b + 2])
    y += (points[a + 2] - points[b + 2]) * (points[a] + points[b])
    z += (points[a] - points[b]) * (points[a + 1] + points[b + 1])
  }
  const len = Math.hypot(x, y, z) || 1
  return [x / len, y / len, z / len]
}

/** A flat face over one or more rings at height z, facing up or down. */
function flatFace(sink: FaceSink, outer: Float64Array, holes: readonly Float64Array[], z: number, up: boolean): void {
  const tris = triangulatePolygon(outer, holes)
  if (!up) for (let t = 0; t < tris.length; t += 3) [tris[t + 1], tris[t + 2]] = [tris[t + 2], tris[t + 1]]
  const points: number[] = []
  for (const ring of [outer, ...holes]) for (let k = 0; k < ring.length; k += 2) points.push(ring[k], ring[k + 1], z)
  sink.face(points, tris, [0, 0, up ? 1 : -1])
}

/**
 * One wall of a pocket level: the ring edge from vertex e to e + 1 at z0 up to the top outline's edge at
 * z1, facing into the cavity, with every vertex a neighbouring face puts on its bottom or top edge (the
 * level below or above where they share a stretch). Both edges are straight, so a zig-zag between them in
 * order along each is a valid fan of the convex face.
 */
function wallFace(sink: FaceSink, level: SolidLevel, e: number, below: Float64Array | null, above: Float64Array | null, outward = false): void {
  const { ring, top, z0, z1 } = level
  const n = ring.length >> 1
  const f = (e + 1) % n
  const chain = (r: Float64Array, other: Float64Array | null) => {
    const ax = r[2 * e]
    const ay = r[2 * e + 1]
    const bx = r[2 * f]
    const by = r[2 * f + 1]
    const pts = [ax, ay, ...(other ? pointsOnSegment(other, ax, ay, bx, by) : []), bx, by]
    const dx = bx - ax
    const dy = by - ay
    const length2 = dx * dx + dy * dy
    const t = pts.filter((_, k) => k % 2 === 0).map((x, k) => ((x - ax) * dx + (pts[2 * k + 1] - ay) * dy) / length2)
    return { pts, t }
  }
  const bottom = chain(ring, below)
  const upper = chain(top, above)
  const m = bottom.t.length
  const points: number[] = []
  for (let k = 0; k < m; k++) points.push(bottom.pts[2 * k], bottom.pts[2 * k + 1], z0)
  for (let k = 0; k < upper.t.length; k++) points.push(upper.pts[2 * k], upper.pts[2 * k + 1], z1)
  const tris: number[] = []
  let p = 0
  let q = 0
  while (p + 1 < m || q + 1 < upper.t.length) {
    const advanceBottom = q + 1 >= upper.t.length || (p + 1 < m && bottom.t[p + 1] <= upper.t[q + 1])
    // Counter-clockwise seen from inside the cavity: along the edge runs right to left there.
    if (advanceBottom) {
      tris.push(p, m + q, p + 1)
      p++
    } else {
      tris.push(p, m + q, m + q + 1)
      q++
    }
  }
  const quad = [ring[2 * f], ring[2 * f + 1], z0, ring[2 * e], ring[2 * e + 1], z0, top[2 * e], top[2 * e + 1], z1, top[2 * f], top[2 * f + 1], z1]
  // Added material fills the ring instead of leaving it empty, so every wall of a tab faces the other way.
  if (outward) for (let t = 0; t < tris.length; t += 3) [tris[t + 1], tris[t + 2]] = [tris[t + 2], tris[t + 1]]
  const [nx, ny, nz] = newell(quad)
  sink.face(points, tris, outward ? [-nx, -ny, -nz] : [nx, ny, nz])
}

/**
 * Every face a checked feature adds to the solid: per level one wall per ring edge (the opening skipped, on
 * a tab as on a notch: the side wall carries it), the flat ledge between two levels whose outlines differ
 * (facing down where the cavity narrows going up, up where it widens), and the flat ceiling of the last
 * level. A tab's faces are the same rings wound the other way: its walls look out of the material instead
 * of into the cavity, and its last level ends in a top looking up rather than a ceiling looking down.
 */
export function emitFeatureFaces(sink: FaceSink, feature: SolidFeature): void {
  const { levels, outward } = feature
  levels.forEach((level, k) => {
    const n = level.ring.length >> 1
    const below = k > 0 ? levels[k - 1].top : null
    const above = k + 1 < levels.length ? levels[k + 1].ring : null
    for (let e = 0; e < n; e++) {
      if (feature.side !== null && e === feature.opening[k]) continue
      wallFace(sink, level, e, below, above, outward)
    }
    if (above && !sameRing(level.top, above)) {
      const up = signedArea(above) > signedArea(level.top)
      const loops = up ? ringDifference(above, level.top) : ringDifference(level.top, above)
      // A tab's step is the same ring on the other hand of it: where a cavity's ledge looks down, a tab's looks up.
      for (const { outer, holes } of loopsToPolygons(loops)) flatFace(sink, outer, holes, level.z1, outward ? !up : up)
    }
  })
  const last = levels[levels.length - 1]
  // A cavity ends in a ceiling looking down; a tab ends in its own top, looking up.
  flatFace(sink, last.top, [], last.z1, outward)
}

/** The bottom face at z = 0, facing down: the footprint with every notch cut in and every tab added, and every pocket's mouth as a hole. */
export function emitBottom(sink: FaceSink, features: readonly SolidFeature[], w: number, h: number): void {
  const { outer, holes } = bottomOutline(features, w, h)
  flatFace(sink, outer, holes, 0, false)
}
