import { describe, expect, it } from 'vitest'
import { generateDetailData, generateFlakeData, periodicFbm, periodicValueNoise } from './proceduralTextures'

describe('procedural textures', () => {
  it('noise is periodic, so textures tile without seams', () => {
    for (const [x, y] of [
      [0.3, 0.7],
      [2.25, 5.5],
    ]) {
      expect(periodicValueNoise(x, y, 8, 3)).toBeCloseTo(periodicValueNoise(x + 8, y, 8, 3), 12)
      expect(periodicValueNoise(x, y, 8, 3)).toBeCloseTo(periodicValueNoise(x, y + 8, 8, 3), 12)
    }
    expect(periodicFbm(0, 0.4, 4, 4, 1)).toBeCloseTo(periodicFbm(1, 0.4, 4, 4, 1), 12)
  })

  it('flake coverage is close to the requested fraction', () => {
    const size = 128
    const data = generateFlakeData({ coverage: 0.1, radiusPx: [1.5, 3], seed: 4 }, size)
    let covered = 0
    for (let k = 0; k < size * size; k++) if (data[k * 4 + 3] > 0) covered++
    const fraction = covered / (size * size)
    expect(fraction).toBeGreaterThan(0.05)
    expect(fraction).toBeLessThan(0.14)
  })

  it('detail maps are deterministic and use their channels', () => {
    const a = generateDetailData('stone', 64, 3)
    const b = generateDetailData('stone', 64, 3)
    expect(a).toEqual(b)
    let speckle = 0
    for (let k = 0; k < 64 * 64; k++) speckle += a[k * 4 + 1]
    expect(speckle).toBeGreaterThan(0)
  })
})
