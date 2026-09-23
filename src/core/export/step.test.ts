import { describe, expect, it } from 'vitest'
import { computeLayout } from '../layout'
import { buildPieceMesh } from '../geometry/tileMesh'
import { flatField, noiseField, plateField, testConfig } from '../geometry/testFields'
import { checkMesh, meshVolume } from '../geometry/meshChecks'
import { ringFromRect, triangulatePolygon } from '../geometry/polygon'
import { extrudeProfileX, loftSolid } from '../geometry/prism'
import type { MeshData } from '../types'
import { fmtReal, stepString, writeStep } from './step'

const box = (size = 10): MeshData => {
  const c: [number, number, number][] = [
    [0, 0, 0],
    [size, 0, 0],
    [size, size, 0],
    [0, size, 0],
    [0, 0, size],
    [size, 0, size],
    [size, size, size],
    [0, size, size],
  ]
  const quads: [number, number, number, number][] = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ]
  const positions: number[] = []
  const indices: number[] = []
  for (const quad of quads) {
    const base = positions.length / 3
    for (const v of quad) positions.push(...c[v])
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), topIndexCount: 6 }
}

/**
 * A square plate, `size` wide and `t` thick, with a rectangular pocket cut up from its bottom face to
 * `depth` (a through hole when depth equals t), built face by face the way the tile mesher builds pockets.
 */
function plateWithPocket(size: number, t: number, hole: [number, number, number, number], depth: number): MeshData {
  const positions: number[] = []
  const indices: number[] = []
  const face = (points: number[][], tris: ArrayLike<number>, flip = false) => {
    const base = positions.length / 3
    for (const p of points) positions.push(p[0], p[1], p[2])
    for (let k = 0; k < tris.length; k += 3) {
      if (flip) indices.push(base + tris[k], base + tris[k + 2], base + tris[k + 1])
      else indices.push(base + tris[k], base + tris[k + 1], base + tris[k + 2])
    }
  }
  const outer = ringFromRect(0, 0, size, size)
  const inner = ringFromRect(...hole)
  const at = (ring: Float64Array, z: number) => Array.from({ length: ring.length / 2 }, (_, k) => [ring[2 * k], ring[2 * k + 1], z])
  const through = depth >= t
  // Bottom (facing -z) always has the pocket's mouth as a hole; the top too when the hole goes through.
  face([...at(outer, 0), ...at(inner, 0)], triangulatePolygon(outer, [inner]), true)
  if (through) face([...at(outer, t), ...at(inner, t)], triangulatePolygon(outer, [inner]))
  else face(at(outer, t), triangulatePolygon(outer))
  for (let k = 0; k < 4; k++) {
    const j = (k + 1) % 4
    const [ax, ay, bx, by] = [outer[2 * k], outer[2 * k + 1], outer[2 * j], outer[2 * j + 1]]
    face([[ax, ay, 0], [bx, by, 0], [bx, by, t], [ax, ay, t]], [0, 1, 2, 0, 2, 3])
    // Pocket walls face into the pocket, so they run the ring backwards.
    const [cx, cy, dx, dy] = [inner[2 * j], inner[2 * j + 1], inner[2 * k], inner[2 * k + 1]]
    face([[cx, cy, 0], [dx, dy, 0], [dx, dy, depth], [cx, cy, depth]], [0, 1, 2, 0, 2, 3])
  }
  if (!through) face(at(inner, depth), triangulatePolygon(inner), true)
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), topIndexCount: 0 }
}

/** Solids and volume that OCCT reads back from our STEP bytes. */
async function occtReadBack(bytes: Uint8Array) {
  const occtFactory = (await import('occt-import-js')).default
  const occt = await occtFactory()
  const result = occt.ReadStepFile(bytes, { linearUnit: 'millimeter' })
  let volume = 0
  for (const m of result.meshes) {
    const p = m.attributes.position.array
    const idx = m.index.array
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3
      const b = idx[i + 1] * 3
      const c = idx[i + 2] * 3
      volume +=
        (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
          p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
          p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) /
        6
    }
  }
  return { success: result.success, meshes: result.meshes.length, volume }
}

