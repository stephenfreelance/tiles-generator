import { describe, expect, it } from 'vitest'
import { writeStep } from '../export/step'
import type { BackFeature } from '../fixing/types'
import { computeLayout } from '../layout'
import type { HeightField } from '../textures/types'
import type { DesignConfig, MeshData, PieceSpec, Side } from '../types'
import { DEFAULT_PERIMETER, PERIMETER_PROFILES } from '../config'
import { axisLines, float32Quantum } from './grid'
import { applyBevel, edgeDistance, effectiveBevel, pieceTopSampler } from './heightfield'
import { checkMesh, componentCount, downwardArea, meshVolume, pinchedVertices } from './meshChecks'
import { ringFromRect, signedArea } from './polygon'
import { PERIMETER_RIM_FLOOR, resolvePerimeter } from './profiles'
import { buildPieceMesh, QUALITY_CELL_MM, STEP_QUALITY, topGridLines, type PieceMeshOptions } from './tileMesh'
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
  const sample = pieceTopSampler(config, field, { crop: piece.crop, width: w, height: h, edges: piece.edges })
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
  const w = Math.fround(piece.width)
  const h = Math.fround(piece.height)
  const { xs, ys } = topGridLines(config, piece, options.cellMm)
  const sample = pieceTopSampler(config, field, { crop: piece.crop, width: w, height: h, edges: piece.edges })
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
      edges: { boundary: 0, tabs: 0, profiled: {} },
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

  it('keeps a default design on the grid and the chamfer it always had', () => {
    // The old grid was one symmetric break list; the old sampler a chamfer on the nearest edge distance.
    const quantum = float32Quantum(150)
    const bevel = effectiveBevel(config)
    for (const name of ['sine', 'noise']) {
      const field = FIELDS[name](config.texture.depth, 150, 150)
      for (const piece of pieces) {
        const w = Math.fround(piece.width)
        const h = Math.fround(piece.height)
        const { xs, ys } = topGridLines(config, piece, UNIFORM.cellMm)
        expect(xs).toEqual(axisLines(w, UNIFORM.cellMm, [bevel], [bevel], quantum))
        expect(ys).toEqual(axisLines(h, UNIFORM.cellMm, [bevel], [bevel], quantum))
        const legacy = (x: number, y: number) => {
          const u = x === w ? piece.crop.x1 : piece.crop.x0 + x
          const v = y === h ? piece.crop.y1 : piece.crop.y0 + y
          const wrap = (c: number) => (c - Math.floor(c / 150) * 150 >= 150 ? 0 : c - Math.floor(c / 150) * 150)
          return applyBevel(config.tile.thickness + field(wrap(u), wrap(v)), edgeDistance(x, y, w, h), config.tile.thickness, bevel)
        }
        const mesh = buildPieceMesh(config, field, piece, UNIFORM)
        const p = mesh.positions
        for (let t = 0; t < mesh.topIndexCount; t++) {
          const v = 3 * mesh.indices[t]
          expect(p[v + 2]).toBe(Math.fround(legacy(p[v], p[v + 1])))
        }
      }
    }
  })

  it('exports the documented quality steps', () => {
    expect(QUALITY_CELL_MM).toEqual({ draft: 0.8, standard: 0.4, fine: 0.2 })
    expect(STEP_QUALITY.standard.cellMm).toBeGreaterThan(QUALITY_CELL_MM.standard)
    expect(STEP_QUALITY.fine.toleranceMm).toBeLessThan(STEP_QUALITY.draft.toleranceMm)
  })
})

