// CPU relief swatch for the texture picker and the download schedule. No DOM: it returns raw RGBA
// that the worker hands to ImageData. The point is to make a 96 px chip look like a lit object.

import { DEFAULT_COLOR, parseHex } from '../colors'
import { applyBevel, effectiveBevel } from '../geometry/heightfield'
import type { CropRect, DesignConfig } from '../types'
import { createHeightField } from './registry'

/** Specular strength of printed PLA: a faint glint, the one printed look every color shares. */
const GLOSS = 0.03

/** Warm key from the upper left at a raking elevation, which is how tile samples are photographed. */
const KEY = (() => {
  const azimuth = (135 * Math.PI) / 180
  const elevation = (26 * Math.PI) / 180
  const c = Math.cos(elevation)
  return { x: Math.cos(azimuth) * c, y: Math.sin(azimuth) * c, z: Math.sin(elevation) }
})()
const KEY_COLOR = { r: 1.06, g: 0.98, b: 0.87 }
/** Cool bounce from the opposite corner so shadowed flanks keep some colour. */
const FILL = { x: 0.42, y: -0.52, z: 0.74 }
const FILL_COLOR = { r: 0.62, g: 0.68, b: 0.82 }

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  const v = clamp01(c)
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

/** Linear albedo of a '#RRGGBB' hex, already normalized by parseHex. */
function albedoOf(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16)
  // Pure white and pure black both kill the relief, so pull them off the ends of the range.
  const squeeze = (v: number) => 0.055 + 0.9 * srgbToLinear(v / 255)
  return { r: squeeze((n >> 16) & 255), g: squeeze((n >> 8) & 255), b: squeeze(n & 255) }
}

export interface ReliefChip {
  width: number
  height: number
  data: Uint8ClampedArray
}

export interface ReliefChipOptions {
  sizePx: number
  crop?: CropRect
}

/**
 * The colour-independent part of a chip: every lighting term summed over each pixel's subsamples.
 * The colour only scales these sums (albedo per channel, then the fixed gloss), so one shade
 * serves every colour and a colour change costs a cheap tint instead of a full relief render.
 */
export interface ReliefShade {
  /** Edge of the square output box, px. */
  size: number
  /** The piece's rectangle inside the box; every pixel outside it stays transparent. */
  originX: number
  originY: number
  drawW: number
  drawH: number
  /** Subsamples per pixel. */
  samples: number
  /** Three sums per drawn pixel, row major: lit diffuse, fill, specular. Float64 keeps tints byte-exact. */
  sums: Float64Array
}

const chipSize = (sizePx: number): number => Math.max(8, Math.round(sizePx))
const fullCrop = (config: DesignConfig): CropRect => ({ x0: 0, y0: 0, x1: config.tile.width, y1: config.tile.height })

/** Shade memory a chips worker keeps; the page mirrors it to know when a colour change is only a tint. */
export const CHIP_SHADE_BUDGET_BYTES = 24 * 1024 * 1024

/** What that mirror may hold: a quarter of the worker's budget stays as headroom on the main thread. */
export const PAGE_SHADE_BUDGET_BYTES = CHIP_SHADE_BUDGET_BYTES * 0.75

/** Upper bound of one shade's memory in a sizePx box (a cut piece fills less of it). */
export const reliefShadeBytes = (sizePx: number): number => chipSize(sizePx) ** 2 * 3 * Float64Array.BYTES_PER_ELEMENT

/**
 * Identity of a shade: everything shadeReliefChip reads (the height field's inputs, the bevel, the
 * piece and the box), and deliberately not the colour, name or printer.
 */
export function reliefShadeKey(config: DesignConfig, opts: ReliefChipOptions): string {
  const { tile, bevel, texture, layout } = config
  const crop = opts.crop ?? fullCrop(config)
  const params = Object.keys(texture.params)
    .sort()
    .map((key) => [key, texture.params[key]])
  return JSON.stringify([
    chipSize(opts.sizePx),
    crop.x0,
    crop.y0,
    crop.x1,
    crop.y1,
    tile.width,
    tile.height,
    tile.thickness,
    bevel,
    layout.rowOffset,
    texture.id,
    texture.depth,
    texture.scale,
    texture.seed,
    texture.invert,
    texture.rotate,
    params,
  ])
}

