// Watertight solid for one printable piece: textured top, four side walls, flat bottom at z = 0, the key
// notches and clip pockets cut up into its back, and any tab standing out past one side (see solid.ts).

import { pieceFeatures } from '../fixing/features'
import type { BackFeature } from '../fixing/types'
import type { HeightField } from '../textures/types'
import type { DesignConfig, ExportQuality, MeshData, PieceSpec, Side } from '../types'
import { triangulateTop } from './adaptive'
import { axisLines, float32Quantum, sampleGrid } from './grid'
import { pieceTopSampler } from './heightfield'
import { pieceAxisBreaks } from './profiles'
import {
  ceilingOf,
  emitBottom,
  emitFeatureFaces,
  featureBounds,
  MIN_SKIN_MM,
  notchChain,
  prepareFeatures,
  type FaceSink,
  type SolidFeature,
} from './solid'
import { triangulateNotchedWall, triangulateWall } from './walls'

export interface PieceMeshOptions {
  cellMm: number
  adaptive?: { toleranceMm: number }
}

/** Top-grid spacing of exported STL meshes, per quality. */
export const QUALITY_CELL_MM: Record<ExportQuality, number> = { draft: 0.8, standard: 0.4, fine: 0.2 }

/**
 * STEP costs about 720 bytes per triangle, roughly 14x a binary STL, so it gets a coarser grid and the
 * adaptive mesher. These numbers keep a 150 x 150 mm tile in a fully curved texture (the worst case, where
 * nothing merges) near 8 MB draft, 22 MB standard and 50 MB fine; flat textures land far below that.
 */
export const STEP_QUALITY: Record<ExportQuality, { cellMm: number; toleranceMm: number }> = {
  draft: { cellMm: 2, toleranceMm: 0.08 },
  standard: { cellMm: 1.2, toleranceMm: 0.04 },
  fine: { cellMm: 0.8, toleranceMm: 0.02 },
}

/**
 * Grid lines of a piece's top: uniform cells of `cellMm`, plus a line wherever an edge creases into the
 * relief (the joint edge on every joint side, the perimeter profile on a border piece), so those planes
 * stay flat. x lines depend only on the piece's column and y lines only on its row (see pieceAxisBreaks).
 */
export function topGridLines(
  config: DesignConfig,
  piece: Pick<PieceSpec, 'width' | 'height' | 'edges'>,
  cellMm: number,
): { xs: Float64Array; ys: Float64Array } {
  const quantum = float32Quantum(Math.max(config.tile.width, config.tile.height))
  const { x, y } = pieceAxisBreaks(config, piece.edges)
  return {
    xs: axisLines(Math.fround(piece.width), cellMm, x.low, x.high, quantum, x.union),
    ys: axisLines(Math.fround(piece.height), cellMm, y.low, y.high, quantum, y.union),
  }
}

/**
 * Cell budget for one piece. The largest tile (400 mm) at fine quality asks for 4 M cells, which is an
 * 8 M triangle mesh, a 400 MB STL and 1.8 GB of memory; the budget below caps that at 2.4 M triangles.
 * STEP costs about 720 bytes per triangle, so the adaptive grid gets a much tighter budget: 40 k cells
 * is the documented fine STEP grid of a 150 mm tile (0.8 mm), about 60 MB in a fully curved texture.
 */
const MAX_CELLS_UNIFORM = 1_200_000
const MAX_CELLS_ADAPTIVE = 40_000

/**
 * Grid spacing actually used. Coarsening is derived from the tile, never from the piece, so two pieces
 * that meet at a joint keep the same lines along their shared edge and their rim samples stay identical.
 */
export function effectiveCellMm(config: DesignConfig, options: PieceMeshOptions): number {
  const cell = Math.max(options.cellMm, 1e-3)
  const budget = options.adaptive ? MAX_CELLS_ADAPTIVE : MAX_CELLS_UNIFORM
  const cells = (config.tile.width * config.tile.height) / (cell * cell)
  return cells <= budget ? cell : cell * Math.sqrt(cells / budget)
}

/** The sampled and triangulated top of a piece, which the plain and the pocketed solid share. */
interface TopSurface {
  cellMm: number
  w: number
  h: number
  xs: Float64Array
  ys: Float64Array
  /** Grid heights, row-major (ny + 1) x (nx + 1), float32-rounded. */
  z: Float64Array
  sample: (x: number, y: number) => number
  /** Top triangles as grid ids. */
  tris: Uint32Array
  /** Output vertex id per grid id, -1 where the adaptive top leaves the grid vertex out. */
  map: Int32Array
  topCount: number
  /** Rim grid ids per wall, in the order they are seen from outside (s increasing). */
  rims: number[][]
  uOf: (x: number) => number
  vOf: (y: number) => number
}

