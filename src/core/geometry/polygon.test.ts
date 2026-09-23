import { describe, expect, it } from 'vitest'
import {
  offsetRectRing,
  offsetRing,
  pointInRing,
  reverseRing,
  ringBounds,
  ringFromRect,
  roundedRectRing,
  signedArea,
  snapRing,
  triangulatePolygon,
} from './polygon'

/** Small seeded PRNG (mulberry32), so a failing case can be replayed. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const QUANTUM = 2 ** -12

/** Star-shaped ring around (cx, cy): jittered angles, radii in [rMin, rMax], counter-clockwise. */
function starRing(random: () => number, n: number, cx: number, cy: number, rMin: number, rMax: number): Float64Array {
  const out = new Float64Array(2 * n)
  for (let k = 0; k < n; k++) {
    const angle = ((k + 0.8 * random()) / n) * 2 * Math.PI
    const r = rMin + (rMax - rMin) * random()
    out[2 * k] = cx + r * Math.cos(angle)
    out[2 * k + 1] = cy + r * Math.sin(angle)
  }
  return snapRing(out, QUANTUM)
}

const flatten = (points: [number, number][]) => Float64Array.from(points.flat())

/** Checks that `tris` is a proper triangulation of the polygon: count, orientation, area and edge pairing. */
function expectTriangulation(outer: Float64Array, holes: Float64Array[], tris: Uint32Array) {
  const rings = [outer, ...holes]
  const coords = rings.flatMap((r) => Array.from(r))
  const n = coords.length / 2
  expect(tris.length / 3).toBe(n + 2 * holes.length - 2)
  let area = 0
  const used = new Uint8Array(n)
  const directed = new Map<string, number>()
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]]
    const twice =
      (coords[2 * b] - coords[2 * a]) * (coords[2 * c + 1] - coords[2 * a + 1]) -
      (coords[2 * b + 1] - coords[2 * a + 1]) * (coords[2 * c] - coords[2 * a])
    expect(twice).toBeGreaterThan(0)
    area += twice / 2
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      used[p] = 1
      const key = `${p},${q}`
      directed.set(key, (directed.get(key) ?? 0) + 1)
    }
  }
  const expected = Math.abs(signedArea(outer)) - holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0)
  expect(area).toBeCloseTo(expected, 6)
  expect(used.every((u) => u === 1)).toBe(true)
  // Boundary edges appear once, in the domain's direction; every other edge once each way.
  const boundary = new Set<string>()
  let base = 0
  rings.forEach((ring, r) => {
    const count = ring.length / 2
    const ccw = signedArea(ring) > 0
    const forward = r === 0 ? ccw : !ccw
    for (let k = 0; k < count; k++) {
      const p = base + k
      const q = base + ((k + 1) % count)
      boundary.add(forward ? `${p},${q}` : `${q},${p}`)
    }
    base += count
  })
  for (const key of boundary) expect(directed.get(key), key).toBe(1)
  for (const [key, count] of directed) {
    expect(count, key).toBe(1)
    if (boundary.has(key)) continue
    const [p, q] = key.split(',')
    expect(directed.get(`${q},${p}`), `twin of ${key}`).toBe(1)
  }
}