/** Heights, occlusion and normals for the tile (or one cut piece), with no colour applied yet. */
export function shadeReliefChip(config: DesignConfig, opts: ReliefChipOptions): ReliefShade {
  const size = chipSize(opts.sizePx)
  const crop: CropRect = opts.crop ?? fullCrop(config)
  const pieceW = Math.max(0.1, crop.x1 - crop.x0)
  const pieceH = Math.max(0.1, crop.y1 - crop.y0)

  const field = createHeightField(config)
  const depth = field.depth
  const thickness = config.tile.thickness
  const bevel = effectiveBevel(config)

  // Fit the piece into the box, keeping its aspect; everything outside stays transparent.
  const pxPerMm = size / Math.max(pieceW, pieceH)
  const drawW = Math.max(1, Math.round(pieceW * pxPerMm))
  const drawH = Math.max(1, Math.round(pieceH * pxPerMm))
  const originX = Math.floor((size - drawW) / 2)
  const originY = Math.floor((size - drawH) / 2)
  // A chip pixel covers a millimetre or more, so relief finer than that aliases into noise: sample
  // the height field at twice the resolution and average the shaded result back down.
  const ss = pieceW / drawW > 0.5 ? 2 : 1
  const fineW = drawW * ss
  const fineH = drawH * ss
  const mmPerPx = pieceW / fineW

  // One height sample per pixel, with a one pixel skirt so normals and occlusion have neighbours.
  const bw = fineW + 2
  const bh = fineH + 2
  const heights = new Float32Array(bw * bh)
  for (let row = 0; row < bh; row++) {
    // Image rows run down the chip, tile y runs up it.
    const yMm = crop.y1 - (row - 0.5) * mmPerPx
    const edgeY = Math.min(yMm - crop.y0, crop.y1 - yMm)
    for (let col = 0; col < bw; col++) {
      const xMm = crop.x0 + (col - 0.5) * mmPerPx
      const edgeX = Math.min(xMm - crop.x0, crop.x1 - xMm)
      const z = thickness + field(xMm, yMm)
      heights[row * bw + col] = applyBevel(z, Math.min(edgeX, edgeY), thickness, bevel)
    }
  }

  // Occlusion approximation: a wide box blur of the height field. Sitting below your surroundings
  // means less sky is visible, which is most of what ambient occlusion does at this scale.
  const radius = Math.max(1, Math.round(1.2 / mmPerPx))
  const blurred = boxBlur(heights, bw, bh, radius)

  const hx = { x: KEY.x + 0, y: KEY.y, z: KEY.z + 1 }
  const hlen = Math.hypot(hx.x, hx.y, hx.z)
  hx.x /= hlen
  hx.y /= hlen
  hx.z /= hlen

  const sums = new Float64Array(drawW * drawH * 3)
  const aoScale = 1 / Math.max(depth * 0.55, 0.25)
  for (let row = 0; row < drawH; row++) {
    for (let col = 0; col < drawW; col++) {
      let lightSum = 0
      let fillSum = 0
      let specSum = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const i = (row * ss + sy + 1) * bw + (col * ss + sx + 1)
          const z = heights[i]
          // Central differences in millimetres give the surface normal, with z up out of the tile.
          const dzdx = (heights[i + 1] - heights[i - 1]) / (2 * mmPerPx)
          const dzdy = (heights[i - bw] - heights[i + bw]) / (2 * mmPerPx)
          const nlen = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1)
          const nx = -dzdx / nlen
          const ny = -dzdy / nlen
          const nz = 1 / nlen

          const key = Math.max(0, nx * KEY.x + ny * KEY.y + nz * KEY.z)
          const fill = Math.max(0, nx * FILL.x + ny * FILL.y + nz * FILL.z)
          const ao = clamp01(0.62 + (z - blurred[i]) * aoScale)

          lightSum += 0.2 * ao + 0.92 * key * ao + 0.3 * fill * ao
          fillSum += fill
          specSum += Math.pow(Math.max(0, nx * hx.x + ny * hx.y + nz * hx.z), 42)
        }
      }
      const p = (row * drawW + col) * 3
      sums[p] = lightSum
      sums[p + 1] = fillSum
      sums[p + 2] = specSum
    }
  }
  return { size, originX, originY, drawW, drawH, samples: ss * ss, sums }
}

/** Lights a shade in one '#RRGGBB' colour: linear in albedo, so it needs no height samples. */
export function tintReliefChip(shade: ReliefShade, hex: string): ReliefChip {
  const { size, originX, originY, drawW, drawH, samples, sums } = shade
  const albedo = albedoOf(parseHex(hex) ?? DEFAULT_COLOR)

  const data = new Uint8ClampedArray(size * size * 4)
  for (let row = 0; row < drawH; row++) {
    for (let col = 0; col < drawW; col++) {
      const p = (row * drawW + col) * 3
      const light = sums[p]
      const fill = sums[p + 1]
      const spec = sums[p + 2] * GLOSS
      const r = albedo.r * light * KEY_COLOR.r + albedo.r * 0.16 * fill * FILL_COLOR.r + spec
      const g = albedo.g * light * KEY_COLOR.g + albedo.g * 0.16 * fill * FILL_COLOR.g + spec
      const b = albedo.b * light * KEY_COLOR.b + albedo.b * 0.16 * fill * FILL_COLOR.b + spec

      // Averaged in linear light, which is where averaging colour is meaningful.
      const o = ((row + originY) * size + (col + originX)) * 4
      data[o] = linearToSrgb(r / samples) * 255
      data[o + 1] = linearToSrgb(g / samples) * 255
      data[o + 2] = linearToSrgb(b / samples) * 255
      data[o + 3] = 255
    }
  }
  return { width: size, height: size, data }
}

/**
 * Renders the tile (or one cut piece) as a lit relief inside a sizePx box, transparent around the
 * piece. The chamfer comes from the mesh helper itself, so a chip shows the piece that gets printed.
 */
export function renderReliefChip(config: DesignConfig, opts: ReliefChipOptions): ReliefChip {
  return tintReliefChip(shadeReliefChip(config, opts), config.color)
}

/** Separable box blur over the padded height buffer, edges clamped. */
function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
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
