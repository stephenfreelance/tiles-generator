import * as THREE from 'three'

// Tileable surface-detail textures generated at runtime (no network assets). Every generator
// wraps around its edges, so the textures repeat seamlessly over the tile.

export type DetailKind = 'grain' | 'stone' | 'wood' | 'carbon'

export interface FlakeSpec {
  /** Fraction of texels covered by flakes. */
  coverage: number
  /** Flake radius range in texels. */
  radiusPx: readonly [number, number]
  seed: number
}

export const DETAIL_TEXTURE_SIZE = 256

/** Integer lattice hash to [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 144269504)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const mod = (a: number, n: number) => ((a % n) + n) % n

/** Smooth value noise, periodic over `period` lattice cells in x and y. */
export function periodicValueNoise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const xa = mod(x0, period)
  const xb = mod(x0 + 1, period)
  const ya = mod(y0, period)
  const yb = mod(y0 + 1, period)
  const a = hash2(xa, ya, seed)
  const b = hash2(xb, ya, seed)
  const c = hash2(xa, yb, seed)
  const d = hash2(xb, yb, seed)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

/** Normalised fractal noise over u, v in [0, 1), periodic with period 1. */
export function periodicFbm(u: number, v: number, basePeriod: number, octaves: number, seed: number): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let period = basePeriod
  for (let o = 0; o < octaves; o++) {
    sum += amp * periodicValueNoise(u * period, v * period, period, seed + o * 101)
    norm += amp
    amp *= 0.5
    period *= 2
  }
  return sum / norm
}

function stampDiscs(channel: Float32Array, size: number, coverage: number, radius: readonly [number, number], rnd: () => number) {
  const meanR = (radius[0] + radius[1]) / 2
  const count = Math.round((coverage * size * size) / (Math.PI * meanR * meanR))
  for (let f = 0; f < count; f++) {
    const cx = rnd() * size
    const cy = rnd() * size
    const r = radius[0] + rnd() * (radius[1] - radius[0])
    const reach = Math.ceil(r)
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        // Soft rim: one texel of falloff keeps mipmaps from shimmering.
        const edge = r - Math.hypot(dx, dy)
        if (edge <= -1) continue
        const k = mod(Math.floor(cy) + dy, size) * size + mod(Math.floor(cx) + dx, size)
        channel[k] = Math.max(channel[k], Math.min(1, edge + 1))
      }
    }
  }
}

function stampStreaks(
  channel: Float32Array,
  size: number,
  coverage: number,
  length: readonly [number, number],
  angle: number,
  jitter: number,
  rnd: () => number,
) {
  const meanL = (length[0] + length[1]) / 2
  const count = Math.round((coverage * size * size) / meanL)
  for (let f = 0; f < count; f++) {
    const cx = rnd() * size
    const cy = rnd() * size
    const len = length[0] + rnd() * (length[1] - length[0])
    const theta = angle + (rnd() * 2 - 1) * jitter
    const ux = Math.cos(theta)
    const uy = Math.sin(theta)
    for (let t = -len / 2; t <= len / 2; t += 0.5) {
      const k = mod(Math.round(cy + uy * t), size) * size + mod(Math.round(cx + ux * t), size)
      channel[k] = 1
    }
  }
}

function quantize(r: Float32Array, g: Float32Array, b: Float32Array, a: Float32Array): Uint8Array {
  const out = new Uint8Array(r.length * 4)
  for (let k = 0; k < r.length; k++) {
    out[k * 4] = Math.round(Math.min(1, Math.max(0, r[k])) * 255)
    out[k * 4 + 1] = Math.round(Math.min(1, Math.max(0, g[k])) * 255)
    out[k * 4 + 2] = Math.round(Math.min(1, Math.max(0, b[k])) * 255)
    out[k * 4 + 3] = Math.round(Math.min(1, Math.max(0, a[k])) * 255)
  }
  return out
}

/**
 * RGBA detail map: R fine grain (mean 0.5), G dark speckles / wood flecks / carbon fibres,
 * B light speckles, A low-frequency warp for wood bands.
 */