describe('buildPieceMesh with edge profiles', () => {
  type Profile = 'margin' | 'chamfer' | 'bullnose' | 'ogee' | 'frame'
  const PROFILES: Profile[] = ['margin', 'chamfer', 'bullnose', 'ogee', 'frame']
  const withProfile = (profile: Profile, over: Partial<DesignConfig> = {}): DesignConfig => {
    const d = PERIMETER_PROFILES[profile]
    return testConfig({
      perimeter: { ...DEFAULT_PERIMETER, profile, width: d.width, drop: d.drop, land: d.land },
      ...over,
    })
  }
  const spec = (crop: PieceSpec['crop'], profiled: PieceSpec['edges']['profiled']): PieceSpec => ({
    id: 'x',
    mark: 'B',
    kind: 'edge',
    label: 'Border',
    crop,
    width: crop.x1 - crop.x0,
    height: crop.y1 - crop.y0,
    count: 1,
    edges: { boundary: 0, tabs: 0, profiled },
  })
  const FULL = { x0: 0, y0: 0, x1: 150, y1: 150 }
  // The bottom row of a wall whose tiles do not fit: a 5 mm strip, the rest of the profile spills above it.
  const STRIP = { x0: 0, y0: 145, x1: 150, y1: 150 }
  const BORDER_PIECES: [string, PieceSpec][] = [
    ['bottom-left corner', spec(FULL, { bottom: 0, left: 0 })],
    ['bottom edge', spec(FULL, { bottom: 0 })],
    ['strip on the edge', spec(STRIP, { bottom: 0 })],
    ['tile above the strip', spec(FULL, { bottom: 5 })],
    ['narrow corner cut', spec({ x0: 146, y0: 0, x1: 150, y1: 150 }, { left: 0, top: 0 })],
  ]

  /** Top vertices lying on a line x = at (axis 0) or y = at (axis 1), as [along, z] sorted by the other axis. */
  const rim = (mesh: MeshData, axis: 0 | 1, at: number) => {
    const ids = new Set<number>()
    for (let t = 0; t < mesh.topIndexCount; t++) ids.add(mesh.indices[t])
    return [...ids]
      .filter((v) => mesh.positions[3 * v + axis] === at)
      .map((v) => [mesh.positions[3 * v + 1 - axis], mesh.positions[3 * v + 2]] as const)
      .sort((a, b) => a[0] - b[0])
  }

  describe.each(PROFILES)('%s', (profile) => {
    const design = withProfile(profile)
    const e = resolvePerimeter(design)!

    it.each(BORDER_PIECES)('builds a closed, manifold, outward solid for the %s', (_label, piece) => {
      for (const name of ['flat', 'noise', 'steps']) {
        const field = FIELDS[name](design.texture.depth, 150, 150)
        for (const options of [UNIFORM, ADAPTIVE]) {
          const mesh = buildPieceMesh(design, field, piece, options)
          const check = checkMesh(mesh)
          expect(check.closed).toBe(true)
          expect(check.manifold).toBe(true)
          expect(check.oriented).toBe(true)
          expect(check.volume).toBeGreaterThan(0)
          expect(topProjectedArea(mesh)).toBeCloseTo(Math.fround(piece.width) * Math.fround(piece.height), 3)
          const { lo, hi } = bbox(mesh)
          expect(lo[2]).toBe(0)
          expect(hi[2]).toBeLessThanOrEqual(Math.max(e.Zf, design.tile.thickness + field.depth) + 1e-5)
          // The lowest point of the top, a joint crossing the rim included, keeps the floor.
          let lowest = Infinity
          for (let t = 0; t < mesh.topIndexCount; t++) lowest = Math.min(lowest, mesh.positions[3 * mesh.indices[t] + 2])
          expect(lowest).toBeGreaterThanOrEqual(Math.min(PERIMETER_RIM_FLOOR, design.tile.thickness - effectiveBevel(design)) - 1e-5)
        }
      }
    })

    it('follows the shaped surface: its volume is the integral of the sampler', () => {
      const field = sineField(2.4, 150, 150)
      for (const [, piece] of BORDER_PIECES.slice(0, 2)) {
        const expected = integrate(design, field, piece)
        const volume = meshVolume(buildPieceMesh(design, field, piece, UNIFORM))
        expect(Math.abs(volume - expected) / expected).toBeLessThan(3e-3)
      }
    })

    it('stays within the adaptive tolerance on the profile', () => {
      const field = noiseField(2.4, 150, 150)
      for (const [, piece] of BORDER_PIECES.slice(0, 3)) {
        expect(maxAdaptiveError(design, field, piece, ADAPTIVE)).toBeLessThanOrEqual(ADAPTIVE.adaptive!.toleranceMm + 1e-6)
      }
    })

    it('meets its interior neighbours with bit-identical rims', () => {
      const field = noiseField(2.4, 150, 150)
      const interior = buildPieceMesh(design, field, spec(FULL, {}), UNIFORM)
      const bottomEdge = buildPieceMesh(design, field, spec(FULL, { bottom: 0 }), UNIFORM)
      // Above a bottom border tile sits an interior tile: its bottom rim is the border tile's top rim.
      expect(rim(bottomEdge, 1, 150)).toEqual(rim(interior, 1, 0))
      // Along the row, the next bottom border tile is the same model: its left rim meets this right rim.
      expect(rim(bottomEdge, 0, 150)).toEqual(rim(bottomEdge, 0, 0))
      // Right of a left border tile sits an interior tile.
      const leftEdge = buildPieceMesh(design, field, spec(FULL, { left: 0 }), UNIFORM)
      expect(rim(leftEdge, 0, 150)).toEqual(rim(interior, 0, 0))
      // A narrow strip on the edge and the tile above it share the profile across their joint.
      const strip = buildPieceMesh(design, field, spec(STRIP, { bottom: 0 }), UNIFORM)
      const above = buildPieceMesh(design, field, spec(FULL, { bottom: 5 }), UNIFORM)
      expect(rim(strip, 1, 5).length).toBeGreaterThan(100)
      expect(rim(strip, 1, 5)).toEqual(rim(above, 1, 0))
    })
  })

  it('leaves the interior tile of a profiled design exactly as a plain one', () => {
    const field = noiseField(2.4, 150, 150)
    const plain = buildPieceMesh(testConfig(), field, pieces[0], UNIFORM)
    for (const profile of PROFILES) {
      const mesh = buildPieceMesh(withProfile(profile), field, spec(FULL, {}), UNIFORM)
      expect(mesh.positions).toEqual(plain.positions)
      expect(mesh.indices).toEqual(plain.indices)
    }
  })

  describe('cutting the relief', () => {
    const DROPPING = ['chamfer', 'bullnose', 'ogee'] as const
    const withLand = (profile: (typeof DROPPING)[number], land: 'cut' | 'peaks'): DesignConfig => {
      const d = PERIMETER_PROFILES[profile]
      return testConfig({ perimeter: { ...DEFAULT_PERIMETER, profile, width: d.width, drop: d.drop, land } })
    }
    const wrap = (c: number) => c - Math.floor(c / 150) * 150

    it.each(DROPPING)('builds a %s border piece as a closed solid with no face looking down above the bed', (profile) => {
      const design = withLand(profile, 'cut')
      for (const [label, piece] of BORDER_PIECES) {
        for (const name of ['noise', 'steps', 'sine']) {
          const field = FIELDS[name](design.texture.depth, 150, 150)
          for (const options of [UNIFORM, ADAPTIVE]) {
            const mesh = buildPieceMesh(design, field, piece, options)
            const check = checkMesh(mesh)
            expect(check.closed, `${label} ${name}`).toBe(true)
            expect(check.manifold, `${label} ${name}`).toBe(true)
            expect(check.oriented, `${label} ${name}`).toBe(true)
            expect(check.volume).toBeGreaterThan(0)
            // One heightfield printed face up: only the bed faces down.
            expect(downwardArea(mesh, 0), `${label} ${name}`).toBe(0)
            // It only takes material away: no top vertex stands above the relief it trims.
            const p = mesh.positions
            let above = -Infinity
            for (let t = 0; t < mesh.topIndexCount; t++) {
              const v = 3 * mesh.indices[t]
              const relief = design.tile.thickness + field(wrap(piece.crop.x0 + p[v]), wrap(piece.crop.y0 + p[v + 1]))
              above = Math.max(above, p[v + 2] - relief)
            }
            expect(above, `${label} ${name}`).toBeLessThanOrEqual(1e-4)
          }
        }
      }
    })

    it('keeps the valleys the peaks land fills, and the peaks land still builds its solid', () => {
      const field = sineField(2.4, 150, 150)
      for (const profile of DROPPING) {
        for (const [, piece] of BORDER_PIECES.slice(0, 2)) {
          const cut = buildPieceMesh(withLand(profile, 'cut'), field, piece, UNIFORM)
          const peaks = buildPieceMesh(withLand(profile, 'peaks'), field, piece, UNIFORM)
          const check = checkMesh(peaks)
          expect(check.closed && check.manifold && check.oriented, profile).toBe(true)
          expect(meshVolume(cut), profile).toBeLessThan(meshVolume(peaks))
        }
      }
    })
  })
})

