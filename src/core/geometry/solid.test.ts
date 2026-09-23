import { describe, expect, it } from 'vitest'
import type { BackFeature } from '../fixing/types'
import { float32Quantum } from './grid'
import { ringFromRect, signedArea } from './polygon'
import {
  bottomOutline,
  loopsToPolygons,
  notchChain,
  prepareFeatures,
  ringDifference,
  ringInside,
  type SolidFeature,
} from './solid'

const Q = float32Quantum(150)
const rect = ringFromRect
const area = (loops: Float64Array[]) => loops.reduce((sum, l) => sum + signedArea(l), 0)

describe('ringInside', () => {
  it('accepts strict nesting and nesting along shared stretches', () => {
    expect(ringInside(rect(2, 2, 8, 8), rect(0, 0, 10, 10))).toBe(true)
    expect(ringInside(rect(0, 2, 10, 8), rect(0, 0, 10, 10))).toBe(true)
    expect(ringInside(rect(0, 0, 10, 10), rect(0, 0, 10, 10))).toBe(true)
  })

  it('refuses outlines that stick out or cross', () => {
    expect(ringInside(rect(2, 2, 12, 8), rect(0, 0, 10, 10))).toBe(false)
    expect(ringInside(rect(0, 0, 10, 10), rect(2, 2, 8, 8))).toBe(false)
    // An L whose chord between two boundary points runs outside the outer ring.
    const u = Float64Array.of(0, 0, 10, 0, 10, 10, 7, 10, 7, 3, 3, 3, 3, 10, 0, 10)
    expect(ringInside(rect(1, 5, 9, 9), u)).toBe(false)
  })
})

describe('ringDifference', () => {
  it('leaves an outer loop and a hole for strictly nested outlines', () => {
    const loops = ringDifference(rect(0, 0, 10, 10), rect(2, 2, 8, 8))
    expect(loops).toHaveLength(2)
    expect(loops.map((l) => Math.sign(signedArea(l))).sort()).toEqual([-1, 1])
    expect(area(loops)).toBe(100 - 36)
    const faces = loopsToPolygons(loops)
    expect(faces).toHaveLength(1)
    expect(faces[0].holes).toHaveLength(1)
  })

  it('cancels shared stretches: a lip sharing its ends with a wider cavity leaves two strips', () => {
    const loops = ringDifference(rect(-14, -9, 14, 9), rect(-14, -7, 14, 7))
    expect(loops).toHaveLength(2)
    for (const loop of loops) expect(signedArea(loop)).toBe(28 * 2)
    // Every vertex of both outlines on the strips' boundary is kept: the lip's corners split the cavity's ends.
    expect(loops.map((l) => l.length / 2).sort()).toEqual([4, 4])
    expect(loopsToPolygons(loops).every((f) => f.holes.length === 0)).toBe(true)
  })

  it('opens a notch ledge onto the side line between the two openings', () => {
    // Notch on the bottom side (y = 0): a wide slot, and a narrower one above it.
    const loops = ringDifference(rect(10, 0, 20, 6), rect(12, 0, 18, 4))
    expect(loops).toHaveLength(1)
    expect(signedArea(loops[0])).toBe(60 - 24)
    const onLine: number[] = []
    for (let k = 0; k < loops[0].length; k += 2) if (loops[0][k + 1] === 0) onLine.push(loops[0][k])
    expect(onLine.sort((a, b) => a - b)).toEqual([10, 12, 18, 20])
    // The same span: the ledge is the band above the smaller slot, with no stretch of side line left.
    const band = ringDifference(rect(10, 0, 20, 6), rect(10, 0, 20, 3))
    expect(band).toHaveLength(1)
    expect(signedArea(band[0])).toBe(30)
  })

  it('splits a face whose pieces meet at a vertex into one loop per piece', () => {
    // A narrower T above a T: its head's corners sit on the lower neck's reflex corners.
    const outer = Float64Array.of(37, 0, 43, 0, 43, 3, 46, 3, 46, 8, 34, 8, 34, 3, 37, 3)
    const inner = Float64Array.of(38, 0, 42, 0, 42, 3, 43, 3, 43, 8, 37, 8, 37, 3, 38, 3)
    const loops = ringDifference(outer, inner)
    expect(loops).toHaveLength(4)
    for (const loop of loops) expect(signedArea(loop)).toBeGreaterThan(0)
    expect(area(loops)).toBe(signedArea(outer) - signedArea(inner))
  })

  it('refuses outlines that meet at a single point', () => {
    const tri = Float64Array.of(5, 0, 8, 6, 2, 6)
    expect(() => ringDifference(rect(0, 0, 10, 10), tri)).toThrow(/single point/)
  })

  it('is empty for two outlines of the same region', () => {
    const plain = rect(0, 0, 10, 10)
    const split = Float64Array.of(0, 0, 5, 0, 10, 0, 10, 10, 0, 10)
    expect(ringDifference(split, plain)).toEqual([])
  })
})

