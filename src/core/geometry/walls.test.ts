import { describe, expect, it } from 'vitest'
import { triangulateNotchedWall, triangulateWall } from './walls'

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

/** Multiples of 1/1024 mm: float32-exact, so every orientation test in the sweep is exact. */
const snap = (v: number) => Math.round(v * 1024) / 1024

/** A jagged rim over [0, length]: random steps, heights in [zMin, zMax], with the given s values forced in. */
function randomRim(random: () => number, length: number, zMin: number, zMax: number, forced: number[] = []) {
  const s = new Set<number>([0, length, ...forced])
  const count = 2 + Math.floor(random() * 60)
  for (let k = 0; k < count; k++) s.add(snap(random() * length))
  const topS = [...s].sort((a, b) => a - b)
  const topZ = topS.map(() => snap(zMin + random() * (zMax - zMin)))
  return { topS, topZ }
}

/** Checks a wall triangulation: count, strict CCW, exact area, and every edge paired. */
function expectWall(topS: number[], topZ: number[], bottomS: number[], bottomZ: number[], tris: Uint32Array) {
  const m = bottomS.length
  const n = topS.length
  const S = [...bottomS, ...topS]
  const Z = [...bottomZ, ...topZ]
  expect(tris.length / 3).toBe(n + m - 2)
  // The polygon, CCW seen from outside: bottom chain, then the rim backwards.
  const ring = [...Array.from({ length: m }, (_, j) => j), ...Array.from({ length: n }, (_, k) => m + n - 1 - k)]
  let polygonArea = 0
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k]
    const b = ring[(k + 1) % ring.length]
    polygonArea += (S[a] * Z[b] - S[b] * Z[a]) / 2
  }
  let area = 0
  const directed = new Map<string, number>()
  const used = new Set<number>()
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]]
    const twice = (S[b] - S[a]) * (Z[c] - Z[a]) - (Z[b] - Z[a]) * (S[c] - S[a])
    expect(twice, `triangle ${a},${b},${c}`).toBeGreaterThan(0)
    area += twice / 2
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      used.add(p)
      directed.set(`${p},${q}`, (directed.get(`${p},${q}`) ?? 0) + 1)
    }
  }
  expect(area).toBeCloseTo(polygonArea, 6)
  expect(used.size).toBe(n + m)
  const boundary = new Set(ring.map((a, k) => `${a},${ring[(k + 1) % ring.length]}`))
  for (const key of boundary) expect(directed.get(key), key).toBe(1)
  for (const [key, count] of directed) {
    expect(count, key).toBe(1)
    if (boundary.has(key)) continue
    const [p, q] = key.split(',')
    expect(directed.get(`${q},${p}`), `twin of ${key}`).toBe(1)
  }
}

describe('triangulateNotchedWall', () => {
  it('gives exactly triangulateWall when the bottom is the plain edge B0-B1', () => {
    const random = rng(3)
    for (let trial = 0; trial < 200; trial++) {
      const length = snap(20 + random() * 200)
      const { topS, topZ } = randomRim(random, length, 2 + random() * 3, 8)
      const plain = triangulateWall(topS, topZ)
      const notched = triangulateNotchedWall(topS, topZ, [0, length], [0, 0])
      expect(Array.from(notched)).toEqual(Array.from(plain))
    }
  })

  it('triangulates a wall with one rectangular notch', () => {
    const topS = [0, 10, 20, 30, 40, 50, 60]
    const topZ = [5, 6, 5.5, 6.2, 5.1, 5.8, 5]
    // Rim vertices sit exactly over both notch sides (s = 20 and 40).
    const bottomS = [0, 20, 20, 40, 40, 60]
    const bottomZ = [0, 0, 3, 3, 0, 0]
    expectWall(topS, topZ, bottomS, bottomZ, triangulateNotchedWall(topS, topZ, bottomS, bottomZ))
  })

  it('handles notches at both corners, starting and ending at the ceiling', () => {
    const topS = [0, 5, 15, 25, 30]
    const topZ = [6, 6, 6, 6, 6]
    const bottomS = [0, 8, 8, 22, 22, 30]
    const bottomZ = [3, 3, 0, 0, 2, 2]
    expectWall(topS, topZ, bottomS, bottomZ, triangulateNotchedWall(topS, topZ, bottomS, bottomZ))
  })

  it('covers random jagged walls with random notches, mouth chamfers and collinear bottom points', () => {
    const random = rng(19)
    let notches = 0
    for (let trial = 0; trial < 400; trial++) {
      const length = snap(40 + random() * 160)
      const zMin = 4 + random()
      const bottomS: number[] = [0]
      const bottomZ: number[] = [0]
      const forced: number[] = []
      let s = 0
      for (;;) {
        const gap = snap(1 + random() * 20)
        const width = snap(2 + random() * 15)
        if (s + gap + width + 1 >= length) break
        const a = s + gap
        const b = a + width
        const h = snap(0.4 + random() * (zMin - 1))
        if (random() < 0.3) {
          // A collinear point on the floor before the notch.
          bottomS.push(snap(s + gap / 2))
          bottomZ.push(0)
        }
        const chamfer = random() < 0.3 ? Math.min(snap(0.4), h / 2) : 0
        if (chamfer > 0) {
          // A 45 degree mouth: the side leans out at the bottom, then rises straight to the ceiling.
          bottomS.push(a - chamfer, a, a, b, b, b + chamfer)
          bottomZ.push(0, chamfer, h, h, chamfer, 0)
        } else {
          bottomS.push(a, a, b, b)
          bottomZ.push(0, h, h, 0)
        }
        notches++
        if (random() < 0.5) forced.push(a)
        if (random() < 0.5) forced.push(b)
        s = b + chamfer
      }
      bottomS.push(length)
      bottomZ.push(0)
      const { topS, topZ } = randomRim(random, length, zMin, zMin + 3, forced)
      expectWall(topS, topZ, bottomS, bottomZ, triangulateNotchedWall(topS, topZ, bottomS, bottomZ))
    }
    expect(notches).toBeGreaterThan(1000)
  })

  it('rejects chains that fold back or do not share their ends', () => {
    expect(() => triangulateNotchedWall([0, 10], [5, 5], [0, 4, 4, 4, 10], [0, 0, 2, 1, 0])).toThrow(/folds back/)
    expect(() => triangulateNotchedWall([0, 10], [5, 5], [0, 9], [0, 0])).toThrow(/end s/)
    expect(() => triangulateNotchedWall([0, 10], [5, 5], [0, 0, 10], [0, 2, 2])).toThrow(/along s/)
  })
})
