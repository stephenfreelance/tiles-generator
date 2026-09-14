// Watertight solid for one printable piece: textured top, four side walls, flat bottom at z = 0.

import type { HeightField } from '../textures/types'
import type { DesignConfig, ExportQuality, MeshData, PieceSpec } from '../types'
import { triangulateTop } from './adaptive'
import { axisLines, float32Quantum, sampleGrid } from './grid'
import { effectiveBevel, pieceTopSampler } from './heightfield'
import { triangulateWall } from './walls'

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

/** Distance from a piece edge where the chamfer creases into the relief: the grid puts a line on it. */
export function bevelBreaks(config: DesignConfig): number[] {
  return [effectiveBevel(config)]
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

export function buildPieceMesh(
  config: DesignConfig,
  field: HeightField,
  piece: PieceSpec,
  options: PieceMeshOptions,
): MeshData {
  const cellMm = effectiveCellMm(config, options)
  const quantum = float32Quantum(Math.max(config.tile.width, config.tile.height))
  const w = Math.fround(piece.width)
  const h = Math.fround(piece.height)
  // The chamfer creases into the relief one bevel in from each edge: a grid line there keeps it crisp.
  const breaks = bevelBreaks(config)
  const xs = axisLines(w, cellMm, breaks, quantum)
  const ys = axisLines(h, cellMm, breaks, quantum)
  const sample = pieceTopSampler(config, field, { crop: piece.crop, width: w, height: h })
  const grid = sampleGrid(sample, xs, ys)
  const { tris, used } = triangulateTop(grid, options.adaptive?.toleranceMm ?? null)

  const nx = xs.length - 1
  const ny = ys.length - 1
  const w1 = nx + 1
  const map = new Int32Array(used.length).fill(-1)
  let topCount = 0
  for (let id = 0; id < used.length; id++) if (used[id]) map[id] = topCount++

  // Rim vertex ids per wall, in the order they are seen from outside (s increasing).
  const rims: number[][] = [[], [], [], []]
  for (let i = 0; i <= nx; i++) if (used[i]) rims[0].push(i)
  for (let j = 0; j <= ny; j++) if (used[j * w1 + nx]) rims[1].push(j * w1 + nx)
  for (let i = nx; i >= 0; i--) if (used[ny * w1 + i]) rims[2].push(ny * w1 + i)
  for (let j = ny; j >= 0; j--) if (used[j * w1]) rims[3].push(j * w1)

  const wallVertices = rims.reduce((n, rim) => n + rim.length + 2, 0)
  const vertexCount = topCount + wallVertices + 4
  const positions = new Float32Array(3 * vertexCount)
  const normals = new Float32Array(3 * vertexCount)
  const uvs = new Float32Array(2 * vertexCount)
  const indexCount = tris.length + 3 * rims.reduce((n, rim) => n + rim.length, 0) + 6
  const indices = new Uint32Array(indexCount)

  const tileW = Math.max(config.tile.width, 1e-6)
  const tileH = Math.max(config.tile.height, 1e-6)
  const { crop } = piece
  const uOf = (x: number) => (x === w ? crop.x1 : crop.x0 + x) / tileW
  const vOf = (y: number) => (y === h ? crop.y1 : crop.y0 + y) / tileH

  // Normals from central differences on the sampler (the global relief, bevel included), so the same
  // pattern point shades identically on two neighbouring pieces.
  const e = Math.max(0.5 * cellMm, 1e-3)
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
    positions[3 * out + 2] = grid.z[id]
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

  let vertex = topCount
  let index = tris.length
  const corners: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ]
  const wallNormals: [number, number, number][] = [
    [0, -1, 0],
    [1, 0, 0],
    [0, 1, 0],
    [-1, 0, 0],
  ]
  for (let side = 0; side < 4; side++) {
    const rim = rims[side]
    const n = rim.length
    const [c0x, c0y] = corners[side]
    const [c1x, c1y] = corners[(side + 1) % 4]
    const s = new Float64Array(n)
    const zs = new Float64Array(n)
    const base = vertex
    for (let k = 0; k < n; k++) {
      const id = rim[k]
      const i = id % w1
      const j = (id - i) / w1
      const x = xs[i]
      const y = ys[j]
      s[k] = side === 0 ? x : side === 1 ? y : side === 2 ? w - x : h - y
      zs[k] = grid.z[id]
    }
    const put = (v: number, x: number, y: number, z: number) => {
      positions[3 * v] = x
      positions[3 * v + 1] = y
      positions[3 * v + 2] = z
      normals[3 * v] = wallNormals[side][0]
      normals[3 * v + 1] = wallNormals[side][1]
      normals[3 * v + 2] = wallNormals[side][2]
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
      put(base + 2 + k, xs[i], ys[j], grid.z[id])
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