function buildTop(config: DesignConfig, field: HeightField, piece: PieceSpec, options: PieceMeshOptions): TopSurface {
  const cellMm = effectiveCellMm(config, options)
  const w = Math.fround(piece.width)
  const h = Math.fround(piece.height)
  // The edges crease into the relief at known distances from each side: grid lines there keep them crisp.
  const { xs, ys } = topGridLines(config, piece, cellMm)
  const sample = pieceTopSampler(config, field, { crop: piece.crop, width: w, height: h, edges: piece.edges })
  const grid = sampleGrid(sample, xs, ys)
  const { tris, used } = triangulateTop(grid, options.adaptive?.toleranceMm ?? null)

  const nx = xs.length - 1
  const ny = ys.length - 1
  const w1 = nx + 1
  const map = new Int32Array(used.length).fill(-1)
  let topCount = 0
  for (let id = 0; id < used.length; id++) if (used[id]) map[id] = topCount++

  const rims: number[][] = [[], [], [], []]
  for (let i = 0; i <= nx; i++) if (used[i]) rims[0].push(i)
  for (let j = 0; j <= ny; j++) if (used[j * w1 + nx]) rims[1].push(j * w1 + nx)
  for (let i = nx; i >= 0; i--) if (used[ny * w1 + i]) rims[2].push(ny * w1 + i)
  for (let j = ny; j >= 0; j--) if (used[j * w1]) rims[3].push(j * w1)

  const tileW = Math.max(config.tile.width, 1e-6)
  const tileH = Math.max(config.tile.height, 1e-6)
  const { crop } = piece
  const uOf = (x: number) => (x === w ? crop.x1 : crop.x0 + x) / tileW
  const vOf = (y: number) => (y === h ? crop.y1 : crop.y0 + y) / tileH
  return { cellMm, w, h, xs, ys, z: grid.z, sample, tris, map, topCount, rims, uOf, vOf }
}

/** Writes the top's vertices (ids 0 to topCount - 1) and its triangles (the first tris.length indices). */
function writeTop(top: TopSurface, positions: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint32Array): void {
  const { xs, ys, z, sample, map, tris, uOf, vOf } = top
  const w1 = xs.length
  // Normals from central differences on the sampler (the global relief, edges included), so the same
  // pattern point shades identically on two neighbouring pieces.
  const e = Math.max(0.5 * top.cellMm, 1e-3)
  const inv2e = 1 / (2 * e)
  for (let id = 0; id < map.length; id++) {
    const out = map[id]
    if (out < 0) continue
    const i = id % w1
    const j = (id - i) / w1
    const x = xs[i]
    const y = ys[j]
    positions[3 * out] = x
    positions[3 * out + 1] = y
    positions[3 * out + 2] = z[id]
    const gx = (sample(x + e, y) - sample(x - e, y)) * inv2e
    const gy = (sample(x, y + e) - sample(x, y - e)) * inv2e
    const len = Math.hypot(gx, gy, 1)
    normals[3 * out] = -gx / len
    normals[3 * out + 1] = -gy / len
    normals[3 * out + 2] = 1 / len
    uvs[2 * out] = uOf(x)
    uvs[2 * out + 1] = vOf(y)
  }
  for (let k = 0; k < tris.length; k++) indices[k] = map[tris[k]]
}

const CORNERS: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]
const WALL_NORMALS: [number, number, number][] = [
  [0, -1, 0],
  [1, 0, 0],
  [0, 1, 0],
  [-1, 0, 0],
]

/** A wall's rim seen from outside: `s` along the wall and `z`, in rim order. */
function rimProfile(top: TopSurface, side: number): { s: Float64Array; zs: Float64Array } {
  const { xs, ys, z, w, h } = top
  const w1 = xs.length
  const rim = top.rims[side]
  const n = rim.length
  const s = new Float64Array(n)
  const zs = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    const id = rim[k]
    const i = id % w1
    const j = (id - i) / w1
    const x = xs[i]
    const y = ys[j]
    s[k] = side === 0 ? x : side === 1 ? y : side === 2 ? w - x : h - y
    zs[k] = z[id]
  }
  return { s, zs }
}

