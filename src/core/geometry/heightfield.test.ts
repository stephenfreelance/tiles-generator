import { describe, expect, it } from 'vitest'
import type { PieceSpec } from '../types'
import { applyBevel, edgeDistance, effectiveBevel, patternCoord, pieceTopSampler } from './heightfield'
import { flatField, noiseField, plateField, testConfig } from './testFields'

const fullPiece: Pick<PieceSpec, 'crop' | 'width' | 'height'> = {
  crop: { x0: 0, y0: 0, x1: 150, y1: 150 },
  width: 150,
  height: 150,
}

describe('effectiveBevel', () => {
  it('never eats more than half the base plate', () => {
    expect(effectiveBevel(testConfig({ bevel: 0.6 }))).toBe(0.6)
    expect(effectiveBevel(testConfig({ bevel: 3, tile: { width: 150, height: 150, thickness: 1.2 } }))).toBe(0.6)
    expect(effectiveBevel(testConfig({ bevel: 0 }))).toBe(0)
  })
})

describe('applyBevel', () => {
  it('leaves the surface alone away from the edges', () => {
    expect(applyBevel(6.4, 20, 4, 0.6)).toBe(6.4)
  })

  it('cuts a 45 degree chamfer at the rim', () => {
    expect(applyBevel(6.4, 0, 4, 0.6)).toBeCloseTo(5.8, 12)
    expect(applyBevel(6.4, 0.3, 4, 0.6)).toBeCloseTo(6.1, 12)
    expect(applyBevel(6.4, 0.6, 4, 0.6)).toBeCloseTo(6.4, 12)
  })

  it('chamfers whatever the relief height is at the rim', () => {
    // A valley sitting on the base plate and a crest 2.4 mm up both lose the full chamfer.
    expect(applyBevel(4.2, 0, 4, 0.6)).toBeCloseTo(3.6, 12)
    expect(applyBevel(4.2, 0.2, 4, 0.6)).toBeCloseTo(3.8, 12)
    expect(applyBevel(6.4, 0, 4, 0.6)).toBeCloseTo(5.8, 12)
  })

  it('keeps a flat tile above thickness minus bevel', () => {
    expect(applyBevel(4, 0, 4, 0.6)).toBeCloseTo(3.4, 12)
    expect(applyBevel(-5, 0, 4, 0.6)).toBe(3.4)
  })

  it('is a no-op without a bevel', () => {
    expect(applyBevel(6.4, 0, 4, 0)).toBe(6.4)
  })
})

describe('edgeDistance', () => {
  it('measures the nearest of the four edges', () => {
    expect(edgeDistance(10, 70, 150, 150)).toBe(10)
    expect(edgeDistance(75, 149, 150, 150)).toBe(1)
    expect(edgeDistance(0, 0, 150, 150)).toBe(0)
  })
})

describe('patternCoord', () => {
  it('maps one full period onto zero so opposite edges meet', () => {
    expect(patternCoord(150, 150, 0, 150, 150)).toBe(0)
    expect(patternCoord(0, 150, 0, 150, 150)).toBe(0)
    expect(patternCoord(25, 125, 25, 150, 150)).toBe(50)
  })

  it('takes the far edge from the crop, not from the width', () => {
    // A cut piece whose width rounds: the shared edge must still land on the tile edge exactly.
    expect(patternCoord(33.33, 33.33, 116.67, 150, 150)).toBe(0)
  })

  it('wraps a running bond period', () => {
    expect(patternCoord(75, 150, 0, 150, 75)).toBe(0)
    expect(patternCoord(100, 150, 0, 150, 75)).toBeCloseTo(25, 12)
  })
})

describe('pieceTopSampler', () => {
  const config = testConfig()

  it('puts the flat relief on top of the base plate', () => {
    const sample = pieceTopSampler(config, flatField(2.4, 150, 150), fullPiece)
    expect(sample(75, 75)).toBeCloseTo(6.4, 12)
    expect(sample(0, 75)).toBeCloseTo(5.8, 12)
    expect(sample(0.3, 75)).toBeCloseTo(6.1, 12)
  })

  it('chamfers a tile with no relief at all', () => {
    const sample = pieceTopSampler(config, plateField(0, 150, 150), fullPiece)
    expect(sample(75, 75)).toBeCloseTo(4, 12)
    expect(sample(0, 75)).toBeCloseTo(3.4, 12)
  })

  it('chamfers a shallow relief that never reaches the texture depth', () => {
    // The "Plane" texture asks for depth but stays flat: the chamfer must still cut the rim.
    const sample = pieceTopSampler(config, plateField(2.4, 150, 150), fullPiece)
    expect(sample(75, 75)).toBeCloseTo(4, 12)
    expect(sample(0, 75)).toBeCloseTo(3.4, 12)
    expect(sample(0.3, 75)).toBeCloseTo(3.7, 12)
  })

  it('gives bit-identical heights on the two edges of a tile', () => {
    const sample = pieceTopSampler(config, noiseField(2.4, 150, 150), fullPiece)
    for (let y = 0; y <= 150; y += 3.75) expect(sample(150, y)).toBe(sample(0, y))
    for (let x = 0; x <= 150; x += 3.75) expect(sample(x, 150)).toBe(sample(x, 0))
  })

  it('gives a cut piece the slice of pattern it replaces', () => {
    const field = noiseField(2.4, 150, 150)
    const full = pieceTopSampler(config, field, fullPiece)
    const leftCut = pieceTopSampler(config, field, {
      crop: { x0: 25, y0: 0, x1: 150, y1: 150 },
      width: 125,
      height: 150,
    })
    // Same pattern point, away from both pieces' edges: the relief is continuous across the joint.
    for (let y = 10; y < 140; y += 10) expect(leftCut(40, y)).toBe(full(65, y))
    // The cut piece's right rim is the tile edge, so it meets the next tile's left rim exactly.
    for (let y = 10; y < 140; y += 10) expect(leftCut(125, y)).toBe(full(0, y))
  })
})
