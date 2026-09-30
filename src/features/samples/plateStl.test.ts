import { describe, expect, it } from 'vitest'
import { writeStl } from '@/core/export/stl'
import type { MeshData } from '@/core/types'
import { stlBounds, stlPlate, stlTriangleCount } from './plateStl'

/** A closed box from the origin, the way every written piece sits: on the bed, from its front-left corner. */
function box(w: number, h: number, d: number): MeshData {
  const positions = new Float32Array([0, 0, 0, w, 0, 0, w, h, 0, 0, h, 0, 0, 0, d, w, 0, d, w, h, d, 0, h, d])
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
  ])
  return { positions, indices, topIndexCount: 0 }
}

const header = (data: Uint8Array) => new TextDecoder().decode(data.subarray(0, 80)).trimEnd()

describe('stlPlate', () => {
  it('moves each file to its place and keeps every triangle', () => {
    const a = writeStl(box(45, 45, 5), 'a')
    const b = writeStl(box(20.5, 45, 6), 'b')
    const plate = stlPlate('Tessera plate', [
      { data: a, x: 10, y: 20 },
      { data: b, x: 60, y: 20 },
    ])
    expect(stlTriangleCount(plate)).toBe(24)
    expect(stlBounds(plate)).toEqual({ min: [10, 20, 0], max: [80.5, 65, 6] })
    expect(header(plate)).toBe('Tessera plate')
  })

  it('leaves the normals alone: a move turns nothing', () => {
    const a = writeStl(box(10, 10, 2), 'a')
    const plate = stlPlate('p', [{ data: a, x: 100, y: 50 }])
    for (let t = 0; t < 12; t++) {
      const at = 84 + t * 50
      expect(plate.subarray(at, at + 12)).toEqual(a.subarray(at, at + 12))
    }
  })

  it('never writes a header a reader would take for ASCII STL', () => {
    const plate = stlPlate('solid plate é', [{ data: writeStl(box(1, 1, 1), 'a'), x: 0, y: 0 }])
    expect(header(plate).startsWith('solid')).toBe(false)
    expect([...plate.subarray(0, 80)].every((byte) => byte >= 0x20 && byte <= 0x7e)).toBe(true)
  })

  it('refuses a file that is not a binary STL', () => {
    expect(() => stlPlate('p', [{ data: new Uint8Array(10), x: 0, y: 0 }])).toThrow(/too short/)
    const lying = writeStl(box(1, 1, 1), 'a')
    new DataView(lying.buffer).setUint32(80, 13, true)
    expect(() => stlTriangleCount(lying)).toThrow(/does not match/)
  })
})
