// Closed solids made of flat outlines, for the parts printed beside the tiles (keys, and any prism with slots).
// Every accessory is a prism or a loft of 2D rings, never general CSG, so each builder here knows its faces
// in advance: flat faces with their own duplicated vertices (one flat normal per face), shared corners at
// exactly the same float32 positions, and no T-junction anywhere, which is what STL slicers and the STEP
// writer's coplanar merge both need.

import type { MeshData } from '../types'
import { float32Quantum } from './grid'
import { checkMesh, componentCount, pinchedVertices } from './meshChecks'
import { pointInRing, reverseRing, ringSelfIntersects, ringsTouch, signedArea, snapRing, triangulatePolygon } from './polygon'

/** Grows flat per-face vertex, normal and index lists. */
class FaceBuilder {
  private positions: number[] = []
  private normals: number[] = []
  private indices: number[] = []

  /** One flat face: `points` as [x, y, z, ...], `tris` local to them, all sharing `normal`. */
  face(points: readonly number[], tris: ArrayLike<number>, normal: readonly [number, number, number]): void {
    const base = this.positions.length / 3
    for (let k = 0; k < points.length; k += 3) {
      this.positions.push(points[k], points[k + 1], points[k + 2])
      this.normals.push(normal[0], normal[1], normal[2])
    }
    for (let k = 0; k < tris.length; k++) this.indices.push(base + tris[k])
  }

  /** A quad a, b, c, d (counter-clockwise seen from outside), split along its shorter diagonal. */
  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]): void {
    const n = newell([a, b, c, d])
    const ac = (a[0] - c[0]) ** 2 + (a[1] - c[1]) ** 2 + (a[2] - c[2]) ** 2
    const bd = (b[0] - d[0]) ** 2 + (b[1] - d[1]) ** 2 + (b[2] - d[2]) ** 2
    this.face([...a, ...b, ...c, ...d], ac <= bd ? [0, 1, 2, 0, 2, 3] : [0, 1, 3, 1, 2, 3], n)
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

/** Unit Newell normal of a planar (or nearly planar) polygon given as xyz points. */
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

/** Throws unless the mesh is one closed, 2-manifold (at every edge and every vertex), outward solid. */
function assertSolid(mesh: MeshData, who: string, hint: string): void {
  const check = checkMesh(mesh)
  if (!check.closed || !check.manifold || !check.oriented || !(check.volume > 0) || pinchedVertices(mesh) > 0) {
    throw new Error(`${who}: ${hint}`)
  }
  if (componentCount(mesh) !== 1) throw new Error(`${who}: the result falls apart in several pieces (${hint})`)
}

export interface LoftSection {
  /** Height of this outline, mm. */
  z: number
  /** Outline at that height, an xy ring (any orientation, the same for every section). */
  ring: ArrayLike<number>
}

/**
 * A closed solid stacked from outlines at rising heights, bottom face at the first section, top face at the
 * last. Between two sections at different heights the outlines are lofted vertex to vertex (so they need
 * the same vertex count): the same ring twice is a prism, a smaller ring above is a chamfer. Two sections
 * at the same height are a flat step between two nested outlines (any vertex counts): a ledge facing up
 * where the outline shrinks, an overhang facing down where it grows. Coordinates are snapped to the
 * float32 lattice of the part's size first, so every face is exactly planar where it should be and the
 * triangulation is exact. Flat normals, outward, `topIndexCount` 0, no uvs.
 */
export function loftSolid(sections: readonly LoftSection[]): MeshData {
  if (sections.length < 2) throw new Error('loftSolid: need two sections')
  let extent = 0
  for (const s of sections) {
    extent = Math.max(extent, Math.abs(s.z))
    for (let k = 0; k < s.ring.length; k++) extent = Math.max(extent, Math.abs(s.ring[k]))
  }
  if (!Number.isFinite(extent)) throw new Error('loftSolid: non-finite coordinate')
  const quantum = float32Quantum(extent)
  const zs = sections.map((s) => Math.round(s.z / quantum) * quantum + 0)
  let rings = sections.map((s) => snapRing(s.ring, quantum))
  const areas = rings.map((r) => signedArea(r))
  if (areas.some((a) => a === 0)) throw new Error('loftSolid: an outline has no area')
  if (areas.every((a) => a < 0)) rings = rings.map((r) => reverseRing(r))
  else if (areas.some((a) => a < 0)) throw new Error('loftSolid: outlines must all run the same way')
  for (const r of rings) {
    if (r.length < 6) throw new Error('loftSolid: an outline needs 3 vertices')
    if (ringSelfIntersects(r)) throw new Error('loftSolid: an outline crosses itself')
  }
  for (let i = 1; i < zs.length; i++) if (zs[i] < zs[i - 1]) throw new Error('loftSolid: sections must rise')
  if (!(zs[zs.length - 1] > zs[0])) throw new Error('loftSolid: the solid has no height')

  const out = new FaceBuilder()
  const cap = (ring: Float64Array, z: number, up: boolean, holes: Float64Array[] = []) => {
    const tris = triangulatePolygon(ring, holes)
    if (!up) for (let t = 0; t < tris.length; t += 3) [tris[t + 1], tris[t + 2]] = [tris[t + 2], tris[t + 1]]
    const points: number[] = []
    for (const r of [ring, ...holes]) for (let k = 0; k < r.length; k += 2) points.push(r[k], r[k + 1], z)
    out.face(points, tris, [0, 0, up ? 1 : -1])
  }

  cap(rings[0], zs[0], false)
  for (let i = 0; i + 1 < rings.length; i++) {
    const lower = rings[i]
    const upper = rings[i + 1]
    if (zs[i] === zs[i + 1]) {
      // A flat step: the larger outline with the smaller one as its hole.
      const shrinks = signedArea(lower) > signedArea(upper)
      const outer = shrinks ? lower : upper
      const inner = shrinks ? upper : lower
      for (let k = 0; k < inner.length; k += 2) {
        if (pointInRing(outer, inner[k], inner[k + 1]) !== 1) throw new Error('loftSolid: a step must nest one outline strictly inside the other')
      }
      if (ringsTouch(outer, inner)) throw new Error('loftSolid: a step must nest one outline strictly inside the other')
      cap(outer, zs[i], shrinks, [reverseRing(inner)])
      continue
    }
    if (lower.length !== upper.length) throw new Error('loftSolid: lofted outlines need the same vertex count')
    const n = lower.length >> 1
    const z0 = zs[i]
    const z1 = zs[i + 1]
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n
      out.quad(
        [lower[2 * k], lower[2 * k + 1], z0],
        [lower[2 * j], lower[2 * j + 1], z0],
        [upper[2 * j], upper[2 * j + 1], z1],
        [upper[2 * k], upper[2 * k + 1], z1],
      )
    }
  }
  cap(rings[rings.length - 1], zs[zs.length - 1], true)
  const mesh = out.done()
  assertSolid(mesh, 'loftSolid', 'an outline collapses on the float32 grid or the loft turns inside out')
  return mesh
}

