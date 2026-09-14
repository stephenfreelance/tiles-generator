// Helpers shared by the pattern samplers: smooth edges expressed in millimetres, so no slope is
// sharper than the nozzle can print and no chip shows an aliased staircase.

import type { TextureContext } from '../types'

export const TAU = Math.PI * 2
export const SQRT3 = Math.sqrt(3)

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

export const fract = (a: number): number => a - Math.floor(a)

/** Triangle wave: 1 at integers, 0 at half integers. */
export const tri = (a: number): number => Math.abs(2 * fract(a) - 1)

export const mix = (a: number, b: number, t: number): number => a + (b - a) * t

/** edge1 below edge0 is a descending ramp (1 below edge1, 0 above edge0), not a hard step. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** C2 version; used where a shaded normal would otherwise show a crease at the ramp ends. */
export function smootherstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/** IQ's quadratic smooth minimum; k is the blend width in the same units as a and b. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b)
  const h = clamp01(0.5 + (0.5 * (b - a)) / k)
  return mix(b, a, h) - k * h * (1 - h)
}

export const smax = (a: number, b: number, k: number): number => -smin(-a, -b, k)

/** Millimetres covered by one pattern cell (one unit of s = u * repeatsX). */
export const cellMmX = (ctx: TextureContext): number => ctx.periodMm[0] / ctx.repeatsX
export const cellMmY = (ctx: TextureContext): number => ctx.periodMm[1] / ctx.repeatsY

/** Printability floors for a 0.4 mm nozzle (research: 2 lines raised, half a line of groove). */
export const MIN_FEATURE_MM = 0.8
export const MIN_GROOVE_MM = 0.6
/** Softest usable wall: below this the relief aliases in the chip and rings on the printer. */
export const MIN_SOFT_MM = 0.3

/**
 * Widens a soft edge (given as a fraction of a cell) until it is at least `minMm` millimetres,
 * and keeps it under half a cell so opposite edges of a feature never cross.
 */
export function softEdge(fraction: number, mmPerCell: number, minMm = MIN_SOFT_MM): number {
  const floorFrac = minMm / Math.max(mmPerCell, 1e-6)
  return Math.min(Math.max(fraction, floorFrac), 0.49)
}

/** Same, for a value already expressed in millimetres. */
export const softMm = (mm: number, mmPerCell: number): number =>
  Math.min(Math.max(mm, MIN_SOFT_MM) / Math.max(mmPerCell, 1e-6), 0.49)

/** Number of fBm octaves whose finest wavelength still prints (>= 1.5 mm), capped by `max`. */
export function usefulOctaves(mmPerCell: number, max: number, finestMm = 1.5): number {
  let octaves = 1
  let wavelength = mmPerCell
  while (octaves < max && wavelength / 2 >= finestMm) {
    wavelength /= 2
    octaves++
  }
  return octaves
}

/** Rounds to an integer >= 1; every wave vector and lattice count must be integral to stay seamless. */
export const intAtLeast1 = (v: number): number => Math.max(1, Math.round(v))
