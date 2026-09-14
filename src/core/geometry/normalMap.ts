// Object-space normal map of a piece's top surface, for the preview material. Same sampler (and so the
// same bevel) as the mesh, so the baked relief and the meshed relief agree at every joint.

import type { HeightField } from '../textures/types'
import type { DesignConfig, PieceSpec } from '../types'
import { pieceTopSampler } from './heightfield'

/** Texture maps stay inside GPU-friendly sizes; 2048 px over a 150 mm tile is about 0.07 mm per texel. */
const MAX_TEXELS = 2048

export function bakeNormalMap(
  config: DesignConfig,
  field: HeightField,
  piece: PieceSpec,
  texelMm: number,
): { width: number; height: number; data: Uint8Array } {
  const w = Math.fround(piece.width)
  const h = Math.fround(piece.height)
  const step = Math.max(texelMm, 1e-3)
  const width = Math.min(MAX_TEXELS, Math.max(1, Math.ceil(w / step - 1e-9)))
  const height = Math.min(MAX_TEXELS, Math.max(1, Math.ceil(h / step - 1e-9)))
  const sample = pieceTopSampler(config, field, { crop: piece.crop, width: w, height: h })
  const dx = w / width
  const dy = h / height
  // Heights on the texel corners: each texel's gradient then comes from its own four corners, which
  // covers the piece rectangle exactly and costs one sample per corner instead of four per texel.
  const rows = new Float64Array((width + 1) * (height + 1))
  for (let j = 0; j <= height; j++) {
    const y = j === height ? h : j * dy
    const row = j * (width + 1)
    for (let i = 0; i <= width; i++) rows[row + i] = sample(i === width ? w : i * dx, y)
  }
  const data = new Uint8Array(width * height * 4)
  for (let j = 0; j < height; j++) {
    const r0 = j * (width + 1)
    const r1 = r0 + width + 1
    for (let i = 0; i < width; i++) {
      const z00 = rows[r0 + i]
      const z10 = rows[r0 + i + 1]
      const z01 = rows[r1 + i]
      const z11 = rows[r1 + i + 1]
      const gx = (z10 - z00 + (z11 - z01)) / (2 * dx)
      const gy = (z01 - z00 + (z11 - z10)) / (2 * dy)
      const len = Math.hypot(gx, gy, 1)
      const o = (j * width + i) * 4
      data[o] = Math.round((-gx / len * 0.5 + 0.5) * 255)
      data[o + 1] = Math.round((-gy / len * 0.5 + 0.5) * 255)
      data[o + 2] = Math.round((1 / len * 0.5 + 0.5) * 255)
      data[o + 3] = 255
    }
  }
  return { width, height, data }
}