describe('ring helpers', () => {
  it('measures signed area and bounds', () => {
    const square = ringFromRect(0, 0, 10, 20)
    expect(signedArea(square)).toBe(200)
    expect(signedArea(reverseRing(square))).toBe(-200)
    expect(ringBounds(square)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 20 })
    expect(Array.from(ringFromRect(10, 20, 0, 0))).toEqual(Array.from(square))
  })

  it('reverses a ring from the same first vertex', () => {
    expect(Array.from(reverseRing(Float64Array.of(0, 0, 1, 0, 1, 1)))).toEqual([0, 0, 1, 1, 1, 0])
  })

  it('offsets rectangles and general rings', () => {
    expect(Array.from(offsetRectRing(0, 0, 10, 4, 1))).toEqual([-1, -1, 11, -1, 11, 5, -1, 5])
    const grown = offsetRing(ringFromRect(0, 0, 10, 4), 1)
    expect(Array.from(grown)).toEqual([-1, -1, 11, -1, 11, 5, -1, 5])
    // Outwards means away from the inside whatever the orientation.
    expect(signedArea(offsetRing(reverseRing(ringFromRect(0, 0, 10, 4)), 1))).toBeCloseTo(-72, 9)
    expect(signedArea(offsetRing(reverseRing(ringFromRect(0, 0, 10, 4)), -1))).toBeCloseTo(-16, 9)
    // A dog-bone outline shrinks by the clearance on every edge, re-entrant corners included.
    const bone = flatten([
      [0, 0],
      [4, 0],
      [4, 2],
      [8, 2],
      [8, 0],
      [12, 0],
      [12, 6],
      [8, 6],
      [8, 4],
      [4, 4],
      [4, 6],
      [0, 6],
    ])
    const inset = offsetRing(bone, -0.1)
    expect(Array.from(inset.subarray(0, 6)).map((v) => +v.toFixed(9))).toEqual([0.1, 0.1, 3.9, 0.1, 3.9, 2.1])
    expect(() => offsetRing(bone, -1.5)).toThrow(/collapses/)
  })

  it('builds rounded rectangles that loft vertex to vertex', () => {
    const a = roundedRectRing(0, 0, 20, 10, 2, 4)
    const b = roundedRectRing(1, 1, 19, 9, 1, 4)
    expect(a.length).toBe(2 * 4 * 5)
    expect(b.length).toBe(a.length)
    expect(signedArea(a)).toBeGreaterThan(0)
    expect(signedArea(a)).toBeLessThan(200)
    expect(signedArea(a)).toBeGreaterThan(200 - (4 - Math.PI) * 4 - 0.5)
    // Radius clamped to half the short side: the arc ends merge instead of repeating a vertex.
    const pill = roundedRectRing(0, 0, 20, 10, 8, 3)
    for (let k = 0; k < pill.length / 2; k++) {
      const j = (k + 1) % (pill.length / 2)
      expect(pill[2 * k] === pill[2 * j] && pill[2 * k + 1] === pill[2 * j + 1]).toBe(false)
    }
    expect(Array.from(roundedRectRing(0, 0, 4, 4, 0, 3))).toEqual(Array.from(ringFromRect(0, 0, 4, 4)))
  })

  it('locates points inside, on and outside a ring', () => {
    const ring = flatten([
      [0, 0],
      [10, 0],
      [10, 10],
      [5, 4],
      [0, 10],
    ])
    expect(pointInRing(ring, 2, 2)).toBe(1)
    expect(pointInRing(ring, 5, 8)).toBe(-1)
    expect(pointInRing(ring, 5, 0)).toBe(0)
    expect(pointInRing(ring, 5, 4)).toBe(0)
    expect(pointInRing(reverseRing(ring), 2, 2)).toBe(1)
    expect(pointInRing(ring, -1, 5)).toBe(-1)
  })

  it('snaps to a quantum and never writes -0', () => {
    const snapped = snapRing(Float64Array.of(0.1, -0.00001, 1.26), 0.25)
    expect(Array.from(snapped)).toEqual([0, 0, 1.25])
    expect(Object.is(snapped[1], -0)).toBe(false)
  })
})

