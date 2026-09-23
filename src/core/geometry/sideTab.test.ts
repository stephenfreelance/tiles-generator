// The tile-to-tile join with no printed part: each tile carries a tab standing past its interior right side
// and the matching socket cut into its interior left side, both inside the back plate. The socket is an
// ordinary notch. The tab is the new thing: material ADDED outside the footprint, which the mesher had only
// ever cut into. These tests build real tiles with buildPieceMesh and run every check in meshChecks on them.

import { describe, expect, it } from 'vitest'
import { writeStep } from '../export/step'
import type { BackFeature } from '../fixing/types'
import type { DesignConfig, MeshData, PieceSpec, Side } from '../types'
import { computeLayout } from '../layout'
import type { HeightField } from '../textures/types'
import { float32Quantum } from './grid'
import { checkMesh, componentCount, downwardArea, meshVolume, pinchedVertices } from './meshChecks'
import { signedArea } from './polygon'
import { bottomOutline, notchChain, prepareFeatures } from './solid'
import { flatField, noiseField, plateField, testConfig } from './testFields'
import { buildPieceMesh, type PieceMeshOptions } from './tileMesh'

const W = 150
const H = 150
/** 6 mm plate: well over MIN_FIXING_THICKNESS, so a 2.4 mm tab or socket lives inside the back. */
const THICKNESS = 6

const config = (over: Partial<DesignConfig> = {}) => testConfig({ tile: { width: W, height: H, thickness: THICKNESS }, ...over })

const plan = computeLayout({
  surface: { width: 1000, height: 800 },
  tile: { width: W, height: H },
  joint: 0,
  layout: { origin: 'corner', rowOffset: 0 },
})
/** An interior piece: no boundary side, so both a tab and a socket are allowed. */
const INTERIOR: PieceSpec = { ...plan.pieces[0], edges: { boundary: 0, tabs: 0, profiled: {} } }

const UNIFORM: PieceMeshOptions = { cellMm: 1.2 }
const ADAPTIVE: PieceMeshOptions = { cellMm: 1.2, adaptive: { toleranceMm: 0.04 } }

/** The piece a feature is built on, when it is not the 150 mm square above. */
type Size = { w: number; h: number }
const SIZE: Size = { w: W, h: H }

/** Maps (u along a side from the corner its wall starts at, v inward) to piece coordinates. */
const frame =
  ({ w, h }: Size, side: Side) =>
  (u: number, v: number): [number, number] =>
    side === 0 ? [u, v] : side === 1 ? [w - v, u] : side === 2 ? [w - u, h - v] : [v, h - u]
const onSide = (side: Side, uv: [number, number][], size = SIZE) => {
  const map = frame(size, side)
  return Float64Array.from(uv.flatMap(([u, v]) => map(u, v)))
}

/**
 * A rectangular tab `along` mm along the side by `out` mm past it by `tall` mm high, centred at `at`.
 * Counter-clockwise seen from above: outside the line the ring runs the other way round than a notch's.
 */
const sideTab = (side: Side, at: number, [along, out, tall]: [number, number, number], size = SIZE): BackFeature => ({
  role: 'join-tab',
  side,
  outward: true,
  levels: [{ ring: onSide(side, [[at - along / 2, 0], [at - along / 2, -out], [at + along / 2, -out], [at + along / 2, 0]], size), z0: 0, z1: tall }],
})

/** The matching socket: an ordinary notch, open at the bottom face and at its side. */
const sideSocket = (side: Side, at: number, [along, deep, tall]: [number, number, number], size = SIZE): BackFeature => ({
  role: 'join-socket',
  side,
  levels: [{ ring: onSide(side, [[at - along / 2, 0], [at + along / 2, 0], [at + along / 2, deep], [at - along / 2, deep]], size), z0: 0, z1: tall }],
})

/** Exact volume of a one-level prism feature. */
const prismVolume = (f: BackFeature) => f.levels.reduce((sum, { ring, z0, z1 }) => sum + Math.abs(signedArea(ring)) * (z1 - z0), 0)

