import { describe, expect, it } from 'vitest'
import { computeLayout } from '../layout'
import { buildPieceMesh } from '../geometry/tileMesh'
import { flatField, noiseField, plateField, testConfig } from '../geometry/testFields'
import { meshVolume } from '../geometry/meshChecks'
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

describe('occt-import-js (OCCT 7.6) reads our STEP back', () => {
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
