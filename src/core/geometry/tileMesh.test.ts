import { describe, expect, it } from 'vitest'
import { computeLayout } from '../layout'
import type { HeightField } from '../textures/types'
import type { DesignConfig, MeshData, PieceSpec } from '../types'
import { axisLines, float32Quantum } from './grid'
import { effectiveBevel, pieceTopSampler } from './heightfield'
import { checkMesh, meshVolume } from './meshChecks'
import { bevelBreaks, buildPieceMesh, QUALITY_CELL_MM, STEP_QUALITY, type PieceMeshOptions } from './tileMesh'
import {
  chamferedBoxVolume,
  FIELDS,
  flatField,
  noiseField,
  plateField,
  sineField,
  stepsField,
  testConfig,
} from './testFields'

const plan = computeLayout({
  surface: { width: 1000, height: 800 },
  tile: { width: 150, height: 150 },
  joint: 0,
  layout: { origin: 'corner', rowOffset: 0 },
})
const pieces = plan.pieces

const UNIFORM: PieceMeshOptions = { cellMm: 0.8 }
const ADAPTIVE: PieceMeshOptions = { cellMm: 1.2, adaptive: { toleranceMm: 0.04 } }

const bbox = (mesh: MeshData) => {
  const p = mesh.positions
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[i + k])
      hi[k] = Math.max(hi[k], p[i + k])
    }
  }
  return { lo, hi }
}

/** Signed area of the top triangles projected on xy: it must tile the piece rectangle exactly. */
const topProjectedArea = (mesh: MeshData) => {
  const p = mesh.positions
  let area = 0
  for (let t = 0; t < mesh.topIndexCount; t += 3) {
    const a = 3 * mesh.indices[t]
    const b = 3 * mesh.indices[t + 1]
    const c = 3 * mesh.indices[t + 2]
    area += ((p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1])) / 2
  }
  return area
}

/** Midpoint-rule integral of the top surface: the solid is everything under it. */
function integrate(config: DesignConfig, field: HeightField, piece: PieceSpec, n = 600): number {
  const w = Math.fround(piece.width)
  const h = Math.fround(piece.height)
  const sample = pieceTopSampler(config, field, { crop: piece.crop, width: w, height: h })
  let sum = 0
  for (let j = 0; j < n; j++) {
    const y = ((j + 0.5) / n) * h
    for (let i = 0; i < n; i++) sum += sample(((i + 0.5) / n) * w, y)
  }
  return (sum / (n * n)) * w * h
}

/** Largest vertical gap between the adaptive surface and the fine uniform grid it was built from. */
function maxAdaptiveError(
  config: DesignConfig,
  field: HeightField,
  piece: PieceSpec,
  options: PieceMeshOptions,
): number {
  const mesh = buildPieceMesh(config, field, piece, options)
  const breaks = bevelBreaks(config)
  const quantum = float32Quantum(Math.max(config.tile.width, config.tile.height))
  const w = Math.fround(piece.width)
  const h = Math.fround(piece.height)
  const xs = axisLines(w, options.cellMm, breaks, quantum)
  const ys = axisLines(h, options.cellMm, breaks, quantum)
  const sample = pieceTopSampler(config, field, { crop: piece.crop, width: w, height: h })
  const reference = new Float64Array(xs.length * ys.length)
  for (let j = 0; j < ys.length; j++) {
    for (let i = 0; i < xs.length; i++) reference[j * xs.length + i] = Math.fround(sample(xs[i], ys[j]))
  }
  const lower = (values: Float64Array, v: number) => {
    let lo = 0
    let hi = values.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (values[mid] < v) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const p = mesh.positions
  let worst = 0
  for (let t = 0; t < mesh.topIndexCount; t += 3) {
    const a = 3 * mesh.indices[t]
    const b = 3 * mesh.indices[t + 1]
    const c = 3 * mesh.indices[t + 2]
    const i0 = lower(xs, Math.min(p[a], p[b], p[c]))
    const i1 = lower(xs, Math.max(p[a], p[b], p[c]))
    const j0 = lower(ys, Math.min(p[a + 1], p[b + 1], p[c + 1]))
    const j1 = lower(ys, Math.max(p[a + 1], p[b + 1], p[c + 1]))
    const det = (p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1])
    if (det === 0) continue
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = xs[i]
        const y = ys[j]
        const u = ((x - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (y - p[a + 1])) / det
        const v = ((p[b] - p[a]) * (y - p[a + 1]) - (x - p[a]) * (p[b + 1] - p[a + 1])) / det
        if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) continue
        const z = p[a + 2] + u * (p[b + 2] - p[a + 2]) + v * (p[c + 2] - p[a + 2])
        worst = Math.max(worst, Math.abs(z - reference[j * xs.length + i]))
      }
    }
  }
  return worst
}