const bbox = (mesh: MeshData) => {
  const p = mesh.positions
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) [lo[k], hi[k]] = [Math.min(lo[k], p[i + k]), Math.max(hi[k], p[i + k])]
  }
  return { lo, hi }
}

/** Projected area of the faces lying on the bed (z = 0). */
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

const expectSolid = (mesh: MeshData, label: string) => {
  const check = checkMesh(mesh)
  expect(check.closed, `${label}: closed`).toBe(true)
  expect(check.manifold, `${label}: manifold`).toBe(true)
  expect(check.oriented, `${label}: oriented`).toBe(true)
  expect(check.volume, `${label}: positive volume`).toBeGreaterThan(0)
  expect(pinchedVertices(mesh), `${label}: pinched vertices`).toBe(0)
  expect(componentCount(mesh), `${label}: components`).toBe(1)
}

// The join under test: a 10 x 4 x 2.4 mm tab on the right side (side 1), and on the left side (side 3) a
// socket a touch bigger all round, so the volume arithmetic below cannot pass by cancelling out.
const TAB: [number, number, number] = [10, 4, 2.4]
const SOCKET: [number, number, number] = [11, 4.5, 2.6]

describe('an outward side tab', () => {
  it('validates as a tab and refuses the same ring wound as a notch', () => {
    const Q = float32Quantum(W)
    const tab = sideTab(1, 75, TAB)
    const [checked] = prepareFeatures([tab], W, H, Q)
    expect(checked.outward).toBe(true)
    expect(checked.side).toBe(1)
    // A ring wound the notch way, marked outward, is caught rather than meshed into a self-crossing solid.
    const reversed: BackFeature = { ...tab, levels: [{ ...tab.levels[0], ring: Float64Array.from([...tab.levels[0].ring].reverse()) }] }
    expect(() => prepareFeatures([reversed], W, H, Q)).toThrow(/wrong way round|beyond its side/)
    // An inward notch marked outward is caught too.
    expect(() => prepareFeatures([{ ...sideSocket(1, 75, SOCKET), outward: true }], W, H, Q)).toThrow(/beyond its side/)
    // A tab with no side has nothing to stand on.
    expect(() => prepareFeatures([{ ...tab, side: null }], W, H, Q)).toThrow(/no side to stand on/)
    // A tab at the corner leaves the side wall no room to step over it.
    expect(() => prepareFeatures([sideTab(1, 4, TAB)], W, H, Q)).toThrow(/corner/)
  })

  it('gives the side wall the same chain shape as a notch, mirrored', () => {
    const Q = float32Quantum(W)
    const [tab] = prepareFeatures([sideTab(1, 75, TAB)], W, H, Q)
    const [socket] = prepareFeatures([sideSocket(1, 75, TAB)], W, H, Q)
    const shape = (f: typeof tab) => notchChain([f], 1, W, H)!.map((p) => [p.s, p.z])
    // Rising flank at 70, across at the tab's top, falling at 80: s non-decreasing, both chains identical.
    // z is on the piece's float32 lattice (2.4 mm snaps to 2.399993896484375), which is the point of snapping.
    expect(shape(tab).map(([s]) => s)).toEqual([0, 70, 70, 80, 80, 150])
    expect(shape(tab).map(([, z]) => z)).toEqual([0, 0, 2.399993896484375, 2.399993896484375, 0, 0])
    expect(shape(tab)).toEqual(shape(socket))
    // Every chain point sits on the side line (x = w), so the wall face stays planar.
    for (const p of notchChain([tab], 1, W, H)!) expect(p.x).toBe(W)
  })

  it('detours the bottom outline outward over a tab and inward over a socket', () => {
    const Q = float32Quantum(W)
    const solid = prepareFeatures([sideTab(1, 75, TAB), sideSocket(3, 75, TAB)], W, H, Q)
    const { outer, holes } = bottomOutline(solid, W, H)
    expect(holes).toHaveLength(0)
    // Counter-clockwise, and exactly the footprint plus the tab's section less the socket's.
    expect(signedArea(outer)).toBeCloseTo(W * H + 10 * 4 - 10 * 4, 6)
    const xs: number[] = []
    for (let k = 0; k < outer.length; k += 2) xs.push(outer[k])
    expect(Math.max(...xs)).toBe(W + 4)
    expect(Math.min(...xs)).toBe(0)
  })
})