/** A T-shaped notch on the bottom side (y = 0), opening edge first. */
const tee = (at: number, c = 0) =>
  Float64Array.of(at - 3 - c, 0, at + 3 + c, 0, at + 3 + c, 3 - c, at + 6 + c, 3 - c, at + 6 + c, 8 + c, at - 6 - c, 8 + c, at - 6 - c, 3 - c, at - 3 - c, 3 - c)

const notch = (at: number): BackFeature => ({
  role: 'key-pocket',
  side: 0,
  levels: [
    { ring: tee(at, 0.5), ringTop: tee(at), z0: 0, z1: 0.5 },
    { ring: tee(at), z0: 0.5, z1: 1.5 },
  ],
})

describe('prepareFeatures', () => {
  const prepare = (features: BackFeature[], w = 150, h = 150) => prepareFeatures(features, w, h, Q)

  it('snaps outlines onto the lattice and the side lines, counter-clockwise', () => {
    // Clockwise, and 5e-5 mm short of the side line x = 150 the way an unrounded piece width can leave it.
    const ring = Float64Array.of(149.99995, 20, 149.99995, 10, 140.3, 10, 140.3, 20)
    const [f] = prepare([{ role: 'key-pocket', side: 1, levels: [{ ring, z0: 0, z1: 1.3 }] }])
    const out = f.levels[0].ring
    expect(signedArea(out)).toBeGreaterThan(0)
    // Reversed from the same first vertex, so the opening is the edge from the last vertex back to it.
    expect(Array.from(out)).toEqual([150, 20, Math.round(140.3 / Q) * Q, 20, Math.round(140.3 / Q) * Q, 10, 150, 10])
    expect(Math.fround(out[2])).toBe(out[2])
    expect(f.levels[0].z1).toBe(Math.round(1.3 / Q) * Q)
    expect(f.opening).toEqual([3])
  })

  it('keeps the ring and its loft top in step', () => {
    const [f] = prepare([notch(40)])
    expect(f.levels[0].top).not.toBe(f.levels[0].ring)
    expect(f.levels[1].top).toBe(f.levels[1].ring)
    expect(f.opening).toEqual([0, 0])
  })

  it.each<[string, BackFeature, RegExp]>([
    ['a pocket outside the footprint', { role: 'clip-pocket', side: null, levels: [{ ring: rect(140, 10, 160, 20), z0: 0, z1: 2 }] }, /leaves the footprint/],
    ['a pocket on a side line', { role: 'clip-pocket', side: null, levels: [{ ring: rect(0, 10, 10, 20), z0: 0, z1: 2 }] }, /leaves the footprint/],
    ['a pocket with a paper wall', { role: 'clip-pocket', side: null, levels: [{ ring: rect(10, 149.5, 20, 140), z0: 0, z1: 2 }] }, /0.8 mm of wall/],
    ['a level floating above the bottom', { role: 'clip-pocket', side: null, levels: [{ ring: rect(10, 10, 20, 20), z0: 0.5, z1: 2 }] }, /not stacked/],
    [
      'a gap between levels',
      { role: 'clip-pocket', side: null, levels: [{ ring: rect(10, 10, 20, 20), z0: 0, z1: 1 }, { ring: rect(12, 12, 18, 18), z0: 1.2, z1: 2 }] },
      /not stacked/,
    ],
    [
      'levels that cross',
      { role: 'clip-pocket', side: null, levels: [{ ring: rect(10, 10, 20, 20), z0: 0, z1: 1 }, { ring: rect(15, 12, 25, 18), z0: 1, z1: 2 }] },
      /neither inside nor around/,
    ],
    ['an upside-down level', { role: 'clip-pocket', side: null, levels: [{ ring: rect(10, 10, 20, 20), z0: 0, z1: 0 }] }, /no height/],
    ['a notch with a paper wall to another side', { role: 'key-pocket', side: 0, levels: [{ ring: rect(10, 0, 20, 149.5), z0: 0, z1: 1 }] }, /0.8 mm of wall to another side/],
    ['a notch away from its side', { role: 'key-pocket', side: 0, levels: [{ ring: rect(10, 1, 20, 6), z0: 0, z1: 1 }] }, /does not touch its side/],
    ['a notch on the wrong side', { role: 'key-pocket', side: 2, levels: [{ ring: rect(10, 0, 20, 6), z0: 0, z1: 1 }] }, /leaves the footprint|does not touch/],
    ['a notch touching its side at one corner', { role: 'key-pocket', side: 0, levels: [{ ring: Float64Array.of(15, 0, 20, 6, 10, 6), z0: 0, z1: 1 }] }, /does not touch its side/],
    ['a notch round a corner', { role: 'key-pocket', side: 0, levels: [{ ring: rect(0, 0, 10, 6), z0: 0, z1: 1 }] }, /leaves the footprint/],
    ['a notch into a corner', { role: 'key-pocket', side: 0, levels: [{ ring: Float64Array.of(0, 0, 10, 0, 5, 6), z0: 0, z1: 1 }] }, /reaches a corner/],
    [
      'a notch that widens along its side going up',
      { role: 'key-pocket', side: 0, levels: [{ ring: rect(12, 0, 18, 4), z0: 0, z1: 1 }, { ring: rect(10, 0, 20, 6), z0: 1, z1: 2 }] },
      /widens along its side/,
    ],
    [
      'a notch loft that widens going up',
      { role: 'key-pocket', side: 0, levels: [{ ring: rect(12, 0, 18, 4), ringTop: rect(11, 0, 19, 4), z0: 0, z1: 1 }] },
      /widens along its side/,
    ],
  ])('refuses %s', (_label, feature, message) => {
    expect(() => prepare([feature])).toThrow(message)
  })

  it('refuses features that touch', () => {
    const a: BackFeature = { role: 'clip-pocket', side: null, levels: [{ ring: rect(10, 10, 20, 20), z0: 0, z1: 1 }] }
    const b: BackFeature = { role: 'clip-pocket', side: null, levels: [{ ring: rect(20, 12, 30, 18), z0: 0, z1: 1 }] }
    expect(() => prepare([a, b])).toThrow(/touch/)
    expect(() => prepare([notch(40), notch(52)])).toThrow(/touch/)
    expect(prepare([notch(40), notch(60)])).toHaveLength(2)
  })
})

describe('bottomOutline and notchChain', () => {
  const features: SolidFeature[] = prepareFeatures([notch(40), notch(100)], 150, 100, Q)

  it('cuts every notch into the footprint', () => {
    const { outer, holes } = bottomOutline(features, 150, 100)
    expect(holes).toEqual([])
    expect(signedArea(outer)).toBe(150 * 100 - 2 * signedArea(tee(40, 0.5)))
  })

  it('walks each notch up its left side, across its ceiling and down its right side', () => {
    const chain = notchChain(features, 0, 150, 100)!
    const first = chain.slice(0, 8).map((p) => [p.s, p.z])
    expect(first).toEqual([
      [0, 0],
      [36.5, 0],
      [37, 0.5],
      [37, 1.5],
      [43, 1.5],
      [43, 0.5],
      [43.5, 0],
      [96.5, 0],
    ])
    expect(chain[chain.length - 1]).toEqual({ s: 150, z: 0, x: 150, y: 0 })
    expect(notchChain(features, 1, 150, 100)).toBeNull()
  })
})
