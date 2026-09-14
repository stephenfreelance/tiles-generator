// Seeded, exactly periodic noise. Every function wraps its lattice coordinates modulo integer
// periods, so noise(x + Px, y) == noise(x, y) and a pattern built on it meets itself at a tile edge.

/** Small fast PRNG (Tommy Ettinger's mulberry32); same seed gives the same stream everywhere. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Positive modulo for integers and floats alike. */
export function wrap(a: number, n: number): number {
  const r = a % n
  return r < 0 ? r + n : r
}

/** Integer hash of a lattice cell: 32-bit avalanche, returns a uint32. */
export function hashCell(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** Hash of a wrapped lattice cell in [0, 1). */
export function hash01(ix: number, iy: number, px: number, py: number, seed: number): number {
  return hashCell(wrap(ix, px), wrap(iy, py), seed) / 4294967296
}

/** Second independent hash of the same cell, for a 2D jitter or a per-cell vector. */
export function hash01b(ix: number, iy: number, px: number, py: number, seed: number): number {
  return hashCell(wrap(ix, px), wrap(iy, py), seed ^ 0x5bf03635) / 4294967296
}

/** Quintic fade: C2 continuous, which keeps shaded relief free of lattice creases. */
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** 16 unit gradients; a power-of-two table means the index is a cheap mask. */
const GRAD_X = new Float64Array(16)
const GRAD_Y = new Float64Array(16)
for (let i = 0; i < 16; i++) {
  const a = (i / 16) * Math.PI * 2
  GRAD_X[i] = Math.cos(a)
  GRAD_Y[i] = Math.sin(a)
}

/** Periodic gradient (Perlin) noise in [-1, 1], period (px, py) in lattice units. */
export function perlin2(x: number, y: number, px: number, py: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const x0 = wrap(xi, px)
  const y0 = wrap(yi, py)
  const x1 = wrap(x0 + 1, px)
  const y1 = wrap(y0 + 1, py)
  const u = fade(fx)
  const v = fade(fy)
  const g00 = hashCell(x0, y0, seed) & 15
  const g10 = hashCell(x1, y0, seed) & 15
  const g01 = hashCell(x0, y1, seed) & 15
  const g11 = hashCell(x1, y1, seed) & 15
  const n00 = GRAD_X[g00] * fx + GRAD_Y[g00] * fy
  const n10 = GRAD_X[g10] * (fx - 1) + GRAD_Y[g10] * fy
  const n01 = GRAD_X[g01] * fx + GRAD_Y[g01] * (fy - 1)
  const n11 = GRAD_X[g11] * (fx - 1) + GRAD_Y[g11] * (fy - 1)
  // Gradient noise peaks near 1/sqrt(2); the scale brings it to roughly [-1, 1].
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.4142135623730951
}

/** Periodic value noise in [0, 1], period (px, py). Cheaper and smoother-blobbed than Perlin. */
export function value2(x: number, y: number, px: number, py: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const u = fade(x - xi)
  const v = fade(y - yi)
  const x0 = wrap(xi, px)
  const y0 = wrap(yi, py)
  const x1 = wrap(x0 + 1, px)
  const y1 = wrap(y0 + 1, py)
  const inv = 1 / 4294967296
  const v00 = hashCell(x0, y0, seed) * inv
  const v10 = hashCell(x1, y0, seed) * inv
  const v01 = hashCell(x0, y1, seed) * inv
  const v11 = hashCell(x1, y1, seed) * inv
  return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v)
}

/**
 * Periodic fBm in [-1, 1]. Lacunarity is exactly 2 and the period doubles with it, which is what
 * keeps every octave on the same torus.
 */
export function fbm2(
  x: number,
  y: number,
  px: number,
  py: number,
  octaves: number,
  seed: number,
  gain = 0.5,
): number {
  let sum = 0
  let amp = 1
  let norm = 0
  let fx = x
  let fy = y
  let ppx = px
  let ppy = py
  for (let o = 0; o < octaves; o++) {
    sum += perlin2(fx, fy, ppx, ppy, seed + o * 1013) * amp
    norm += amp
    amp *= gain
    fx *= 2
    fy *= 2
    ppx *= 2
    ppy *= 2
  }
  return sum / norm
}

/** Periodic fBm of value noise in [0, 1]; softer and about twice as fast as the gradient version. */
export function valueFbm2(
  x: number,
  y: number,
  px: number,
  py: number,
  octaves: number,
  seed: number,
  gain = 0.5,
): number {
  let sum = 0
  let amp = 1
  let norm = 0
  let fx = x
  let fy = y
  let ppx = px
  let ppy = py
  for (let o = 0; o < octaves; o++) {
    sum += value2(fx, fy, ppx, ppy, seed + o * 7919) * amp
    norm += amp
    amp *= gain
    fx *= 2
    fy *= 2
    ppx *= 2
    ppy *= 2
  }
  return sum / norm
}