interface Entity {
  id: number
  type: string
  body: string
}

function parseStep(bytes: Uint8Array) {
  const text = new TextDecoder().decode(bytes)
  const entities = new Map<number, Entity>()
  const lines = text.split('\n')
  for (const line of lines) {
    const match = /^#(\d+)=([A-Z_0-9]*)\((.*)\);$/.exec(line)
    if (!match) continue
    entities.set(Number(match[1]), { id: Number(match[1]), type: match[2], body: match[3] })
  }
  const of = (type: string) => [...entities.values()].filter((e) => e.type === type)
  const danglingRefs: number[] = []
  for (const entity of entities.values()) {
    for (const ref of entity.body.matchAll(/#(\d+)/g)) {
      if (!entities.has(Number(ref[1]))) danglingRefs.push(Number(ref[1]))
    }
  }
  const orientedEdges = of('ORIENTED_EDGE').map((e) => {
    const match = /#(\d+),\.([TF])\.$/.exec(e.body) as RegExpExecArray
    return { edge: Number(match[1]), sense: match[2] === 'T' }
  })
  return { text, lines, entities, of, danglingRefs, orientedEdges }
}

/** Every EDGE_CURVE must be walked exactly once forwards and once backwards. */
function edgeUsage(parsed: ReturnType<typeof parseStep>) {
  const usage = new Map<number, { forward: number; backward: number }>()
  for (const e of parsed.of('EDGE_CURVE')) usage.set(e.id, { forward: 0, backward: 0 })
  for (const oe of parsed.orientedEdges) {
    const entry = usage.get(oe.edge)
    if (!entry) return null
    if (oe.sense) entry.forward++
    else entry.backward++
  }
  return usage
}

const config = testConfig()
const plan = computeLayout({
  surface: { width: 300, height: 300 },
  tile: { width: 150, height: 150 },
  joint: 0,
  layout: { origin: 'corner', rowOffset: 0 },
})
const fullTile = plan.pieces[0]

describe('fmtReal', () => {
  it('always writes a decimal point', () => {
    expect(fmtReal(150, 6)).toBe('150.')
    expect(fmtReal(0, 6)).toBe('0.')
    expect(fmtReal(-0, 6)).toBe('0.')
    expect(fmtReal(5.8, 6)).toBe('5.8')
    expect(fmtReal(1 / 3, 6)).toBe('0.333333')
    expect(fmtReal(0.0000004, 6)).toBe('0.')
  })

  it('uses a STEP exponent when the number is tiny', () => {
    expect(fmtReal(1e-9, 12)).toBe('1.E-9')
  })
})

describe('stepString', () => {
  it('escapes apostrophes and non-ASCII', () => {
    expect(stepString("tile's")).toBe("'tile''s'")
    expect(stepString('décor')).toBe("'d\\X2\\00E9\\X0\\cor'")
  })
})

describe('writeStep', () => {
  it('writes an AP214 header with the name and a fixed timestamp', () => {
    const parsed = parseStep(writeStep(box(), { name: 'cube', timestamp: '2026-01-01T00:00:00' }))
    expect(parsed.lines[0]).toBe('ISO-10303-21;')
    expect(parsed.text).toContain("FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));")
    expect(parsed.text).toContain("FILE_NAME('cube.step','2026-01-01T00:00:00',(''),(''),'Tessera geometry','Tessera','');")
    expect(parsed.text.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true)
  })

  it('merges the coplanar triangles of a cube into 6 faces', () => {
    const parsed = parseStep(writeStep(box(), { name: 'cube' }))
    expect(parsed.of('ADVANCED_FACE')).toHaveLength(6)
    expect(parsed.of('CLOSED_SHELL')).toHaveLength(1)
    expect(parsed.of('MANIFOLD_SOLID_BREP')).toHaveLength(1)
    expect(parsed.of('VERTEX_POINT')).toHaveLength(8)
    expect(parsed.of('EDGE_CURVE')).toHaveLength(12)
    expect(parsed.of('ORIENTED_EDGE')).toHaveLength(24)
  })

  it('resolves every reference and shares each edge between two faces', () => {
    const parsed = parseStep(writeStep(buildPieceMesh(config, noiseField(2.4, 150, 150), fullTile, { cellMm: 12 }), { name: 'tile' }))
    expect(parsed.danglingRefs).toEqual([])
    const usage = edgeUsage(parsed)
    expect(usage).not.toBeNull()
    for (const [, counts] of usage as Map<number, { forward: number; backward: number }>) {
      expect(counts).toEqual({ forward: 1, backward: 1 })
    }
    const shell = parsed.of('CLOSED_SHELL')[0]
    expect(shell.body.match(/#\d+/g)).toHaveLength(parsed.of('ADVANCED_FACE').length)
  })

  it('gives a chamfered flat tile exactly 10 faces, or 6 without a bevel', () => {
    const adaptive = { cellMm: 1.2, adaptive: { toleranceMm: 0.04 } }
    const chamfered = writeStep(buildPieceMesh(config, flatField(2.4, 150, 150), fullTile, adaptive), { name: 'plane' })
    expect(parseStep(chamfered).of('ADVANCED_FACE')).toHaveLength(10)

    const sharp = testConfig({ bevel: 0 })
    const noBevel = writeStep(buildPieceMesh(sharp, flatField(2.4, 150, 150), fullTile, adaptive), { name: 'plane' })
    expect(parseStep(noBevel).of('ADVANCED_FACE')).toHaveLength(6)

    // A tile with no relief at all is the same chamfered box, one plate thick.
    const plate = writeStep(buildPieceMesh(config, plateField(0, 150, 150), fullTile, adaptive), { name: 'plate' })
    expect(parseStep(plate).of('ADVANCED_FACE')).toHaveLength(10)
  })

  it('merges each wall and the bottom into one face', () => {
    const mesh = buildPieceMesh(config, noiseField(2.4, 150, 150), fullTile, { cellMm: 12 })
    const parsed = parseStep(writeStep(mesh, { name: 'tile' }))
    const faces = parsed.of('ADVANCED_FACE').length
    const topTriangles = mesh.topIndexCount / 3
    // Everything below the rim collapses to five faces: four walls and the bottom.
    expect(faces).toBeLessThanOrEqual(topTriangles + 5)
    expect(faces).toBeGreaterThan(topTriangles / 2)
  })

  it('handles a large mesh without a quadratic string blow-up', () => {
    const mesh = buildPieceMesh(config, noiseField(2.4, 150, 150), fullTile, { cellMm: 0.6 })
    const started = performance.now()
    const bytes = writeStep(mesh, { name: 'tile' })
    const elapsed = performance.now() - started
    expect(mesh.indices.length / 3).toBeGreaterThan(120_000)
    expect(bytes.length).toBeGreaterThan(1_000_000)
    expect(elapsed).toBeLessThan(20_000)
  })
})

describe('writeStep with holes and several pieces', () => {
  it('writes a bottom face around a pocket as one face with a hole', () => {
    const mesh = plateWithPocket(40, 5, [10, 12, 22, 20], 3)
    expect(checkMesh(mesh)).toMatchObject({ closed: true, manifold: true, oriented: true })
    const parsed = parseStep(writeStep(mesh, { name: 'pocket' }))
    // Top, 4 walls, bottom with a hole, 4 pocket walls and the ceiling.
    expect(parsed.of('ADVANCED_FACE')).toHaveLength(11)
    expect(parsed.of('FACE_OUTER_BOUND')).toHaveLength(11)
    expect(parsed.of('FACE_BOUND')).toHaveLength(1)
    expect(parsed.danglingRefs).toEqual([])
    const bottom = parsed.of('ADVANCED_FACE').filter((f) => (f.body.match(/#\d+/g) as string[]).length === 3)
    expect(bottom).toHaveLength(1)
    for (const [, counts] of edgeUsage(parsed) as Map<number, { forward: number; backward: number }>) {
      expect(counts).toEqual({ forward: 1, backward: 1 })
    }
  })

  it('writes a through hole as a hole in both the top and the bottom face', () => {
    const parsed = parseStep(writeStep(plateWithPocket(40, 5, [10, 10, 20, 20], 5), { name: 'frame' }))
    expect(parsed.of('ADVANCED_FACE')).toHaveLength(10)
    expect(parsed.of('FACE_BOUND')).toHaveLength(2)
  })

  it('writes separate pieces as separate solids in one file', () => {
    const a = loftSolid([
      { z: 0, ring: ringFromRect(0, 0, 10, 10) },
      { z: 4, ring: ringFromRect(0, 0, 10, 10) },
    ])
    const b = loftSolid([
      { z: 0, ring: ringFromRect(20, 0, 26, 8) },
      { z: 2, ring: ringFromRect(20, 0, 26, 8) },
    ])
    const both: MeshData = {
      positions: Float32Array.of(...a.positions, ...b.positions),
      indices: Uint32Array.of(...a.indices, ...Array.from(b.indices, (i) => i + a.positions.length / 3)),
      topIndexCount: 0,
    }
    const parsed = parseStep(writeStep(both, { name: 'parts' }))
    expect(parsed.of('MANIFOLD_SOLID_BREP')).toHaveLength(2)
    expect(parsed.of('CLOSED_SHELL')).toHaveLength(2)
    expect(parsed.of('ADVANCED_FACE')).toHaveLength(12)
    expect(parsed.of('MANIFOLD_SOLID_BREP').map((e) => e.body.split(',')[0])).toEqual(["'parts 1'", "'parts 2'"])
    const shells = parsed.of('CLOSED_SHELL').map((e) => (e.body.match(/#\d+/g) as string[]).length)
    expect(shells).toEqual([6, 6])
    const rep = parsed.of('ADVANCED_BREP_SHAPE_REPRESENTATION')[0]
    expect(rep.body.match(/#\d+/g)).toHaveLength(4)
  })
})

describe('occt-import-js (OCCT 7.6) reads our STEP back', () => {
  it('reads a face with a hole back as a solid with the exact volume', async () => {
    const mesh = plateWithPocket(40, 5, [10, 12, 22, 20], 3)
    const back = await occtReadBack(writeStep(mesh, { name: 'pocket' }))
    expect(back.success).toBe(true)
    expect(back.meshes).toBe(1)
    expect(back.volume).toBeCloseTo(40 * 40 * 5 - 12 * 8 * 3, 3)
    const frame = await occtReadBack(writeStep(plateWithPocket(40, 5, [10, 10, 20, 20], 5), { name: 'frame' }))
    expect(frame.meshes).toBe(1)
    expect(frame.volume).toBeCloseTo(40 * 40 * 5 - 10 * 10 * 5, 3)
  }, 120_000)

  it('reads an extruded bar with slots and recesses back with the exact volume', async () => {
    const profile = Float64Array.of(0, 0, 30, 0, 30, 6, 22, 6, 22, 2.5, 8, 2.5, 8, 6, 0, 6)
    const cuts = [
      { x0: 20, x1: 24, y0: 1, y1: 7, z0: 0, z1: 3.5 },
      { x0: 18, x1: 26, y0: 0.5, y1: 7.5, z0: 3.5, z1: 6 },
      { x0: 58, x1: 62, y0: 10, y1: 20, z0: 0, z1: 2.5 },
    ]
    const mesh = extrudeProfileX(profile, 80, { cuts })
    const parsed = parseStep(writeStep(mesh, { name: 'bar' }))
    // The bottom face holes around both slots; the recess floor holes around its slot.
    expect(parsed.of('FACE_BOUND').length).toBeGreaterThanOrEqual(3)
    const back = await occtReadBack(writeStep(mesh, { name: 'bar' }))
    expect(back.success).toBe(true)
    expect(back.meshes).toBe(1)
    expect(back.volume / meshVolume(mesh)).toBeCloseTo(1, 6)
  }, 120_000)

  it('reads the printed parts back: a wall clip with its drill hole and countersink, and a key', async () => {
    const { buildClipMesh, clipSpec } = await import('../fixing/mount')
    const { buildKeyMesh, wallKeySpec } = await import('../fixing/joins')
    const config = testConfig({ lock: 'keys', mount: 'clips' })
    const key = wallKeySpec(config)
    expect(key).not.toBeNull()
    for (const [name, mesh] of [
      ['clip', buildClipMesh(clipSpec('standard'))],
      ['key', buildKeyMesh(config, key!)],
    ] as const) {
      const back = await occtReadBack(writeStep(mesh, { name }))
      expect(back.success, name).toBe(true)
      expect(back.meshes, name).toBe(1)
      expect(back.volume / meshVolume(mesh), name).toBeCloseTo(1, 6)
    }
  }, 120_000)

  it('reads two pieces back as two solids with the summed volume', async () => {
    const a = loftSolid([
      { z: 0, ring: ringFromRect(0, 0, 10, 10) },
      { z: 4, ring: ringFromRect(0, 0, 10, 10) },
    ])
    const b = extrudeProfileX(Float64Array.of(0, 0, 8, 0, 8, 3, 0, 3), 12)
    const shifted = b.positions.map((v, k) => (k % 3 === 1 ? v + 30 : v))
    const both: MeshData = {
      positions: Float32Array.of(...a.positions, ...shifted),
      indices: Uint32Array.of(...a.indices, ...Array.from(b.indices, (i) => i + a.positions.length / 3)),
      topIndexCount: 0,
    }
    const back = await occtReadBack(writeStep(both, { name: 'parts' }))
    expect(back.success).toBe(true)
    expect(back.meshes).toBe(2)
    expect(back.volume).toBeCloseTo(400 + 8 * 3 * 12, 3)
  }, 120_000)

  it('parses a tile as a solid with the right bounding box and volume', async () => {
    const occtFactory = (await import('occt-import-js')).default
    const occt = await occtFactory()
    const mesh = buildPieceMesh(config, noiseField(2.4, 150, 150), fullTile, { cellMm: 12 })
    const bytes = writeStep(mesh, { name: 'tile' })
    const result = occt.ReadStepFile(bytes, { linearUnit: 'millimeter' })
    expect(result.success).toBe(true)
    let triangles = 0
    let volume = 0
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    for (const m of result.meshes) {
      const p = m.attributes.position.array
      const idx = m.index.array
      triangles += idx.length / 3
      for (let i = 0; i < p.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], p[i + k])
          hi[k] = Math.max(hi[k], p[i + k])
        }
      }
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i] * 3
        const b = idx[i + 1] * 3
        const c = idx[i + 2] * 3
        volume +=
          (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
            p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
            p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) /
          6
      }
    }
    expect(triangles).toBeGreaterThan(0)
    expect(lo[0]).toBeCloseTo(0, 3)
    expect(lo[2]).toBeCloseTo(0, 3)
    expect(hi[0]).toBeCloseTo(150, 3)
    expect(hi[1]).toBeCloseTo(150, 3)
    // Positive volume means the faces came back with outward normals.
    expect(volume).toBeGreaterThan(0)
    expect(volume / meshVolume(mesh)).toBeCloseTo(1, 2)
  }, 120_000)
})