describe('buildPieceMesh', () => {
  const config = testConfig()

  describe.each(Object.keys(FIELDS))('%s relief', (name) => {
    const field = FIELDS[name](config.texture.depth, config.tile.width, config.tile.height)

    it.each(pieces.map((piece) => [piece.label, piece] as const))(
      'builds a closed, manifold, outward solid for the %s',
      (_label, piece) => {
        for (const options of [UNIFORM, ADAPTIVE]) {
          const mesh = buildPieceMesh(config, field, piece, options)
          const check = checkMesh(mesh)
          expect(check.closed).toBe(true)
          expect(check.manifold).toBe(true)
          expect(check.oriented).toBe(true)
          expect(check.volume).toBeGreaterThan(0)
          const { lo, hi } = bbox(mesh)
          expect(lo).toEqual([0, 0, 0])
          expect(hi[0]).toBe(Math.fround(piece.width))
          expect(hi[1]).toBe(Math.fround(piece.height))
          expect(hi[2]).toBeLessThanOrEqual(config.tile.thickness + field.depth + 1e-5)
          expect(mesh.topIndexCount % 3).toBe(0)
          // The top covers the rectangle once, the bottom cancels it, the walls project to nothing.
          expect(topProjectedArea(mesh)).toBeCloseTo(Math.fround(piece.width) * Math.fround(piece.height), 3)
        }
      },
    )
  })

  it('keeps the attribute buffers consistent', () => {
    const mesh = buildPieceMesh(config, sineField(2.4, 150, 150), pieces[0], UNIFORM)
    const vertices = mesh.positions.length / 3
    expect(mesh.normals).toHaveLength(3 * vertices)
    expect(mesh.uvs).toHaveLength(2 * vertices)
    expect(mesh.topIndexCount).toBeLessThan(mesh.indices.length)
    for (let i = 0; i < mesh.indices.length; i++) expect(mesh.indices[i]).toBeLessThan(vertices)
  })

  it('maps uvs to pattern coordinates over the full tile', () => {
    const cut = pieces.find((p) => p.label === 'Right edge') as PieceSpec
    const mesh = buildPieceMesh(config, sineField(2.4, 150, 150), cut, UNIFORM)
    let maxU = 0
    for (let t = 0; t < mesh.topIndexCount; t++) maxU = Math.max(maxU, mesh.uvs![2 * mesh.indices[t]])
    // The right edge piece keeps x0 = 0 .. x1 = 100 of a 150 wide tile.
    expect(maxU).toBeCloseTo(100 / 150, 5)
  })

  it('matches the analytic volume of a chamfered box', () => {
    for (const [field, top] of [
      [plateField(0, 150, 150), config.tile.thickness],
      [flatField(2.4, 150, 150), config.tile.thickness + 2.4],
    ] as const) {
      for (const piece of pieces) {
        const mesh = buildPieceMesh(config, field, piece, UNIFORM)
        const expected = chamferedBoxVolume(
          Math.fround(piece.width),
          Math.fround(piece.height),
          top,
          effectiveBevel(config),
        )
        expect(Math.abs(meshVolume(mesh) - expected) / expected).toBeLessThan(1e-5)
      }
    }
  })

  it('matches the numeric integral of a textured relief', () => {
    for (const field of [sineField(2.4, 150, 150), noiseField(2.4, 150, 150)]) {
      for (const piece of [pieces[0], pieces[3]]) {
        const expected = integrate(config, field, piece)
        for (const options of [UNIFORM, ADAPTIVE]) {
          const volume = meshVolume(buildPieceMesh(config, field, piece, options))
          expect(Math.abs(volume - expected) / expected).toBeLessThan(3e-3)
        }
      }
    }
  })

  it('agrees between uniform and adaptive meshes', () => {
    const field = stepsField(2.4, 150, 150)
    const uniform = meshVolume(buildPieceMesh(config, field, pieces[0], { cellMm: 1.2 }))
    const adaptive = meshVolume(buildPieceMesh(config, field, pieces[0], ADAPTIVE))
    expect(Math.abs(adaptive - uniform) / uniform).toBeLessThan(1e-3)
  })

  it('puts the bottom at z = 0 with two triangles', () => {
    const mesh = buildPieceMesh(config, noiseField(2.4, 150, 150), pieces[0], UNIFORM)
    const p = mesh.positions
    let bottomTriangles = 0
    for (let t = mesh.topIndexCount; t < mesh.indices.length; t += 3) {
      const zs = [0, 1, 2].map((k) => p[3 * mesh.indices[t + k] + 2])
      if (zs.every((z) => z === 0)) bottomTriangles++
    }
    expect(bottomTriangles).toBe(2)
  })

  it('meets the neighbouring tile with bit-identical rim heights', () => {
    const field = noiseField(2.4, 150, 150)
    const full = buildPieceMesh(config, field, pieces[0], UNIFORM)
    const w = Math.fround(pieces[0].width)
    const topVertices = new Set<number>()
    for (let t = 0; t < full.topIndexCount; t++) topVertices.add(full.indices[t])
    const rim = (mesh: MeshData, x: number, ids: Set<number>) =>
      [...ids]
        .filter((v) => mesh.positions[3 * v] === x)
        .map((v) => [mesh.positions[3 * v + 1], mesh.positions[3 * v + 2]] as const)
        .sort((a, b) => a[0] - b[0])
    const left = rim(full, 0, topVertices)
    const right = rim(full, w, topVertices)
    expect(left.length).toBeGreaterThan(100)
    expect(right).toEqual(left)

    // A left-wall cut piece ends on the tile edge, so its right rim is the next tile's left rim.
    const cut: PieceSpec = {
      id: 'p-25-0-150-150',
      mark: 'B',
      kind: 'edge',
      label: 'Left edge',
      crop: { x0: 25, y0: 0, x1: 150, y1: 150 },
      width: 125,
      height: 150,
      count: 1,
    }
    const cutMesh = buildPieceMesh(config, field, cut, UNIFORM)
    const cutTop = new Set<number>()
    for (let t = 0; t < cutMesh.topIndexCount; t++) cutTop.add(cutMesh.indices[t])
    expect(rim(cutMesh, Math.fround(125), cutTop)).toEqual(left)
  })

  it('stays within the adaptive tolerance', () => {
    for (const name of ['flat', 'sine', 'noise', 'steps']) {
      const field = FIELDS[name](config.texture.depth, config.tile.width, config.tile.height)
      for (const piece of [pieces[0], pieces[3]]) {
        expect(maxAdaptiveError(config, field, piece, ADAPTIVE)).toBeLessThanOrEqual(
          ADAPTIVE.adaptive!.toleranceMm + 1e-6,
        )
      }
    }
  })

  it('turns a flat tile into a handful of triangles', () => {
    const mesh = buildPieceMesh(config, flatField(2.4, 150, 150), pieces[0], ADAPTIVE)
    // 9 rectangles on top (plateau, 4 chamfer strips, 4 mitred corners), then the walls and bottom.
    expect(mesh.topIndexCount / 3).toBe(18)
    expect(mesh.indices.length / 3).toBeLessThan(40)
    const uniform = buildPieceMesh(config, flatField(2.4, 150, 150), pieces[0], { cellMm: 1.2 })
    expect(uniform.topIndexCount / 3).toBeGreaterThan(20000)
  })

  it('keeps flat lands of a ridged relief cheap', () => {
    // Relief that only varies along x: every column of cells is planar and merges into one rectangle.
    const ridges = FIELDS.flat(2.4, 150, 150)
    const column = ((x: number) => 1.2 * (1 + Math.sin((Math.PI * 2 * 5 * x) / 150))) as unknown as (
      x: number,
      y: number,
    ) => number
    const field = Object.assign(column as never, ridges) as HeightField
    const adaptive = buildPieceMesh(config, field, pieces[0], ADAPTIVE)
    const uniform = buildPieceMesh(config, field, pieces[0], { cellMm: 1.2 })
    expect(adaptive.topIndexCount).toBeLessThan(uniform.topIndexCount / 20)
  })

  it('exports the documented quality steps', () => {
    expect(QUALITY_CELL_MM).toEqual({ draft: 0.8, standard: 0.4, fine: 0.2 })
    expect(STEP_QUALITY.standard.cellMm).toBeGreaterThan(QUALITY_CELL_MM.standard)
    expect(STEP_QUALITY.fine.toleranceMm).toBeLessThan(STEP_QUALITY.draft.toleranceMm)
  })
})