describe('buildPieceMesh with back features', () => {
  const config = testConfig()
  const field = noiseField(2.4, 150, 150)
  const FULL: PieceSpec = { ...pieces[0], edges: { boundary: 0, tabs: 0, profiled: {} } }

  /** Maps (u along a side from the corner its wall starts at, v inward) to piece coordinates. */
  const frame = (side: Side, w: number, h: number) => (u: number, v: number): [number, number] =>
    side === 0 ? [u, v] : side === 1 ? [w - v, u] : side === 2 ? [w - u, h - v] : [v, h - u]
  const onSide = (side: Side, w: number, h: number, uv: [number, number][]) => {
    const map = frame(side, w, h)
    return Float64Array.from(uv.flatMap(([u, v]) => map(u, v)))
  }
  /** A square-shouldered key notch (neck 6 x 3, head 12 x 5) at `at` along the side, grown by c. */
  const tee = (at: number, c: number): [number, number][] => [
    [at - 3 - c, 0],
    [at + 3 + c, 0],
    [at + 3 + c, 3 - c],
    [at + 6 + c, 3 - c],
    [at + 6 + c, 8 + c],
    [at - 6 - c, 8 + c],
    [at - 6 - c, 3 - c],
    [at - 3 - c, 3 - c],
  ]
  /** A key notch with a 0.4 mm mouth chamfer, 1.8 mm deep, as the joins package plans them. */
  const keyNotch = (side: Side, at: number, w = 150, h = 150): BackFeature => ({
    role: 'key-pocket',
    side,
    levels: [
      { ring: onSide(side, w, h, tee(at, 0.4)), ringTop: onSide(side, w, h, tee(at, 0)), z0: 0, z1: 0.4 },
      { ring: onSide(side, w, h, tee(at, 0)), z0: 0.4, z1: 1.8 },
    ],
  })
  /** A notch in two slots, the upper one `half` either side of `at` and `depth` deep. */
  const steppedNotch = (side: Side, at: number, [half, depth]: [number, number]): BackFeature => {
    const slot = (hw: number, d: number): [number, number][] => [
      [at - hw, 0],
      [at + hw, 0],
      [at + hw, d],
      [at - hw, d],
    ]
    return {
      role: 'key-pocket',
      side,
      levels: [
        { ring: onSide(side, 150, 150, slot(4, 6)), z0: 0, z1: 1 },
        { ring: onSide(side, 150, 150, slot(half, depth)), z0: 1, z1: 2 },
      ],
    }
  }
  const box = (cx: number, cy: number, sx: number, sy: number) => ringFromRect(cx - sx / 2, cy - sy / 2, cx + sx / 2, cy + sy / 2)
  /** A clip pocket: mouth chamfer, entry lip, a cavity as long as the lip but wider, flat ceiling at 3 mm. */
  const clipPocket = (cx: number, cy: number): BackFeature => ({
    role: 'clip-pocket',
    side: null,
    levels: [
      { ring: box(cx, cy, 29.2, 15), ringTop: box(cx, cy, 28.4, 14.2), z0: 0, z1: 0.4 },
      { ring: box(cx, cy, 28.4, 14.2), z0: 0.4, z1: 1.2 },
      { ring: box(cx, cy, 28.4, 18.2), z0: 1.2, z1: 3 },
    ],
  })
  /** A pocket that narrows going up: a downward ledge, then a smaller ceiling. */
  const steppedPocket = (cx: number, cy: number): BackFeature => ({
    role: 'clip-pocket',
    side: null,
    levels: [
      { ring: box(cx, cy, 21, 21), ringTop: box(cx, cy, 20, 20), z0: 0, z1: 0.5 },
      { ring: box(cx, cy, 20, 20), z0: 0.5, z1: 1.5 },
      { ring: box(cx, cy, 12, 12), z0: 1.5, z1: 2.5 },
    ],
  })

  /** Exact volume of a feature: each level is a prism or a loft whose section area is quadratic in z. */
  const pocketVolume = (f: BackFeature) =>
    f.levels.reduce((sum, { ring, ringTop, z0, z1 }) => {
      const top = ringTop ?? ring
      const mid = ring.map((v, k) => (v + top[k]) / 2)
      return sum + ((z1 - z0) / 6) * (Math.abs(signedArea(ring)) + 4 * Math.abs(signedArea(mid)) + Math.abs(signedArea(top)))
    }, 0)
  /** Faces looking down above the bed: every ceiling, plus every ledge where a cavity narrows going up. */
  const overhangArea = (f: BackFeature) =>
    f.levels.reduce((sum, level, k) => {
      const top = Math.abs(signedArea(level.ringTop ?? level.ring))
      const next = f.levels[k + 1]
      return sum + (next ? Math.max(0, top - Math.abs(signedArea(next.ring))) : top)
    }, 0)
  /** Projected area of the faces on the bed (z = 0), which look down. */
  const bedArea = (mesh: MeshData) => {
    const p = mesh.positions
    let area = 0
    for (let t = mesh.topIndexCount; t < mesh.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => 3 * mesh.indices[t + k])
      if (p[a + 2] !== 0 || p[b + 2] !== 0 || p[c + 2] !== 0) continue
      area -= ((p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1])) / 2
    }
    return area
  }
  const expectSolid = (mesh: MeshData) => {
    const check = checkMesh(mesh)
    expect(check.closed).toBe(true)
    expect(check.manifold).toBe(true)
    expect(check.oriented).toBe(true)
    expect(pinchedVertices(mesh)).toBe(0)
    expect(componentCount(mesh)).toBe(1)
  }

  const SETS: [string, BackFeature[]][] = [
    ['two clip pockets', [clipPocket(75, 30), clipPocket(75, 120)]],
    ['a notch on every side', ([0, 1, 2, 3] as Side[]).map((side) => keyNotch(side, 75))],
    ['a notch and a pocket', [keyNotch(0, 75), clipPocket(75, 60)]],
    ['several notches on one side', [keyNotch(3, 25), keyNotch(3, 75), keyNotch(3, 125)]],
    ['stepped pockets with a mouth chamfer', [steppedPocket(40, 40), clipPocket(100, 100)]],
    // Narrower above, the same span but shallower above, and the same span reaching further in above.
    [
      'stepped notches',
      [
        steppedNotch(1, 40, [2, 3]),
        steppedNotch(1, 110, [4, 3]),
        steppedNotch(2, 75, [4, 9]),
        // A narrower T above a T, its head corners on the lower neck's reflex corners: the ledge is four
        // pieces meeting two by two at a vertex, and the solid is still sound there.
        {
          role: 'key-pocket',
          side: 0,
          levels: [
            { ring: onSide(0, 150, 150, tee(75, 0)), z0: 0, z1: 1 },
            {
              ring: onSide(0, 150, 150, [
                [73, 0],
                [77, 0],
                [77, 3],
                [78, 3],
                [78, 8],
                [72, 8],
                [72, 3],
                [73, 3],
              ]),
              z0: 1,
              z1: 1.8,
            },
          ],
        },
      ],
    ],
    [
      'six notches and two pockets',
      [keyNotch(0, 40), keyNotch(0, 110), keyNotch(1, 75), keyNotch(2, 40), keyNotch(2, 110), keyNotch(3, 75), clipPocket(75, 40), clipPocket(75, 110)],
    ],
  ]

  describe.each(SETS)('%s', (_label, features) => {
    it.each([
      ['uniform', { cellMm: 1.2 }],
      ['adaptive', ADAPTIVE],
    ] as const)('cuts a closed, manifold, outward solid (%s top)', (_name, options) => {
      const plain = buildPieceMesh(config, field, FULL, options, [])
      const mesh = buildPieceMesh(config, field, FULL, options, features)
      expectSolid(mesh)
      // The top comes first and is untouched.
      expect(mesh.topIndexCount).toBe(plain.topIndexCount)
      expect(mesh.indices.subarray(0, mesh.topIndexCount)).toEqual(plain.indices.subarray(0, plain.topIndexCount))
      const topVertices = plain.indices.subarray(0, plain.topIndexCount).reduce((a, b) => Math.max(a, b), 0) + 1
      expect(mesh.positions.subarray(0, 3 * topVertices)).toEqual(plain.positions.subarray(0, 3 * topVertices))
      expect(mesh.normals!.length).toBe(mesh.positions.length)
      expect(mesh.uvs!.length).toBe((2 * mesh.positions.length) / 3)
      // Exactly the pockets' volume comes out.
      const removed = features.reduce((sum, f) => sum + pocketVolume(f), 0)
      expect(meshVolume(plain) - meshVolume(mesh)).toBeCloseTo(removed, 2)
      // The only faces looking down above the bed are the ceilings and the narrowing ledges.
      expect(downwardArea(mesh, 0)).toBeCloseTo(features.reduce((sum, f) => sum + overhangArea(f), 0), 3)
      // The bed face is the footprint less every mouth.
      const mouths = features.reduce((sum, f) => sum + Math.abs(signedArea(f.levels[0].ring)), 0)
      // Within the float32 snap of the 0.4 mm chamfers (1e-3 mm²).
      expect(bedArea(mesh)).toBeCloseTo(150 * 150 - mouths, 2)
    })
  })

  it('cuts features into border pieces with every perimeter profile', () => {
    const PROFILES = ['margin', 'chamfer', 'bullnose', 'ogee', 'frame'] as const
    // A bottom-left corner piece: notches on its two interior sides, a clip pocket clear of the band.
    const corner: PieceSpec = { ...FULL, id: 'corner', edges: { boundary: 0b1001, tabs: 0, profiled: { bottom: 0, left: 0 } } }
    const cut: PieceSpec = {
      ...FULL,
      id: 'cut',
      crop: { x0: 0, y0: 0, x1: 100, y1: 150 },
      width: 100,
      edges: { boundary: 0b0011, tabs: 0, profiled: { right: 0, bottom: 0 } },
    }
    for (const profile of PROFILES) {
      const d = PERIMETER_PROFILES[profile]
      const design = testConfig({ perimeter: { ...DEFAULT_PERIMETER, profile, width: d.width, drop: d.drop, land: d.land } })
      for (const [piece, features] of [
        [corner, [keyNotch(1, 75), keyNotch(2, 40), keyNotch(2, 110), clipPocket(80, 80)]],
        [cut, [keyNotch(2, 30, 100), keyNotch(3, 75, 100), clipPocket(50, 90)]],
      ] as const) {
        for (const options of [UNIFORM, ADAPTIVE]) {
          const plain = buildPieceMesh(design, field, piece, options, [])
          const mesh = buildPieceMesh(design, field, piece, options, features)
          expectSolid(mesh)
          const removed = features.reduce((sum, f) => sum + pocketVolume(f), 0)
          expect(meshVolume(plain) - meshVolume(mesh)).toBeCloseTo(removed, 2)
        }
      }
    }
  })

  it('keeps a design without features byte for byte (default features, joins off and glue)', () => {
    for (const piece of [pieces[0], pieces[pieces.length - 1]]) {
      for (const options of [UNIFORM, ADAPTIVE]) {
        const byDefault = buildPieceMesh(config, field, piece, options)
        const none = buildPieceMesh(config, field, piece, options, [])
        expect(byDefault.positions).toEqual(none.positions)
        expect(byDefault.normals).toEqual(none.normals)
        expect(byDefault.uvs).toEqual(none.uvs)
        expect(byDefault.indices).toEqual(none.indices)
        expect(byDefault.topIndexCount).toBe(none.topIndexCount)
      }
    }
  })

  it.each<[string, BackFeature, RegExp]>([
    ['a pocket outside the footprint', { role: 'clip-pocket', side: null, levels: [{ ring: box(148, 75, 10, 10), z0: 0, z1: 2 }] }, /leaves the footprint/],
    [
      'levels that are not stacked',
      { role: 'clip-pocket', side: null, levels: [{ ring: box(75, 75, 10, 10), z0: 0, z1: 1 }, { ring: box(75, 75, 6, 6), z0: 1.5, z1: 2 }] },
      /not stacked/,
    ],
    // On a flat plate the top is at 4 mm, and 3.4 mm on the rim under the 0.6 mm joint chamfer.
    ['a ceiling in the top skin', { ...clipPocket(75, 75), levels: [{ ring: box(75, 75, 10, 10), z0: 0, z1: 3.3 }] }, /within 0.8 mm of the top/],
    ['a notch deeper than its chamfered rim allows', { ...keyNotch(0, 75), levels: [{ ring: onSide(0, 150, 150, tee(75, 0)), z0: 0, z1: 2.7 }] }, /within 0.8 mm of the top/],
    ['a notch that does not reach its side', { role: 'key-pocket', side: 0, levels: [{ ring: box(75, 5, 10, 6), z0: 0, z1: 1 }] }, /does not touch its side/],
  ])('refuses %s with a clear error', (_label, feature, message) => {
    expect(() => buildPieceMesh(config, plateField(0, 150, 150), FULL, UNIFORM, [feature])).toThrow(message)
  })

  it('accepts a ceiling that leaves the skin', () => {
    const plate = plateField(0, 150, 150)
    const notch = { ...keyNotch(0, 75), levels: [{ ring: onSide(0, 150, 150, tee(75, 0)), z0: 0, z1: 2.5 }] }
    const pocket = { ...clipPocket(75, 75), levels: [{ ring: box(75, 75, 10, 10), z0: 0, z1: 3.1 }] }
    expectSolid(buildPieceMesh(config, plate, FULL, UNIFORM, [notch, pocket]))
  })

  it('writes a pocketed, notched tile to STEP that OCCT reads back with the same volume', async () => {
    const features = [keyNotch(0, 75), keyNotch(1, 40), keyNotch(1, 110), clipPocket(75, 75), steppedPocket(40, 120)]
    const mesh = buildPieceMesh(config, flatField(2.4, 150, 150), FULL, { cellMm: 2, adaptive: { toleranceMm: 0.08 } }, features)
    expectSolid(mesh)
    const occt = await (await import('occt-import-js')).default()
    const result = occt.ReadStepFile(writeStep(mesh, { name: 'pocketed' }), { linearUnit: 'millimeter' })
    expect(result.success).toBe(true)
    expect(result.meshes).toHaveLength(1)
    let volume = 0
    for (const m of result.meshes) {
      const p = m.attributes.position.array
      const idx = m.index.array
      for (let i = 0; i < idx.length; i += 3) {
        const [a, b, c] = [idx[i] * 3, idx[i + 1] * 3, idx[i + 2] * 3]
        volume +=
          (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
            p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
            p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) /
          6
      }
    }
    expect(volume / meshVolume(mesh)).toBeCloseTo(1, 6)
  }, 120_000)

  it('costs about what a plain tile costs at fine quality', () => {
    const features = SETS[SETS.length - 1][1]
    const fine: PieceMeshOptions = { cellMm: QUALITY_CELL_MM.fine }
    const time = (list: BackFeature[]) => {
      const start = performance.now()
      buildPieceMesh(config, field, FULL, fine, list)
      return performance.now() - start
    }
    // Interleaved best of three, so a busy machine slows both alike.
    let plain = Infinity
    let cut = Infinity
    for (let k = 0; k < 3; k++) {
      plain = Math.min(plain, time([]))
      cut = Math.min(cut, time(features))
    }
    expect(cut).toBeLessThan(1.15 * plain)
  }, 60_000)
})
