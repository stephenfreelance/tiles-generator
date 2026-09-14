import { describe, expect, it } from 'vitest'
import { computeLayout } from '../layout'
import { buildPieceMesh } from '../geometry/tileMesh'
import { noiseField, testConfig } from '../geometry/testFields'
import type { MeshData } from '../types'
import { writeStl } from './stl'

const triangle: MeshData = {
  positions: Float32Array.from([0, 0, 0, 10, 0, 0, 0, 10, 0]),
  indices: Uint32Array.from([0, 1, 2]),
  topIndexCount: 3,
}

const readStl = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(80, true)
  const facets: { normal: number[]; vertices: number[][] }[] = []
  for (let t = 0; t < count; t++) {
    const o = 84 + 50 * t
    const f = (k: number) => view.getFloat32(o + 4 * k, true)
    facets.push({
      normal: [f(0), f(1), f(2)],
      vertices: [
        [f(3), f(4), f(5)],
        [f(6), f(7), f(8)],
        [f(9), f(10), f(11)],
      ],
    })
  }
  return {
    header: new TextDecoder().decode(bytes.slice(0, 80)),
    count,
    facets,
    attribute: view.getUint16(84 + 48, true),
  }
}

describe('writeStl', () => {
  it('writes 84 + 50n bytes with the facet normal from the winding', () => {
    const bytes = writeStl(triangle, 'Tessera')
    expect(bytes).toHaveLength(84 + 50)
    const parsed = readStl(bytes)
    expect(parsed.count).toBe(1)
    expect(parsed.facets[0].normal).toEqual([0, 0, 1])
    expect(parsed.facets[0].vertices).toEqual([
      [0, 0, 0],
      [10, 0, 0],
      [0, 10, 0],
    ])
    expect(parsed.attribute).toBe(0)
  })

  it('pads the header to 80 bytes and keeps it ASCII', () => {
    const parsed = readStl(writeStl(triangle, 'Tessera A full tile'))
    expect(parsed.header.slice(0, 19)).toBe('Tessera A full tile')
    expect(parsed.header).toHaveLength(80)
    const accented = readStl(writeStl(triangle, 'Motif décoratif'))
    expect(accented.header.slice(0, 15)).toBe('Motif d coratif')
  })

  it('truncates a long header', () => {
    const parsed = readStl(writeStl(triangle, 'x'.repeat(200)))
    expect(parsed.header).toBe('x'.repeat(80))
  })

  it('never starts the header with solid, which would read as ASCII STL', () => {
    const parsed = readStl(writeStl(triangle, 'solid tile'))
    expect(parsed.header.startsWith('solid')).toBe(false)
    expect(parsed.header.trim()).toBe('binary solid tile')
  })

  it('round-trips a whole tile', () => {
    const config = testConfig()
    const plan = computeLayout({
      surface: { width: 300, height: 300 },
      tile: { width: 150, height: 150 },
      joint: 0,
      layout: { origin: 'corner', rowOffset: 0 },
    })
    const mesh = buildPieceMesh(config, noiseField(2.4, 150, 150), plan.pieces[0], { cellMm: 4 })
    const parsed = readStl(writeStl(mesh, 'Tessera tile'))
    expect(parsed.count).toBe(mesh.indices.length / 3)
    for (const facet of parsed.facets) {
      expect(Math.hypot(...facet.normal)).toBeCloseTo(1, 5)
    }
  })
})