/** The solid without back features: two triangles of bottom, exactly as every tile always was. */
function plainSolid(top: TopSurface): MeshData {
  const { xs, ys, z, w, h, rims, tris, topCount, uOf, vOf } = top
  const w1 = xs.length
  const wallVertices = rims.reduce((n, rim) => n + rim.length + 2, 0)
  const vertexCount = topCount + wallVertices + 4
  const positions = new Float32Array(3 * vertexCount)
  const normals = new Float32Array(3 * vertexCount)
  const uvs = new Float32Array(2 * vertexCount)
  const indexCount = tris.length + 3 * rims.reduce((n, rim) => n + rim.length, 0) + 6
  const indices = new Uint32Array(indexCount)
  writeTop(top, positions, normals, uvs, indices)

  let vertex = topCount
  let index = tris.length
  const corners = CORNERS.map(([cx, cy]) => [cx * w, cy * h] as const)
  for (let side = 0; side < 4; side++) {
    const rim = rims[side]
    const n = rim.length
    const [c0x, c0y] = corners[side]
    const [c1x, c1y] = corners[(side + 1) % 4]
    const { s, zs } = rimProfile(top, side)
    const base = vertex
    const put = (v: number, x: number, y: number, pz: number) => {
      positions[3 * v] = x
      positions[3 * v + 1] = y
      positions[3 * v + 2] = pz
      normals[3 * v] = WALL_NORMALS[side][0]
      normals[3 * v + 1] = WALL_NORMALS[side][1]
      normals[3 * v + 2] = WALL_NORMALS[side][2]
      // Pattern coordinates like the top surface, so a wall texel matches the rim it hangs from.
      uvs[2 * v] = uOf(x)
      uvs[2 * v + 1] = vOf(y)
    }
    put(base, c0x, c0y, 0)
    put(base + 1, c1x, c1y, 0)
    for (let k = 0; k < n; k++) {
      const id = rim[k]
      const i = id % w1
      const j = (id - i) / w1
      put(base + 2 + k, xs[i], ys[j], z[id])
    }
    const local = triangulateWall(s, zs)
    for (let k = 0; k < local.length; k++) indices[index++] = base + local[k]
    vertex += n + 2
  }

  const bottom = vertex
  for (let k = 0; k < 4; k++) {
    const [x, y] = corners[k]
    positions[3 * (bottom + k)] = x
    positions[3 * (bottom + k) + 1] = y
    positions[3 * (bottom + k) + 2] = 0
    normals[3 * (bottom + k) + 2] = -1
    uvs[2 * (bottom + k)] = uOf(x)
    uvs[2 * (bottom + k) + 1] = vOf(y)
  }
  indices.set([bottom, bottom + 3, bottom + 2, bottom, bottom + 2, bottom + 1], index)

  return { positions, normals, uvs, indices, topIndexCount: tris.length }
}

/** Collects the faces below the top (walls, bottom, pockets) with flat normals and pattern uvs. */
class BackFaces implements FaceSink {
  positions: number[] = []
  normals: number[] = []
  uvs: number[] = []
  indices: number[] = []

  constructor(
    private readonly uOf: (x: number) => number,
    private readonly vOf: (y: number) => number,
  ) {}

  face(points: readonly number[], tris: ArrayLike<number>, normal: readonly [number, number, number]): void {
    const base = this.positions.length / 3
    for (let k = 0; k < points.length; k += 3) {
      this.positions.push(points[k], points[k + 1], points[k + 2])
      this.normals.push(normal[0], normal[1], normal[2])
      this.uvs.push(this.uOf(points[k]), this.vOf(points[k + 1]))
    }
    for (let k = 0; k < tris.length; k++) this.indices.push(base + tris[k])
  }
}

/** Index of the last line at or below v (0 when none is). */
function lineAtOrBelow(lines: Float64Array, v: number): number {
  let lo = 0
  let hi = lines.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lines[mid] <= v) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Index of the first line at or above v (the last line when none is). */
function lineAtOrAbove(lines: Float64Array, v: number): number {
  let lo = 0
  let hi = lines.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid] >= v) hi = mid
    else lo = mid + 1
  }
  return lo
}

/**
 * Every ceiling keeps MIN_SKIN_MM of plastic under the lowest top sample over its feature (the grid cells
 * covering its outlines, rim and joint edge included), or the pocket would print through the face.
 *
 * A tab has no plate over it at all, so the same sweep holds it to a different thing: its bounds lie beyond
 * one side line, where the only grid line is the rim itself, so what it is measured against is the lowest rim
 * sample over its own span. That keeps a tab from standing level with the face of its own tile. How far below
 * the rim a tab must sit to be hidden in the joint, and that it must be thinner than the socket it goes into,
 * are the fixings layer's rules (keyNotchDepth's own): what covers a tab is the neighbour's plate, and the
 * mesher sees one piece.
 */
