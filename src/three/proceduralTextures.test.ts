import { describe, expect, it } from 'vitest'
import { generateGrainData, periodicFbm, periodicValueNoise } from './proceduralTextures'

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

  it('the grain map is deterministic, centred on mid grey in red and opaque', () => {
    const size = 64
    const a = generateGrainData(size, 3)
    expect(a).toEqual(generateGrainData(size, 3))
    expect(a).not.toEqual(generateGrainData(size, 4))
    let sum = 0
    let min = 255
    let max = 0
    for (let k = 0; k < size * size; k++) {
      const red = a[k * 4]
      sum += red
      min = Math.min(min, red)
      max = Math.max(max, red)
      expect(a[k * 4 + 3]).toBe(255)
    }
    const mean = sum / (size * size)
    expect(mean).toBeGreaterThan(108)
    expect(mean).toBeLessThan(148)
    // A visible grain, not a flat fill.
    expect(max - min).toBeGreaterThan(60)
  })
})