/**
 * Periodic ridged multifractal in [0, 1] (Musgrave): folding |n| makes sharp crests, and weighting
 * each octave by the previous one keeps detail on the ridges instead of in the valleys.
 */
export function ridged2(
  x: number,
  y: number,
  px: number,
  py: number,
  octaves: number,
  seed: number,
  gain = 2,
): number {
  let fx = x
  let fy = y
  let ppx = px
  let ppy = py
  let sig = 1 - Math.abs(perlin2(fx, fy, ppx, ppy, seed))
  sig *= sig
  let sum = sig
  let norm = 1
  let amp = 1
  for (let o = 1; o < octaves; o++) {
    fx *= 2
    fy *= 2
    ppx *= 2
    ppy *= 2
    amp *= 0.5
    let weight = sig * gain
    if (weight > 1) weight = 1
    else if (weight < 0) weight = 0
    sig = 1 - Math.abs(perlin2(fx, fy, ppx, ppy, seed + o * 3571))
    sig = sig * sig * weight
    sum += sig * amp
    norm += amp
  }
  return sum / norm
}

/** Periodic warp offset: both components are themselves periodic, so the warped field still tiles. */
export function warp2(
  x: number,
  y: number,
  px: number,
  py: number,
  octaves: number,
  seed: number,
  out: { x: number; y: number },
): void {
  out.x = fbm2(x, y, px, py, octaves, seed)
  // Offsetting by a lattice-aligned integer keeps the second component periodic and decorrelated.
  out.y = fbm2(x + 5, y + 1, px, py, octaves, seed + 61)
}

export interface WorleyResult {
  /** Distance to the nearest feature point, in cell units. */
  f1: number
  /** Distance to the second nearest, in cell units. */
  f2: number
  /** Stable hash of the owning cell in [0, 1); use it to colour or raise a cell. */
  id: number
  /** Wrapped cell index of the nearest feature point. */
  cx: number
  cy: number
  /** Position of the nearest feature point, in the same units as (x, y). */
  px: number
  py: number
}

export const makeWorleyResult = (): WorleyResult => ({ f1: 9, f2: 9, id: 0, cx: 0, cy: 0, px: 0, py: 0 })

/**
 * Periodic Worley/Voronoi over a jittered grid; feature points are hashed from the WRAPPED cell,
 * so the point set itself is periodic. Fills `out` to avoid allocating in the sampling loop.
 */
export function worley2(
  x: number,
  y: number,
  px: number,
  py: number,
  jitter: number,
  seed: number,
  out: WorleyResult,
): void {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  let f1 = 1e9
  let f2 = 1e9
  let bestX = 0
  let bestY = 0
  let bestCx = 0
  let bestCy = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = wrap(xi + dx, px)
      const cy = wrap(yi + dy, py)
      const h = hashCell(cx, cy, seed)
      const jx = (h & 0xffff) / 65536
      const jy = (h >>> 16) / 65536
      const sx = xi + dx + 0.5 + (jx - 0.5) * jitter
      const sy = yi + dy + 0.5 + (jy - 0.5) * jitter
      const ex = sx - x
      const ey = sy - y
      const d = Math.sqrt(ex * ex + ey * ey)
      if (d < f1) {
        f2 = f1
        f1 = d
        bestX = sx
        bestY = sy
        bestCx = cx
        bestCy = cy
      } else if (d < f2) {
        f2 = d
      }
    }
  }
  out.f1 = f1
  out.f2 = f2
  out.cx = bestCx
  out.cy = bestCy
  out.px = bestX
  out.py = bestY
  out.id = hashCell(bestCx, bestCy, seed ^ 0x1b873593) / 4294967296
}

/**
 * Distance to the Voronoi border (IQ's second pass): the nearest cell from `worley2` is compared
 * with its neighbours through the perpendicular bisector, which gives a crease-free joint width.
 */
export function worleyBorder(
  x: number,
  y: number,
  px: number,
  py: number,
  jitter: number,
  seed: number,
  nearest: WorleyResult,
  radius = 2,
): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const ax = nearest.px - x
  const ay = nearest.py - y
  let border = 1e9
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cx = wrap(xi + dx, px)
      const cy = wrap(yi + dy, py)
      if (cx === nearest.cx && cy === nearest.cy) continue
      const h = hashCell(cx, cy, seed)
      const jx = (h & 0xffff) / 65536
      const jy = (h >>> 16) / 65536
      const sx = xi + dx + 0.5 + (jx - 0.5) * jitter - x
      const sy = yi + dy + 0.5 + (jy - 0.5) * jitter - y
      const ex = sx - ax
      const ey = sy - ay
      const len = Math.sqrt(ex * ex + ey * ey)
      if (len < 1e-9) continue
      // Distance from the sample to the bisector between the nearest site and this one.
      const d = (0.5 * (ax + sx) * ex + 0.5 * (ay + sy) * ey) / len
      if (d < border) border = d
    }
  }
  return border < 0 ? 0 : border
}