function checkSkin(top: TopSurface, features: readonly SolidFeature[]): void {
  const { xs, ys, z } = top
  const w1 = xs.length
  for (const feature of features) {
    const b = featureBounds(feature)
    const i0 = lineAtOrBelow(xs, b.minX)
    const i1 = lineAtOrAbove(xs, b.maxX)
    const j0 = lineAtOrBelow(ys, b.minY)
    const j1 = lineAtOrAbove(ys, b.maxY)
    let lowest = Infinity
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) lowest = Math.min(lowest, z[j * w1 + i])
    const ceiling = ceilingOf(feature)
    if (ceiling > lowest - MIN_SKIN_MM) {
      const what = feature.outward
        ? `stands ${ceiling} mm high, within ${MIN_SKIN_MM} mm of the rim of its own side`
        : `reaches ${ceiling} mm, within ${MIN_SKIN_MM} mm of the top above it`
      throw new Error(`buildPieceMesh: back feature ${feature.index} (${feature.role}) ${what} (lowest at ${lowest.toFixed(2)} mm)`)
    }
  }
}

/** How far from the piece's origin any feature reaches: a tab's own coordinates stand outside the footprint. */
function featureExtent(features: readonly BackFeature[]): number {
  let extent = 0
  for (const feature of features) {
    for (const level of feature.levels) {
      for (const ring of level.ringTop ? [level.ring, level.ringTop] : [level.ring]) {
        for (let k = 0; k < ring.length; k++) extent = Math.max(extent, Math.abs(ring[k]))
      }
    }
  }
  return extent
}

/**
 * The solid with its back features built in: walls that notches or tabs open onto get that profile in their
 * bottom chain, the bottom is the footprint polygon with the notches and tabs in its outline and the pockets
 * as holes, and every pocket gets its walls, ledges and ceiling, every tab those faces turned outward. The
 * top and its index range are untouched.
 */
function featureSolid(config: DesignConfig, top: TopSurface, features: readonly BackFeature[]): MeshData {
  const { xs, ys, z, w, h, rims, tris, topCount } = top
  // The snapping lattice is the float32 one at the far edge of what is printed, which a tab moves out past
  // the piece: a tab on a 127.9 mm tile reaches into the next binade, where a float32 step is twice as
  // coarse. Every coordinate inside the footprint is covered by the tile's own size, as it always was.
  const quantum = float32Quantum(Math.max(config.tile.width, config.tile.height, w, h, featureExtent(features)))
  const solid = prepareFeatures(features, w, h, quantum)
  checkSkin(top, solid)

  const back = new BackFaces(top.uOf, top.vOf)
  const w1 = xs.length
  const corners = CORNERS.map(([cx, cy]) => [cx * w, cy * h] as const)
  for (let side = 0; side < 4; side++) {
    const { s, zs } = rimProfile(top, side)
    const chain = notchChain(solid, side as Side, w, h)
    const points: number[] = []
    let local: Uint32Array
    if (chain) {
      for (const p of chain) points.push(p.x, p.y, p.z)
      local = triangulateNotchedWall(
        s,
        zs,
        chain.map((p) => p.s),
        chain.map((p) => p.z),
      )
    } else {
      const [c0x, c0y] = corners[side]
      const [c1x, c1y] = corners[(side + 1) % 4]
      points.push(c0x, c0y, 0, c1x, c1y, 0)
      local = triangulateWall(s, zs)
    }
    for (const id of rims[side]) {
      const i = id % w1
      points.push(xs[i], ys[(id - i) / w1], z[id])
    }
    back.face(points, local, WALL_NORMALS[side])
  }
  emitBottom(back, solid, w, h)
  for (const feature of solid) emitFeatureFaces(back, feature)

  const vertexCount = topCount + back.positions.length / 3
  const positions = new Float32Array(3 * vertexCount)
  const normals = new Float32Array(3 * vertexCount)
  const uvs = new Float32Array(2 * vertexCount)
  const indices = new Uint32Array(tris.length + back.indices.length)
  writeTop(top, positions, normals, uvs, indices)
  positions.set(back.positions, 3 * topCount)
  normals.set(back.normals, 3 * topCount)
  uvs.set(back.uvs, 2 * topCount)
  for (let k = 0; k < back.indices.length; k++) indices[tris.length + k] = topCount + back.indices[k]
  return { positions, normals, uvs, indices, topIndexCount: tris.length }
}

/**
 * The printable solid of one piece. `features` (the key notches and clip pockets cut into its back, and any
 * tab standing out of it) default to the design's own; the fit test passes its coupon's. With none, the solid
 * is exactly the one every tile always had: the same vertices, indices and bytes.
 */
export function buildPieceMesh(
  config: DesignConfig,
  field: HeightField,
  piece: PieceSpec,
  options: PieceMeshOptions,
  features: readonly BackFeature[] = pieceFeatures(config, piece),
): MeshData {
  const top = buildTop(config, field, piece, options)
  return features.length === 0 ? plainSolid(top) : featureSolid(config, top, features)
}