export function generateDetailData(kind: DetailKind, size = DETAIL_TEXTURE_SIZE, seed = 7): Uint8Array {
  const n = size * size
  const r = new Float32Array(n)
  const g = new Float32Array(n)
  const b = new Float32Array(n)
  const a = new Float32Array(n).fill(0.5)
  const grainPeriod = kind === 'carbon' ? 32 : 16
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = j * size + i
      r[k] = periodicFbm(i / size, j / size, grainPeriod, 4, seed)
      if (kind === 'wood') a[k] = periodicFbm(i / size, j / size, 2, 3, seed + 17)
    }
  }
  const rnd = mulberry32(seed * 7919 + kind.length)
  if (kind === 'stone') {
    stampDiscs(g, size, 0.09, [1.2, 3.8], rnd)
    stampDiscs(b, size, 0.04, [0.8, 2.2], rnd)
  } else if (kind === 'wood') {
    // Flecks run with the grain (the bands vary along x, so the grain runs along y).
    stampStreaks(g, size, 0.12, [2, 5], Math.PI / 2, 0.14, rnd)
  } else if (kind === 'carbon') {
    // Fibres align with the extrusion direction (tile x) with some scatter.
    stampStreaks(g, size, 0.2, [3, 10], 0, 0.44, rnd)
  }
  return quantize(r, g, b, a)
}

/** RGBA flake map: RG tilt of the flake normal (0.5 = none), A coverage mask. */
export function generateFlakeData(spec: FlakeSpec, size = DETAIL_TEXTURE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4)
  for (let k = 0; k < size * size; k++) {
    data[k * 4] = 128
    data[k * 4 + 1] = 128
  }
  const rnd = mulberry32(spec.seed)
  const meanR = (spec.radiusPx[0] + spec.radiusPx[1]) / 2
  const count = Math.round((spec.coverage * size * size) / (Math.PI * meanR * meanR))
  for (let f = 0; f < count; f++) {
    const cx = Math.floor(rnd() * size)
    const cy = Math.floor(rnd() * size)
    const radius = spec.radiusPx[0] + rnd() * (spec.radiusPx[1] - spec.radiusPx[0])
    const theta = rnd() * Math.PI * 2
    const magnitude = 0.55 + 0.45 * rnd()
    const tx = Math.round((Math.cos(theta) * magnitude * 0.5 + 0.5) * 255)
    const ty = Math.round((Math.sin(theta) * magnitude * 0.5 + 0.5) * 255)
    const reach = Math.ceil(radius)
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue
        const k = (mod(cy + dy, size) * size + mod(cx + dx, size)) * 4
        data[k] = tx
        data[k + 1] = ty
        data[k + 3] = 255
      }
    }
  }
  return data
}

/** Radial falloff (white centre to transparent edge) for the light pool on the sheet. */
export function generatePoolData(size = 128): Uint8Array {
  const data = new Uint8Array(size * size * 4)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = (i + 0.5) / size - 0.5
      const dy = (j + 0.5) / size - 0.5
      const d = Math.min(1, Math.hypot(dx, dy) * 2)
      const v = Math.round(255 * (1 - d * d) * (1 - d * d))
      const k = (j * size + i) * 4
      data[k] = v
      data[k + 1] = v
      data[k + 2] = v
      data[k + 3] = 255
    }
  }
  return data
}

export function makeDataTexture(data: Uint8Array, size: number, repeat = true): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  texture.wrapT = texture.wrapS
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.colorSpace = THREE.NoColorSpace
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

export interface TextureHandle {
  texture: THREE.DataTexture
  release(): void
}

const shared = new Map<string, { texture: THREE.DataTexture; refs: number }>()

/** Reference-counted shared textures: material sets come and go, the generated data is reused. */
function acquire(key: string, build: () => THREE.DataTexture): TextureHandle {
  let entry = shared.get(key)
  if (!entry) {
    entry = { texture: build(), refs: 0 }
    shared.set(key, entry)
  }
  entry.refs++
  const held = entry
  let released = false
  return {
    texture: held.texture,
    release() {
      if (released) return
      released = true
      held.refs--
      if (held.refs <= 0) {
        held.texture.dispose()
        shared.delete(key)
      }
    },
  }
}

export function acquireDetailTexture(kind: DetailKind): TextureHandle {
  return acquire(`detail:${kind}`, () => makeDataTexture(generateDetailData(kind), DETAIL_TEXTURE_SIZE))
}

export function acquireFlakeTexture(spec: FlakeSpec): TextureHandle {
  const key = `flakes:${spec.coverage}:${spec.radiusPx.join(',')}:${spec.seed}`
  return acquire(key, () => makeDataTexture(generateFlakeData(spec), DETAIL_TEXTURE_SIZE))
}

export function acquirePoolTexture(): TextureHandle {
  return acquire('pool', () => makeDataTexture(generatePoolData(128), 128, false))
}
