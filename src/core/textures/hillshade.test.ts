import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config'
import { DEFAULT_COLOR } from '../colors'
import { applyBevel, effectiveBevel } from '../geometry/heightfield'
import type { CropRect, DesignConfig } from '../types'
import { reliefShadeKey, renderReliefChip, shadeReliefChip, tintReliefChip, type ReliefChip } from './hillshade'
import { createHeightField, TEXTURES } from './registry'

// Frozen copy of renderReliefChip as it was before the shade/tint split, colour applied per sample.
// It is the reference the split must match byte for byte; do not edit it along with hillshade.ts.
// Every colour now prints with what used to be the matte finish, so only that gloss is kept.
const LEGACY_MATTE_GLOSS = 0.03
const LEGACY_KEY = (() => {
  const azimuth = (135 * Math.PI) / 180
  const elevation = (26 * Math.PI) / 180
  const c = Math.cos(elevation)
  return { x: Math.cos(azimuth) * c, y: Math.sin(azimuth) * c, z: Math.sin(elevation) }
})()
const LEGACY_KEY_COLOR = { r: 1.06, g: 0.98, b: 0.87 }
const LEGACY_FILL = { x: 0.42, y: -0.52, z: 0.74 }
const LEGACY_FILL_COLOR = { r: 0.62, g: 0.68, b: 0.82 }
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
function linearToSrgb(c: number): number {
  const v = clamp01(c)
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}
function albedoOf(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16)
  const squeeze = (v: number) => 0.055 + 0.9 * srgbToLinear(v / 255)
  return { r: squeeze((n >> 16) & 255), g: squeeze((n >> 8) & 255), b: squeeze(n & 255) }
}
function legacyBoxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  const norm = 1 / (radius * 2 + 1)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k < 0 ? 0 : x + k >= w ? w - 1 : x + k
        sum += src[row + xx]
      }
      tmp[row + x] = sum * norm
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k < 0 ? 0 : y + k >= h ? h - 1 : y + k
        sum += tmp[yy * w + x]
      }
      out[y * w + x] = sum * norm
    }
  }
  return out
}
function legacyRenderReliefChip(config: DesignConfig, opts: { sizePx: number; crop?: CropRect }): ReliefChip {
  const size = Math.max(8, Math.round(opts.sizePx))
  const crop: CropRect = opts.crop ?? { x0: 0, y0: 0, x1: config.tile.width, y1: config.tile.height }
  const pieceW = Math.max(0.1, crop.x1 - crop.x0)
  const pieceH = Math.max(0.1, crop.y1 - crop.y0)
  const field = createHeightField(config)
  const depth = field.depth
  const thickness = config.tile.thickness
  const bevel = effectiveBevel(config)
  const pxPerMm = size / Math.max(pieceW, pieceH)
  const drawW = Math.max(1, Math.round(pieceW * pxPerMm))
  const drawH = Math.max(1, Math.round(pieceH * pxPerMm))
  const originX = Math.floor((size - drawW) / 2)
  const originY = Math.floor((size - drawH) / 2)
  const ss = pieceW / drawW > 0.5 ? 2 : 1
  const fineW = drawW * ss
  const fineH = drawH * ss
  const mmPerPx = pieceW / fineW
  const bw = fineW + 2
  const bh = fineH + 2
  const heights = new Float32Array(bw * bh)
  for (let row = 0; row < bh; row++) {
    const yMm = crop.y1 - (row - 0.5) * mmPerPx
    const edgeY = Math.min(yMm - crop.y0, crop.y1 - yMm)
    for (let col = 0; col < bw; col++) {
      const xMm = crop.x0 + (col - 0.5) * mmPerPx
      const edgeX = Math.min(xMm - crop.x0, crop.x1 - xMm)
      const z = thickness + field(xMm, yMm)
      heights[row * bw + col] = applyBevel(z, Math.min(edgeX, edgeY), thickness, bevel)
    }
  }
  const radius = Math.max(1, Math.round(1.2 / mmPerPx))
  const blurred = legacyBoxBlur(heights, bw, bh, radius)
  const albedo = albedoOf(config.color)
  const gloss = LEGACY_MATTE_GLOSS
  const hx = { x: LEGACY_KEY.x + 0, y: LEGACY_KEY.y, z: LEGACY_KEY.z + 1 }
  const hlen = Math.hypot(hx.x, hx.y, hx.z)
  hx.x /= hlen
  hx.y /= hlen
  hx.z /= hlen
  const data = new Uint8ClampedArray(size * size * 4)
  const aoScale = 1 / Math.max(depth * 0.55, 0.25)
  const samples = ss * ss
  for (let row = 0; row < drawH; row++) {
    for (let col = 0; col < drawW; col++) {
      let rSum = 0
      let gSum = 0
      let bSum = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const i = (row * ss + sy + 1) * bw + (col * ss + sx + 1)
          const z = heights[i]
          const dzdx = (heights[i + 1] - heights[i - 1]) / (2 * mmPerPx)
          const dzdy = (heights[i - bw] - heights[i + bw]) / (2 * mmPerPx)
          const nlen = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1)
          const nx = -dzdx / nlen
          const ny = -dzdy / nlen
          const nz = 1 / nlen
          const key = Math.max(0, nx * LEGACY_KEY.x + ny * LEGACY_KEY.y + nz * LEGACY_KEY.z)
          const fill = Math.max(0, nx * LEGACY_FILL.x + ny * LEGACY_FILL.y + nz * LEGACY_FILL.z)
          const ao = clamp01(0.62 + (z - blurred[i]) * aoScale)
          const spec = gloss > 0 ? Math.pow(Math.max(0, nx * hx.x + ny * hx.y + nz * hx.z), 42) * gloss : 0
          const light = 0.2 * ao + 0.92 * key * ao + 0.3 * fill * ao
          rSum += albedo.r * light * LEGACY_KEY_COLOR.r + albedo.r * 0.16 * fill * LEGACY_FILL_COLOR.r + spec
          gSum += albedo.g * light * LEGACY_KEY_COLOR.g + albedo.g * 0.16 * fill * LEGACY_FILL_COLOR.g + spec
          bSum += albedo.b * light * LEGACY_KEY_COLOR.b + albedo.b * 0.16 * fill * LEGACY_FILL_COLOR.b + spec
        }
      }
      const o = ((row + originY) * size + (col + originX)) * 4
      data[o] = linearToSrgb(rSum / samples) * 255
      data[o + 1] = linearToSrgb(gSum / samples) * 255
      data[o + 2] = linearToSrgb(bSum / samples) * 255
      data[o + 3] = 255
    }
  }
  return { width: size, height: size, data }
}

