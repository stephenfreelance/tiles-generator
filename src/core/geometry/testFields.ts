// Synthetic periodic height fields for the geometry tests, so they do not depend on the texture registry.

import { DEFAULT_CONFIG } from '../config'
import type { HeightField } from '../textures/types'
import type { DesignConfig } from '../types'

export function makeField(
  fn: (x: number, y: number) => number,
  periodX: number,
  periodY: number,
  depth: number,
): HeightField {
  const field = ((x: number, y: number) => fn(x, y)) as HeightField
  field.periodX = periodX
  field.periodY = periodY
  field.depth = depth
  field.repeatsX = 1
  field.repeatsY = 1
  return field
}

const TAU = Math.PI * 2

const hash = (i: number, j: number, seed = 1): number => {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ seed
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (t: number) => t * t * (3 - 2 * t)
const wrap = (v: number, n: number) => ((v % n) + n) % n

export type FieldFactory = (depth: number, periodX: number, periodY: number) => HeightField

/** Flat top at z = thickness: the tile is a chamfered box (depth 0 means no relief at all). */
export const plateField: FieldFactory = (_depth, px, py) => makeField(() => 0, px, py, 0)

/** Full-height plateau: a chamfered box whose top sits at thickness + depth. */
export const flatField: FieldFactory = (depth, px, py) => makeField(() => depth, px, py, depth)

export const sineField: FieldFactory = (depth, px, py) =>
  makeField(
    (x, y) => depth * 0.5 * (1 + Math.sin((TAU * 2 * x) / px) * Math.cos((TAU * 3 * y) / py)),
    px,
    py,
    depth,
  )

/** Sharp plateaus and steps: vertical walls inside the relief. */
export const stepsField: FieldFactory = (depth, px, py) =>
  makeField(
    (x, y) => {
      const i = Math.floor(wrap(x, px) / (px / 4))
      const j = Math.floor(wrap(y, py) / (py / 4))
      return (i + j) % 2 === 0 ? depth : depth * 0.25
    },
    px,
    py,
    depth,
  )

/** Periodic value noise over a 5 x 5 lattice per period. */
export const noiseField: FieldFactory = (depth, px, py) => {
  const cells = 5
  return makeField(
    (x, y) => {
      const u = (wrap(x, px) / px) * cells
      const v = (wrap(y, py) / py) * cells
      const i = Math.floor(u)
      const j = Math.floor(v)
      const fu = smooth(u - i)
      const fv = smooth(v - j)
      const i0 = wrap(i, cells)
      const j0 = wrap(j, cells)
      const i1 = wrap(i + 1, cells)
      const j1 = wrap(j + 1, cells)
      const a = hash(i0, j0) + (hash(i1, j0) - hash(i0, j0)) * fu
      const b = hash(i0, j1) + (hash(i1, j1) - hash(i0, j1)) * fu
      return depth * (a + (b - a) * fv)
    },
    px,
    py,
    depth,
  )
}

export const FIELDS: Record<string, FieldFactory> = {
  plate: plateField,
  flat: flatField,
  sine: sineField,
  steps: stepsField,
  noise: noiseField,
}

export function testConfig(over: Partial<DesignConfig> = {}): DesignConfig {
  return {
    ...DEFAULT_CONFIG,
    tile: { width: 150, height: 150, thickness: 4 },
    bevel: 0.6,
    joint: 0,
    texture: { ...DEFAULT_CONFIG.texture, depth: 2.4 },
    ...over,
  }
}

/** Volume of a chamfered box of constant top height, the analytic reference for the flat fields. */
export function chamferedBoxVolume(width: number, height: number, top: number, bevel: number): number {
  return width * height * top - (bevel * bevel * (width + height) - (4 / 3) * bevel ** 3)
}