describe('triangulatePolygon', () => {
  it('splits a square into two triangles and keeps collinear vertices', () => {
    const square = ringFromRect(0, 0, 4, 4)
    expectTriangulation(square, [], triangulatePolygon(square))
    const dotted = flatten([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [4, 2],
      [4, 4],
      [2, 4],
      [0, 4],
      [0, 2],
    ])
    expectTriangulation(dotted, [], triangulatePolygon(dotted))
  })

  it('reads a clockwise outer ring counter-clockwise', () => {
    const cw = reverseRing(ringFromRect(0, 0, 3, 2))
    expectTriangulation(cw, [], triangulatePolygon(cw))
  })

  it('bridges holes of either orientation', () => {
    const outer = ringFromRect(0, 0, 40, 20)
    const holes = [ringFromRect(5, 5, 10, 15), reverseRing(ringFromRect(20, 5, 25, 15)), ringFromRect(30, 8, 35, 12)]
    expectTriangulation(outer, holes, triangulatePolygon(outer, holes))
  })

  it('handles a bottom face: notches in the outline, pockets on one line, shared coordinates everywhere', () => {
    // A 150 mm tile bottom with four key notches in its outline and clip pockets inside it, all on a coarse grid.
    const outer = flatten([
      [0, 0],
      [70, 0],
      [70, 8],
      [80, 8],
      [80, 0],
      [150, 0],
      [150, 70],
      [142, 70],
      [142, 80],
      [150, 80],
      [150, 150],
      [80, 150],
      [80, 142],
      [70, 142],
      [70, 150],
      [0, 150],
      [0, 80],
      [8, 80],
      [8, 70],
      [0, 70],
    ])
    const holes = [
      ringFromRect(61, 20, 89, 34),
      ringFromRect(61, 116, 89, 130),
      ringFromRect(20, 70, 34, 80),
      ringFromRect(116, 70, 130, 80),
      offsetRectRing(70, 60, 80, 90, 0),
    ]
    expectTriangulation(outer, holes, triangulatePolygon(outer, holes))
  })

  it('handles a hole that is itself concave and bridges past its own arms', () => {
    const outer = ringFromRect(0, 0, 30, 30)
    // A C-shaped hole opening to the left, its rightmost vertex at the tip of the lower arm.
    const hole = flatten([
      [5, 5],
      [25, 5],
      [25, 10],
      [10, 10],
      [10, 20],
      [22, 20],
      [22, 25],
      [5, 25],
    ])
    expectTriangulation(outer, [hole], triangulatePolygon(outer, [hole]))
  })

  it('triangulates random convex and star-shaped rings with random holes', () => {
    const random = rng(7)
    for (let trial = 0; trial < 300; trial++) {
      const n = 3 + Math.floor(random() * 40)
      const convex = trial % 3 === 0
      const outer = starRing(random, Math.max(n, 16), 0, 0, convex ? 100 : 60, 100)
      const holes: Float64Array[] = []
      const centres: [number, number][] = []
      const holeCount = Math.floor(random() * 6)
      for (let tries = 0; holes.length < holeCount && tries < 200; tries++) {
        const r = 4 + random() * 6
        const angle = random() * 2 * Math.PI
        const d = random() * (50 - r)
        const cx = d * Math.cos(angle)
        const cy = d * Math.sin(angle)
        if (centres.some(([x, y]) => Math.hypot(x - cx, y - cy) < 2 * 10 + 1)) continue
        centres.push([cx, cy])
        const ring = starRing(random, 3 + Math.floor(random() * 9), cx, cy, 0.5 * r, r)
        holes.push(random() < 0.5 ? reverseRing(ring) : ring)
      }
      expectTriangulation(outer, holes, triangulatePolygon(outer, holes))
    }
  })

  it('triangulates random rectilinear outlines with grid-aligned holes (many ties and collinear points)', () => {
    const random = rng(11)
    for (let trial = 0; trial < 200; trial++) {
      // A staircase outline on an integer grid, with collinear vertices along its edges.
      const steps = 2 + Math.floor(random() * 5)
      const points: [number, number][] = [[0, 0]]
      let x = 0
      for (let s = 0; s < steps; s++) {
        x += 4 + Math.floor(random() * 4)
        points.push([x - 2, 0])
        points.push([x, 0])
      }
      let y = 0
      for (let s = steps; s > 0; s--) {
        y += 3 + Math.floor(random() * 3)
        points.push([x, y])
        x -= 4
        if (x > 0) points.push([x, y])
      }
      if (x > 0) points.push([0, y])
      else points[points.length - 1] = [0, y]
      points.push([0, Math.floor(y / 2)])
      const outer = flatten(points)
      const holes: Float64Array[] = []
      for (let tries = 0; tries < 20 && holes.length < 4; tries++) {
        const hx = 1 + Math.floor(random() * 6)
        const hy = 1 + Math.floor(random() * 2)
        const ring = ringFromRect(hx, hy, hx + 1, hy + 1)
        const inside = [0, 1, 2, 3].every((k) => pointInRing(outer, ring[2 * k], ring[2 * k + 1]) === 1)
        const clear = holes.every((h) => {
          const b = ringBounds(h)
          return hx + 1 < b.minX || hx > b.maxX + 0 || hy + 1 < b.minY || hy > b.maxY
        })
        if (inside && clear && signedArea(outer) > 0) holes.push(ring)
      }
      if (signedArea(outer) <= 0) continue
      expectTriangulation(outer, holes, triangulatePolygon(outer, holes))
    }
  })

  it('rejects a hole that crosses the outer ring', () => {
    expect(() => triangulatePolygon(ringFromRect(0, 0, 10, 10), [ringFromRect(5, 5, 15, 8)])).toThrow(/hole/)
  })
})