/** A box removed from an extruded profile: x along the extrusion, y and z in the profile's plane. */
export interface ProfileCut {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
}

/** Region ids in the profile's plane: a cell of a cut band, the rest of the profile, or outside it. */
const REST = -1
const OUTSIDE = -2

interface Strip {
  y0: number
  y1: number
  lo: number
  hi: number
  first: boolean
  last: boolean
  /** The z levels crossing this strip, lo first and hi last; cell k spans levels[k]..levels[k + 1]. */
  levels: number[]
  /** Id of the strip's first cell. */
  cell0: number
}

/** A straight piece of boundary between two regions of the profile plane, from a to b. */
interface PlaneEdge {
  ay: number
  az: number
  by: number
  bz: number
  /** Region on the left of a -> b (seen from +x, y right and z up), then on the right. */
  left: number
  right: number
}

/**
 * A profile extruded with slots: `profile` (a ring in the y-z plane, counter-clockwise seen from +x, either
 * way is accepted) extruded along x from 0 to `length`, with boxes cut out of it (slots through the floor,
 * recesses for screw heads). No part of today's wall uses it (the clip, which needs a round countersunk hole,
 * has its own mesher in fixing/mount.ts); the STEP writer's tests still exercise it.
 *
 * Method: the y ranges of the cuts, merged into bands, split the profile into strips at every cut bound
 * and every profile vertex inside a band. Inside a band the profile must be one plain bar per strip, a
 * horizontal bottom edge and a horizontal top edge (checked, otherwise it throws), so every strip is a
 * rectangle; all strips are then cut into cells at one shared set of z levels (every cut's z bounds and
 * every strip's floor and roof), and the extrusion into intervals at every cut's x bounds. A cell is
 * removed over an interval when a cut covers both; the rest of the profile always stays. The solid's
 * faces are then exactly: the two end caps (the whole profile, cuts must end inside the length), a side
 * face for every boundary piece between a kept and a removed (or outside) region in every interval, and a
 * cross face for every cell that is kept on one side of an interval bound and removed on the other.
 * Because every face uses the one shared grid of y, z and x values, neighbours share whole edges: the
 * output is closed and 2-manifold with no T-junction. Cuts that would pinch the solid (touching only along
 * an edge or a corner) or seal a void inside it are refused with an error, never written.
 */
