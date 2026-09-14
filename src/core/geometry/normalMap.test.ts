import { describe, expect, it } from 'vitest'
import type { PieceSpec } from '../types'
import { bakeNormalMap } from './normalMap'
import { flatField, plateField, sineField, testConfig } from './testFields'

const piece: PieceSpec = {
  id: 'full',
  mark: 'A',
  kind: 'full',
  label: 'Full tile',
  crop: { x0: 0, y0: 0, x1: 150, y1: 150 },
  width: 150,
  height: 150,
  count: 1,
}

const normalAt = (map: { width: number; height: number; data: Uint8Array }, i: number, j: number) => {
  const o = (j * map.width + i) * 4
  return [map.data[o] / 255 * 2 - 1, map.data[o + 1] / 255 * 2 - 1, map.data[o + 2] / 255 * 2 - 1]
}

describe('bakeNormalMap', () => {
  const config = testConfig()

  it('covers the piece at the requested resolution, capped at 2048', () => {
    const map = bakeNormalMap(config, sineField(2.4, 150, 150), piece, 0.5)
    expect(map.width).toBe(300)
    expect(map.height).toBe(300)
    expect(map.data.length).toBe(300 * 300 * 4)
    expect(bakeNormalMap(config, sineField(2.4, 150, 150), piece, 0.01).width).toBe(2048)
  })

  it('points straight up on a flat plateau and is opaque', () => {
    const map = bakeNormalMap(config, flatField(2.4, 150, 150), piece, 1)
    const [nx, ny, nz] = normalAt(map, 75, 75)
    expect(nx).toBeCloseTo(0, 2)
    expect(ny).toBeCloseTo(0, 2)
    expect(nz).toBeCloseTo(1, 2)
    expect(map.data[3]).toBe(255)
  })

  it('tilts 45 degrees on the chamfer, row 0 at y = 0', () => {
    const map = bakeNormalMap(config, plateField(0, 150, 150), piece, 0.2)
    // First row sits inside the bevel band at the y = 0 edge: the normal leans towards -y.
    const [, nyBottom] = normalAt(map, 375, 0)
    expect(nyBottom).toBeCloseTo(-Math.SQRT1_2, 1)
    const [, nyTop] = normalAt(map, 375, map.height - 1)
    expect(nyTop).toBeCloseTo(Math.SQRT1_2, 1)
    const [nxLeft] = normalAt(map, 0, 375)
    expect(nxLeft).toBeCloseTo(-Math.SQRT1_2, 1)
  })

  it('follows the relief slope', () => {
    const field = sineField(2.4, 150, 150)
    const texelMm = 0.25
    const map = bakeNormalMap(config, field, piece, texelMm)
    // Skip the 0.6 mm chamfer band at both ends: the rim leans 45 degrees there by design.
    const skip = Math.ceil(0.7 / texelMm)
    let steepest = 0
    for (let i = skip; i < map.width - skip; i++) {
      const [nx] = normalAt(map, i, Math.floor(map.height / 2))
      steepest = Math.max(steepest, Math.abs(nx))
    }
    // The sine has slope 2.4/2 * 2pi * 2 / 150 = 0.1 at its steepest, so nx reaches about 0.1.
    expect(steepest).toBeGreaterThan(0.05)
    expect(steepest).toBeLessThan(0.3)
  })
})
