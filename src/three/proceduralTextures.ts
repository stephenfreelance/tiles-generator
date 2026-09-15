import * as THREE from 'three'

// Tileable textures generated at runtime (no network assets). The grain wraps around its edges, so it
// repeats seamlessly over the tile.

export const GRAIN_TEXTURE_SIZE = 256

/** Integer lattice hash to [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 144269504)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
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

/** RGBA grain map: R is fine fractal grain around 0.5 (the only channel the shader reads), A opaque. */
export function generateGrainData(size = GRAIN_TEXTURE_SIZE, seed = 7): Uint8Array {
  const data = new Uint8Array(size * size * 4)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = (j * size + i) * 4
      data[k] = Math.round(Math.min(1, Math.max(0, periodicFbm(i / size, j / size, 16, 4, seed))) * 255)
      data[k + 3] = 255
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

export function acquireGrainTexture(): TextureHandle {
  return acquire('grain', () => makeDataTexture(generateGrainData(), GRAIN_TEXTURE_SIZE))
}

export function acquirePoolTexture(): TextureHandle {
  return acquire('pool', () => makeDataTexture(generatePoolData(128), 128, false))
}