export function extrudeProfileX(
  profile: ArrayLike<number>,
  length: number,
  options: { cuts?: readonly ProfileCut[] } = {},
): MeshData {
  const who = 'extrudeProfileX'
  const rawCuts = options.cuts ?? []
  let extent = Math.abs(length)
  for (let k = 0; k < profile.length; k++) extent = Math.max(extent, Math.abs(profile[k]))
  for (const c of rawCuts) extent = Math.max(extent, Math.abs(c.x0), Math.abs(c.x1), Math.abs(c.y0), Math.abs(c.y1), Math.abs(c.z0), Math.abs(c.z1))
  if (!Number.isFinite(extent)) throw new Error(`${who}: non-finite coordinate`)
  const quantum = float32Quantum(extent)
  const snap = (v: number) => Math.round(v / quantum) * quantum + 0
  const L = snap(length)
  if (!(L > 0)) throw new Error(`${who}: length must be positive`)
  let ring = snapRing(profile, quantum)
  const area = signedArea(ring)
  if (ring.length < 6 || area === 0) throw new Error(`${who}: the profile has no area`)
  if (area < 0) ring = reverseRing(ring)
  if (ringSelfIntersects(ring)) throw new Error(`${who}: the profile crosses itself`)
  const P = ring.length >> 1
  const Y = (k: number) => ring[2 * (k % P)]
  const Z = (k: number) => ring[2 * (k % P) + 1]

  const cuts = rawCuts.map((c) => ({ x0: snap(c.x0), x1: snap(c.x1), y0: snap(c.y0), y1: snap(c.y1), z0: snap(c.z0), z1: snap(c.z1) }))
  for (const c of cuts) {
    if (!(c.x0 < c.x1 && c.y0 < c.y1 && c.z0 < c.z1)) throw new Error(`${who}: a cut has an empty range`)
    if (!(c.x0 > 0 && c.x1 < L)) throw new Error(`${who}: a cut must end inside the length (0 < x0 < x1 < ${L}); cuts through the ends are not supported`)
  }

  // Bands: the cut y ranges merged where they overlap or touch.
  const bands: [number, number][] = []
  for (const [y0, y1] of cuts.map((c) => [c.y0, c.y1] as [number, number]).sort((a, b) => a[0] - b[0])) {
    const last = bands[bands.length - 1]
    if (last && y0 <= last[1]) last[1] = Math.max(last[1], y1)
    else bands.push([y0, y1])
  }

  // Strips, each checked to be a plain bar of the profile.
  const strips: Strip[] = []
  const zLevels = new Set<number>()
  for (const [a, b] of bands) {
    const ys = new Set<number>([a, b])
    for (const c of cuts) {
      if (c.y0 > a && c.y0 < b) ys.add(c.y0)
      if (c.y1 > a && c.y1 < b) ys.add(c.y1)
    }
    for (let k = 0; k < P; k++) {
      if (Y(k) > a && Y(k) < b) ys.add(Y(k))
      if (Y(k) >= a && Y(k) <= b) zLevels.add(Z(k))
    }
    const bounds = [...ys].sort((p, q) => p - q)
    for (let s = 0; s + 1 < bounds.length; s++) {
      const u = bounds[s]
      const w = bounds[s + 1]
      let lo = NaN
      let hi = NaN
      let crossings = 0
      for (let k = 0; k < P; k++) {
        const ya = Y(k)
        const yb = Y(k + 1)
        if (Math.min(ya, yb) >= w || Math.max(ya, yb) <= u) continue
        crossings++
        if (Z(k) !== Z(k + 1)) crossings = 99
        else if (yb > ya) lo = Z(k)
        else hi = Z(k)
      }
      if (crossings !== 2 || !(lo < hi)) {
        throw new Error(`${who}: a cut spans y ${u} to ${w}, where the profile is not one bar with a flat floor and a flat top`)
      }
      zLevels.add(lo)
      zLevels.add(hi)
      strips.push({ y0: u, y1: w, lo, hi, first: s === 0, last: s + 2 === bounds.length, levels: [], cell0: 0 })
    }
  }
  for (const c of cuts) {
    zLevels.add(c.z0)
    zLevels.add(c.z1)
  }
  const levels = [...zLevels].sort((p, q) => p - q)
  let cellCount = 0
  const cellStrip: number[] = []
  const cellZ: [number, number][] = []
  strips.forEach((strip, j) => {
    strip.levels = levels.filter((z) => z >= strip.lo && z <= strip.hi)
    strip.cell0 = cellCount
    for (let k = 0; k + 1 < strip.levels.length; k++) {
      cellStrip.push(j)
      cellZ.push([strip.levels[k], strip.levels[k + 1]])
    }
    cellCount += strip.levels.length - 1
  })
  const cellAt = (j: number, z0: number) => strips[j].cell0 + strips[j].levels.indexOf(z0)

  // Extrusion intervals and the cells each cut removes from them.
  const xs = [...new Set<number>([0, L, ...cuts.flatMap((c) => [c.x0, c.x1])])].sort((p, q) => p - q)
  const M = xs.length - 1
  const removed = new Uint8Array(cellCount * M)
  for (const c of cuts) {
    for (const strip of strips) {
      if (strip.y0 < c.y0 || strip.y1 > c.y1) continue
      let hits = 0
      for (let k = 0; k + 1 < strip.levels.length; k++) {
        if (strip.levels[k] < c.z0 || strip.levels[k + 1] > c.z1) continue
        hits++
        for (let m = 0; m < M; m++) if (xs[m] >= c.x0 && xs[m + 1] <= c.x1) removed[(strip.cell0 + k) * M + m] = 1
      }
      if (hits === 0) throw new Error(`${who}: a cut's z range misses the profile at y ${strip.y0} to ${strip.y1}`)
    }
  }
  const kept = (region: number, m: number) => region === REST || (region >= 0 && removed[region * M + m] === 0)

  // Every cell corner is a vertex of the shared grid; the profile outline carries the ones on it.
  const corners = new Map<string, [number, number]>()
  for (const strip of strips) {
    for (const z of strip.levels) {
      corners.set(`${strip.y0},${z}`, [strip.y0, z])
      corners.set(`${strip.y1},${z}`, [strip.y1, z])
    }
  }
  const outline: number[] = []
  const edges: PlaneEdge[] = []
  const insideOf = (ay: number, az: number, by: number, bz: number): number => {
    if (az === bz) {
      const j = strips.findIndex((s) => s.y0 <= Math.min(ay, by) && Math.max(ay, by) <= s.y1)
      if (j < 0) return REST
      const s = strips[j]
      return by > ay ? cellAt(j, s.lo) : cellAt(j, s.levels[s.levels.length - 2])
    }
    if (ay === by) {
      const up = bz > az
      const zLow = Math.min(az, bz)
      const zHigh = Math.max(az, bz)
      // Going up, the inside is towards -y (a strip ending here); going down, towards +y.
      const j = strips.findIndex((s) => (up ? s.y1 === ay : s.y0 === ay) && s.lo <= zLow && zHigh <= s.hi)
      return j < 0 ? REST : cellAt(j, zLow)
    }
    return REST
  }
  const boundaryKeys = new Set<string>()
  for (let k = 0; k < P; k++) {
    const ay = Y(k)
    const az = Z(k)
    const by = Y(k + 1)
    const bz = Z(k + 1)
    const dy = by - ay
    const dz = bz - az
    const on: [number, number, number][] = []
    for (const [py, pz] of corners.values()) {
      if ((py === ay && pz === az) || (py === by && pz === bz)) continue
      if (dy * (pz - az) - dz * (py - ay) !== 0) continue
      const t = (py - ay) * dy + (pz - az) * dz
      if (t > 0 && t < dy * dy + dz * dz) on.push([t, py, pz])
    }
    on.sort((p, q) => p[0] - q[0])
    const chain: [number, number][] = [[ay, az], ...on.map(([, py, pz]) => [py, pz] as [number, number]), [by, bz]]
    for (let q = 0; q + 1 < chain.length; q++) {
      const [sy, sz] = chain[q]
      const [ey, ez] = chain[q + 1]
      outline.push(sy, sz)
      boundaryKeys.add(`${sy},${sz},${ey},${ez}`)
      edges.push({ ay: sy, az: sz, by: ey, bz: ez, left: insideOf(sy, sz, ey, ez), right: OUTSIDE })
    }
  }

  strips.forEach((strip, j) => {
    const n = strip.levels.length
    // Floors between stacked cells.
    for (let k = 1; k + 1 < n; k++) {
      const z = strip.levels[k]
      edges.push({ ay: strip.y0, az: z, by: strip.y1, bz: z, left: strip.cell0 + k, right: strip.cell0 + k - 1 })
    }
    for (let k = 0; k + 1 < n; k++) {
      const z0 = strip.levels[k]
      const z1 = strip.levels[k + 1]
      const cell = strip.cell0 + k
      // Where a band starts or ends, the rest of the profile lies beyond unless the outline runs there.
      if (strip.first && !boundaryKeys.has(`${strip.y0},${z1},${strip.y0},${z0}`)) {
        edges.push({ ay: strip.y0, az: z0, by: strip.y0, bz: z1, left: REST, right: cell })
      }
      if (strip.last && !boundaryKeys.has(`${strip.y1},${z0},${strip.y1},${z1}`)) {
        edges.push({ ay: strip.y1, az: z0, by: strip.y1, bz: z1, left: cell, right: REST })
      }
      // Between two strips of one band, where both have this cell.
      const next = strips[j + 1]
      if (!strip.last && next && z0 >= next.lo && z1 <= next.hi) {
        edges.push({ ay: strip.y1, az: z0, by: strip.y1, bz: z1, left: cell, right: cellAt(j + 1, z0) })
      }
    }
  })

  const out = new FaceBuilder()
  // End caps: the whole profile, its outline carrying every grid vertex that lies on it.
  const capTris = triangulatePolygon(outline)
  const capAt = (x: number, facing: 1 | -1) => {
    const points: number[] = []
    for (let k = 0; k < outline.length; k += 2) points.push(x, outline[k], outline[k + 1])
    const tris = Uint32Array.from(capTris)
    if (facing < 0) for (let t = 0; t < tris.length; t += 3) [tris[t + 1], tris[t + 2]] = [tris[t + 2], tris[t + 1]]
    out.face(points, tris, [facing, 0, 0])
  }
  capAt(0, -1)
  capAt(L, 1)

  // Side faces, one per boundary piece and interval, facing from the kept region into the other one.
  for (const e of edges) {
    for (let m = 0; m < M; m++) {
      const keptLeft = kept(e.left, m)
      if (keptLeft === kept(e.right, m)) continue
      const [ay, az, by, bz] = keptLeft ? [e.ay, e.az, e.by, e.bz] : [e.by, e.bz, e.ay, e.az]
      const len = Math.hypot(by - ay, bz - az)
      const x0 = xs[m]
      const x1 = xs[m + 1]
      out.face([x0, ay, az, x0, by, bz, x1, by, bz, x1, ay, az], [0, 1, 2, 0, 2, 3], [0, (bz - az) / len, -(by - ay) / len])
    }
  }

  // Cross faces where a cell starts or stops being removed.
  for (let m = 1; m < M; m++) {
    const x = xs[m]
    for (let cell = 0; cell < cellCount; cell++) {
      const before = kept(cell, m - 1)
      if (before === kept(cell, m)) continue
      const strip = strips[cellStrip[cell]]
      const [z0, z1] = cellZ[cell]
      // Material before x ends here (faces +x), or material after x starts here (faces -x).
      const points = [x, strip.y0, z0, x, strip.y1, z0, x, strip.y1, z1, x, strip.y0, z1]
      out.face(points, before ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2], [before ? 1 : -1, 0, 0])
    }
  }

  const mesh = out.done()
  assertSolid(mesh, who, 'cuts that meet only along an edge or at a corner pinch the solid, and a cut sealed inside it leaves a void; move them apart or merge them')
  return mesh
}