/** Index of the first differing byte, or -1; cheaper to report than a 16k-element diff. */
function firstDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) return Math.min(a.length, b.length)
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i
  return -1
}

const specimen = (textureId: string, overrides: Partial<DesignConfig> = {}): DesignConfig => {
  const def = TEXTURES.find((t) => t.id === textureId)!
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    texture: { ...DEFAULT_CONFIG.texture, id: def.id, params: {}, depth: def.defaults.depth, scale: def.defaults.scale },
  }
}

// A mid-tone, a preset, a custom pick and the two ends of the albedo squeeze.
const COLOURS = ['#F47B20', '#5C9748', '#12AB34', '#FFFFFF', '#000000']

describe('shadeReliefChip + tintReliefChip', () => {
  it('matches the legacy per-sample renderer byte for byte on every texture', () => {
    for (const def of TEXTURES) {
      const config = specimen(def.id, { tile: { width: 100, height: 100, thickness: 4 } })
      const shade = shadeReliefChip(config, { sizePx: 64 })
      for (const color of COLOURS) {
        const expected = legacyRenderReliefChip({ ...config, color }, { sizePx: 64 })
        const actual = tintReliefChip(shade, color)
        expect(actual.width, def.id).toBe(expected.width)
        expect(firstDifference(actual.data, expected.data), `${def.id} in ${color}`).toBe(-1)
      }
    }
  })

  it('matches the legacy renderer on cut pieces, a single-sample sliver and a running bond', () => {
    const cases: { config: DesignConfig; sizePx: number; crop?: CropRect }[] = [
      // Bottom strip: letterboxed, so the transparent surround is part of the comparison.
      { config: specimen('arches', { tile: { width: 150, height: 150, thickness: 4 } }), sizePx: 72, crop: { x0: 0, y0: 0, x1: 150, y1: 40 } },
      // Offset cut: neither edge on the tile origin.
      { config: specimen('coral-wood', { bevel: 1 }), sizePx: 64, crop: { x0: 37.5, y0: 12.25, x1: 120, y1: 150 } },
      // A 20 mm corner over 64 px is under 0.5 mm per pixel, which drops the supersampling to one sample.
      { config: specimen('wavy', { tile: { width: 150, height: 150, thickness: 4 } }), sizePx: 64, crop: { x0: 130, y0: 0, x1: 150, y1: 20 } },
      { config: specimen('stripes', { layout: { origin: 'corner', rowOffset: 0.5 }, tile: { width: 200, height: 100, thickness: 3 } }), sizePx: 56 },
    ]
    for (const [n, c] of cases.entries()) {
      const shade = shadeReliefChip(c.config, { sizePx: c.sizePx, crop: c.crop })
      for (const color of COLOURS) {
        const expected = legacyRenderReliefChip({ ...c.config, color }, { sizePx: c.sizePx, crop: c.crop })
        expect(firstDifference(tintReliefChip(shade, color).data, expected.data), `case ${n} in ${color}`).toBe(-1)
      }
    }
  })

  it('keeps renderReliefChip equal to the legacy output', () => {
    const config = specimen('arches', { color: '#F6C343' })
    const crop = { x0: 0, y0: 0, x1: 150, y1: 60 }
    expect(firstDifference(renderReliefChip(config, { sizePx: 48, crop }).data, legacyRenderReliefChip(config, { sizePx: 48, crop }).data)).toBe(-1)
  })

  it('shades two designs that differ only in colour identically, under one key', () => {
    const a = specimen('arches', { color: '#F47B20' })
    const b = { ...a, name: 'Other name', printerId: 'bambu-a1-mini', color: '#F6C343' }
    expect(shadeReliefChip(a, { sizePx: 32 })).toEqual(shadeReliefChip(b, { sizePx: 32 }))
    expect(reliefShadeKey(a, { sizePx: 32 })).toBe(reliefShadeKey(b, { sizePx: 32 }))
  })

  it('reads a short hex like its long form and falls back to the default colour on an unreadable one', () => {
    const shade = shadeReliefChip(specimen('wavy'), { sizePx: 24 })
    expect(firstDifference(tintReliefChip(shade, '#abc').data, tintReliefChip(shade, '#AABBCC').data)).toBe(-1)
    expect(firstDifference(tintReliefChip(shade, 'not a colour').data, tintReliefChip(shade, DEFAULT_COLOR).data)).toBe(-1)
  })

  it('keys every input that changes the relief', () => {
    const base = specimen('arches')
    const key = (config: DesignConfig, opts: { sizePx: number; crop?: CropRect } = { sizePx: 32 }) => reliefShadeKey(config, opts)
    const { width, height } = base.tile
    // One variant per input the shade reads, so dropping any of them from the key fails here.
    const cases: [string, DesignConfig, { sizePx: number; crop?: CropRect }?][] = [
      ['tile.width', { ...base, tile: { ...base.tile, width: width + 1 } }],
      ['tile.height', { ...base, tile: { ...base.tile, height: height + 1 } }],
      ['tile.thickness', { ...base, tile: { ...base.tile, thickness: base.tile.thickness + 1 } }],
      ['bevel', { ...base, bevel: base.bevel + 0.5 }],
      // A third keeps fewer arches per bond period than the whole tile holds, so the relief really moves.
      ['layout.rowOffset', { ...base, layout: { ...base.layout, rowOffset: 0.3333 } }],
      // Same default depth and scale as arches, so only the id tells their chips apart.
      ['texture.id', { ...base, texture: { ...base.texture, id: 'moroccan-star' } }],
      ['texture.depth', { ...base, texture: { ...base.texture, depth: base.texture.depth + 0.1 } }],
      ['texture.scale', { ...base, texture: { ...base.texture, scale: base.texture.scale + 10 } }],
      ['texture.seed', { ...base, texture: { ...base.texture, seed: base.texture.seed + 1 } }],
      ['texture.invert', { ...base, texture: { ...base.texture, invert: !base.texture.invert } }],
      ['texture.rotate', { ...base, texture: { ...base.texture, rotate: !base.texture.rotate } }],
      ['texture.params', { ...base, texture: { ...base.texture, params: { outline: 1 } } }],
      ['sizePx', base, { sizePx: 33 }],
      ['crop.x0', base, { sizePx: 32, crop: { x0: 10, y0: 0, x1: width, y1: height } }],
      ['crop.y0', base, { sizePx: 32, crop: { x0: 0, y0: 10, x1: width, y1: height } }],
      ['crop.x1', base, { sizePx: 32, crop: { x0: 0, y0: 0, x1: 50, y1: height } }],
      ['crop.y1', base, { sizePx: 32, crop: { x0: 0, y0: 0, x1: width, y1: 50 } }],
    ]
    const variants = cases.map(([, config, opts]) => key(config, opts))
    expect(new Set([key(base), ...variants]).size).toBe(variants.length + 1)
    // Each keyed input really moves the relief (arches is unseeded, so its seed is keyed but inert).
    const baseShade = shadeReliefChip(base, { sizePx: 32 })
    for (const [field, config, opts = { sizePx: 32 }] of cases) {
      if (field === 'texture.seed') continue
      expect(shadeReliefChip(config, opts), field).not.toEqual(baseShade)
    }
    // Parameter order is not part of the relief.
    const ordered = { ...base, texture: { ...base.texture, params: { margin: 3, outline: 1 } } }
    const reordered = { ...base, texture: { ...base.texture, params: { outline: 1, margin: 3 } } }
    expect(key(ordered)).toBe(key(reordered))
    // A crop over the whole tile is the whole tile, and fractional sizes round like the render does.
    expect(key(base, { sizePx: 32.2, crop: { x0: 0, y0: 0, x1: base.tile.width, y1: base.tile.height } })).toBe(key(base))
  })

  it('leaves the letterbox around a cut fully transparent', () => {
    const shade = shadeReliefChip(specimen('wavy'), { sizePx: 40, crop: { x0: 0, y0: 0, x1: 150, y1: 30 } })
    const chip = tintReliefChip(shade, '#000000')
    for (let y = 0; y < 40; y++) {
      const inside = y >= shade.originY && y < shade.originY + shade.drawH
      for (let x = 0; x < 40; x++) {
        const o = (y * 40 + x) * 4
        expect(chip.data[o + 3]).toBe(inside ? 255 : 0)
        if (!inside) expect(chip.data[o] + chip.data[o + 1] + chip.data[o + 2]).toBe(0)
      }
    }
  })
})