describe('buildPieceMesh with a tab and a socket', () => {
  const CASES: [string, HeightField][] = [
    ['flat plate', plateField(0, W, H)],
    ['noise relief', noiseField(2.4, W, H)],
  ]
  const OPTIONS: [string, PieceMeshOptions][] = [
    ['uniform', UNIFORM],
    ['adaptive', ADAPTIVE],
  ]

  for (const [fieldName, field] of CASES) {
    for (const [optionName, options] of OPTIONS) {
      const label = `${fieldName}, ${optionName}`

      it(`builds a sound solid with a tab right and a socket left (${label})`, () => {
        const design = config()
        const features = [sideTab(1, 75, TAB), sideSocket(3, 75, SOCKET)]
        const plain = buildPieceMesh(design, field, INTERIOR, options, [])
        const mesh = buildPieceMesh(design, field, INTERIOR, options, features)
        expectSolid(mesh, label)

        // The top surface is untouched: same triangles, same vertices, same index range.
        expect(mesh.topIndexCount).toBe(plain.topIndexCount)
        expect(mesh.indices.subarray(0, mesh.topIndexCount)).toEqual(plain.indices.subarray(0, plain.topIndexCount))
        const topVertices = plain.indices.subarray(0, plain.topIndexCount).reduce((a, b) => Math.max(a, b), 0) + 1
        expect(mesh.positions.subarray(0, 3 * topVertices)).toEqual(plain.positions.subarray(0, 3 * topVertices))

        // Plain volume plus the tab, less the socket.
        const added = prismVolume(features[0])
        const removed = prismVolume(features[1])
        expect(added).toBeCloseTo(10 * 4 * 2.4, 6)
        expect(removed).toBeCloseTo(11 * 4.5 * 2.6, 6)
        expect(meshVolume(mesh) - meshVolume(plain)).toBeCloseTo(added - removed, 2)

        // The tab reaches 4 mm past the right side and nothing reaches past the left one.
        const { lo, hi } = bbox(mesh)
        expect(hi[0]).toBeCloseTo(W + 4, 4)
        expect(lo[0]).toBe(0)
        expect(lo[2]).toBe(0)

        // The bed face is the footprint plus the tab's section less the socket's mouth.
        expect(bedArea(mesh)).toBeCloseTo(W * H + 10 * 4 - 11 * 4.5, 2)

        // The only overhang above the bed is the socket's ceiling: the tab's top looks UP, not down.
        expect(downwardArea(mesh, 0)).toBeCloseTo(11 * 4.5, 3)
      })
    }
  }

  it('builds a sound solid with a tab alone, a socket alone, and tabs on two sides', () => {
    const design = config()
    const field = noiseField(2.4, W, H)
    const SETS: [string, BackFeature[]][] = [
      ['tab alone', [sideTab(1, 75, TAB)]],
      ['socket alone', [sideSocket(3, 75, SOCKET)]],
      ['a tab on two sides', [sideTab(1, 75, TAB), sideTab(0, 40, TAB)]],
      ['two tabs on one side', [sideTab(1, 40, TAB), sideTab(1, 110, TAB)]],
      ['a tab and a socket on the same side', [sideTab(1, 40, TAB), sideSocket(1, 110, SOCKET)]],
      ['a tab facing a socket across the tile', [sideTab(1, 75, TAB), sideSocket(3, 75, SOCKET)]],
    ]
    for (const [name, features] of SETS) {
      const plain = buildPieceMesh(design, field, INTERIOR, UNIFORM, [])
      const mesh = buildPieceMesh(design, field, INTERIOR, UNIFORM, features)
      expectSolid(mesh, name)
      const added = features.filter((f) => f.outward).reduce((s, f) => s + prismVolume(f), 0)
      const removed = features.filter((f) => !f.outward).reduce((s, f) => s + prismVolume(f), 0)
      expect(meshVolume(mesh) - meshVolume(plain), `${name}: volume`).toBeCloseTo(added - removed, 2)
    }
  })

  it('gives the tab outward shading normals, not the inward ones a cavity gets', () => {
    const design = config()
    const mesh = buildPieceMesh(design, plateField(0, W, H), INTERIOR, UNIFORM, [sideTab(1, 75, TAB)])
    const p = mesh.positions
    const nrm = mesh.normals!
    // The tab's outer face stands at x = w + 4. Its vertices must look away from the tile (+x).
    let outerFace = 0
    for (let v = 0; v < p.length / 3; v++) {
      if (Math.abs(p[3 * v] - (W + 4)) > 1e-4) continue
      if (Math.abs(nrm[3 * v] - 1) > 1e-6) continue
      outerFace++
    }
    expect(outerFace, 'vertices on the tab outer face normalled +x').toBeGreaterThan(0)
    // Nothing out there may look back into the tile.
    for (let v = 0; v < p.length / 3; v++) {
      if (Math.abs(p[3 * v] - (W + 4)) > 1e-4) continue
      expect(nrm[3 * v], `vertex ${v} on the tab outer face`).toBeGreaterThanOrEqual(0)
    }
  })

  it('holds a tab to the rim of its own side where a cavity is held to the skin under the top', () => {
    // The design's own limit: a 4 mm plate (MIN_FIXING_THICKNESS), where the 0.6 mm joint edge drops the rim
    // to 3.4 mm. A cavity 3 mm deep is refused for its skin; a tab 3 mm high has no plate over it at all, so
    // what refuses it is the rim beside it, 0.8 mm above its top. The tab a 4 mm plate really takes is
    // 1.4 mm (a 1.8 mm socket less the key's 0.4 mm recess), which clears the same rim by 1.2 mm.
    const design = testConfig({ tile: { width: W, height: H, thickness: 4 } })
    const field = plateField(0, W, H)
    expect(() => buildPieceMesh(design, field, INTERIOR, UNIFORM, [sideSocket(3, 75, [10, 4, 3])])).toThrow(/within 0.8 mm of the top/)
    expect(() => buildPieceMesh(design, field, INTERIOR, UNIFORM, [sideTab(1, 75, [10, 4, 3])])).toThrow(
      /\(join-tab\) stands 3 mm high, within 0.8 mm of the rim of its own side \(lowest at 3.40 mm\)/,
    )
    const tab = sideTab(1, 75, [10, 4, 1.4])
    const mesh = buildPieceMesh(design, field, INTERIOR, UNIFORM, [tab])
    expectSolid(mesh, 'thin plate, tab only')
    const plain = buildPieceMesh(design, field, INTERIOR, UNIFORM, [])
    expect(meshVolume(mesh) - meshVolume(plain)).toBeCloseTo(prismVolume(tab), 2)
  })

  it('refuses a tab that would stand proud of the front face, on any relief', () => {
    // Nothing in the geometry stops this one: the sweep closes a solid whose bottom chain runs above the rim
    // (the spike built a sound 12 mm tab on a 6 mm plate and measured its volume exactly), so the tile would
    // ship with a visible spike instead of failing. The rim check above is what refuses it. It is a floor,
    // not the rule: how far below the rim a tab must sit, and that it must be thinner than the socket it
    // goes into, are the fixings layer's, since what covers a tab is the neighbour's plate.
    const design = config()
    for (const field of [plateField(0, W, H), noiseField(2.4, W, H)]) {
      expect(() => buildPieceMesh(design, field, INTERIOR, UNIFORM, [sideTab(1, 75, [10, 4, 12])])).toThrow(
        /stands 12 mm high, within 0.8 mm of the rim of its own side/,
      )
    }
  })

  it('snaps a tab that crosses a float32 binade on the lattice of the printed box', () => {
    // A 127.9 mm piece is in one binade and the tip of its tab, at 135.9 mm, in the next, where a float32
    // step is twice as coarse. The lattice has to be the coarser one, or a snapped coordinate out there is
    // not a float32 value at all: the predicates would check one number and the mesh carry another, and two
    // coordinates one step apart could be written as the same float32. That is what the snapping prevents.
    const w = 127.9
    const size = { w, h: w }
    const design = config({ tile: { width: w, height: w, thickness: THICKNESS } })
    const piece: PieceSpec = { ...INTERIOR, width: w, height: w, crop: { x0: 0, y0: 0, x1: w, y1: w } }
    const field = noiseField(2.4, w, w)
    const features = [sideTab(1, 64, [10, 8, 2.4], size), sideSocket(3, 64, SOCKET, size)]
    const plain = buildPieceMesh(design, field, piece, UNIFORM, [])
    const mesh = buildPieceMesh(design, field, piece, UNIFORM, features)
    expectSolid(mesh, 'binade')
    expect(bbox(mesh).hi[0]).toBeCloseTo(w + 8, 4)
    expect(meshVolume(mesh) - meshVolume(plain)).toBeCloseTo(prismVolume(features[0]) - prismVolume(features[1]), 2)
    // The lattice the mesher uses out there, against the piece's own (on the frounded side line the mesher
    // works from): every coordinate on the printed box's lattice is a float32 value, and the tab's tip on
    // the piece's own lattice is not.
    const f = Math.fround(w)
    const tabAt = (quantum: number) => prepareFeatures(features, f, f, quantum)[0].levels[0].ring
    for (const v of tabAt(float32Quantum(w + 8))) expect(Math.fround(v)).toBe(v)
    expect([...tabAt(float32Quantum(w))].some((v) => Math.fround(v) !== v)).toBe(true)
  })

  it('writes a tabbed, socketed tile to STEP that OCCT reads back with the same volume', async () => {
    const design = config()
    const features = [sideTab(1, 75, TAB), sideSocket(3, 75, SOCKET)]
    const mesh = buildPieceMesh(design, flatField(2.4, W, H), INTERIOR, { cellMm: 2, adaptive: { toleranceMm: 0.08 } }, features)
    expectSolid(mesh, 'step')
    const occt = await (await import('occt-import-js')).default()
    const result = occt.ReadStepFile(writeStep(mesh, { name: 'tabbed' }), { linearUnit: 'millimeter' })
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

  it('carries a tab alongside the key notches and clip pockets that already exist', () => {
    const design = config()
    const field = noiseField(2.4, W, H)
    const box = (cx: number, cy: number, sx: number, sy: number): Float64Array =>
      Float64Array.of(cx - sx / 2, cy - sy / 2, cx + sx / 2, cy - sy / 2, cx + sx / 2, cy + sy / 2, cx - sx / 2, cy + sy / 2)
    const features: BackFeature[] = [
      sideTab(1, 110, TAB),
      sideSocket(3, 110, SOCKET),
      { role: 'key-pocket', side: 0, levels: [{ ring: onSide(0, [[70, 0], [80, 0], [80, 6], [70, 6]]), z0: 0, z1: 1.8 }] },
      { role: 'clip-pocket', side: null, levels: [{ ring: box(75, 40, 28, 14), z0: 0, z1: 3 }] },
    ]
    const plain = buildPieceMesh(design, field, INTERIOR, UNIFORM, [])
    const mesh = buildPieceMesh(design, field, INTERIOR, UNIFORM, features)
    expectSolid(mesh, 'mixed')
    const added = features.filter((f) => f.outward).reduce((s, f) => s + prismVolume(f), 0)
    const removed = features.filter((f) => !f.outward).reduce((s, f) => s + prismVolume(f), 0)
    expect(meshVolume(mesh) - meshVolume(plain)).toBeCloseTo(added - removed, 2)
  })
})
