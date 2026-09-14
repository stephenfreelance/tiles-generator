import * as THREE from 'three'
import { LOOK } from './look'

export type Rgb = [number, number, number]

const START_COMPRESSION = 0.8 - 0.04
const DESATURATION = 0.15

/** Khronos PBR Neutral tone mapping at exposure 1, linear in and out (same maths as three's GLSL). */
export function neutralToneMap([r0, g0, b0]: Rgb): Rgb {
  const x = Math.min(r0, g0, b0)
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04
  let r = r0 - offset
  let g = g0 - offset
  let b = b0 - offset
  const peak = Math.max(r, g, b)
  if (peak < START_COMPRESSION) return [r, g, b]
  const d = 1 - START_COMPRESSION
  const newPeak = 1 - (d * d) / (peak + d - START_COMPRESSION)
  const scale = newPeak / peak
  r *= scale
  g *= scale
  b *= scale
  const t = 1 - 1 / (DESATURATION * (peak - newPeak) + 1)
  return [r + (newPeak - r) * t, g + (newPeak - g) * t, b + (newPeak - b) * t]
}

/**
 * Linear colour that tone-maps back to `target`. The post chain tone-maps the background too, so the
 * clear colour is pre-compensated to land exactly on the sheet colour at the canvas edge.
 */
export function inverseNeutralToneMap(target: Rgb, iterations = 48): Rgb {
  const guess: Rgb = [target[0], target[1], target[2]]
  for (let i = 0; i < iterations; i++) {
    const mapped = neutralToneMap(guess)
    // The curve's slope stays within (0, 1], so this fixed-point step converges.
    for (let c = 0; c < 3; c++) guess[c] = Math.max(0, guess[c] + (target[c] - mapped[c]))
  }
  return guess
}

/** Linear-space background colour for the canvas: the sheet, compensated when the composer tone-maps it. */
export function sheetBackground(toneMappedByComposer: boolean): THREE.Color {
  const sheet = new THREE.Color(LOOK.palette.sheet)
  if (!toneMappedByComposer) return sheet
  const [r, g, b] = inverseNeutralToneMap([sheet.r, sheet.g, sheet.b])
  return new THREE.Color(r, g, b)
}

export const linearLuminance = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b

/**
 * Filament albedo in linear space with the extremes pulled in: published pure white would clip under
 * the key light and pure black would render as a flat silhouette.
 */
export function clampAlbedo(hex: string, glossy: boolean): THREE.Color {
  const color = new THREE.Color(hex)
  const srgb = { r: 0, g: 0, b: 0 }
  color.getRGB(srgb, THREE.SRGBColorSpace)
  const ceiling = new THREE.Color(glossy ? LOOK.materials.whiteGlossy : LOOK.materials.whiteMatte)
  if (Math.min(srgb.r, srgb.g, srgb.b) >= 0.97) return ceiling

  const ceilingSrgb = { r: 0, g: 0, b: 0 }
  ceiling.getRGB(ceilingSrgb, THREE.SRGBColorSpace)
  const ceilingMax = Math.max(ceilingSrgb.r, ceilingSrgb.g, ceilingSrgb.b)
  const brightest = Math.max(srgb.r, srgb.g, srgb.b)
  if (brightest > ceilingMax) {
    const k = ceilingMax / brightest
    color.setRGB(srgb.r * k, srgb.g * k, srgb.b * k, THREE.SRGBColorSpace)
  }

  const floor = new THREE.Color(glossy ? LOOK.materials.blackGlossy : LOOK.materials.blackMatte)
  const floorLum = linearLuminance(floor)
  const lum = linearLuminance(color)
  // Lift dark colours to the floor luminance by scaling, which keeps the hue; true black has none to keep.
  if (lum <= 1e-6) color.copy(floor)
  else if (lum < floorLum) color.multiplyScalar(floorLum / lum)
  return color
}

/** Linear colour moved `amount` of the way toward white. */
export function lighten(color: THREE.Color, amount: number): THREE.Color {
  return color.clone().lerp(new THREE.Color(1, 1, 1), amount)
}

/** Linear colour darkened by `amount` and desaturated by `desaturate` (both 0..1). */
export function darken(color: THREE.Color, amount: number, desaturate = 0): THREE.Color {
  const lum = linearLuminance(color)
  return color
    .clone()
    .lerp(new THREE.Color(lum, lum, lum), desaturate)
    .multiplyScalar(1 - amount)
}
