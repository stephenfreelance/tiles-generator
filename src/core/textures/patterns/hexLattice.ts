// T-15 honeycomb, T-20 tumbling blocks and T-22 dots: everything built on the pointy-top hex
// lattice, whose period is exactly (1, sqrt3) in pattern space, so integer repeats tile the tile.

import { hashCell, makeWorleyResult, worley2, wrap } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { cellMmX, clamp01, fract, mix, smin, smoothstep, SQRT3 } from './common'

const HALF_SQRT3 = SQRT3 / 2
/** Share of a dome's radius used to fade its rim into the ground (about 0.3 mm at normal sizes). */
const RIM_FADE = 0.12

interface HexLocal {
  /** Vector from the nearest hex centre, in pattern units (x: 1 per column, y: stretched). */
  gx: number
  gy: number
  /** Wrapped centre index plus the sub-lattice branch, enough to hash one hex. */
  ix: number
  iy: number
  branch: number
}

const makeHex = (): HexLocal => ({ gx: 0, gy: 0, ix: 0, iy: 0, branch: 0 })

/** Nearest hex centre of the two interleaved rectangular sub-lattices. */
function hexLocal(s: number, t: number, out: HexLocal): void {
  const py = t * SQRT3
  const ax = fract(s) - 0.5
  const ayCell = Math.floor(py / SQRT3)
  const ay = py - ayCell * SQRT3 - HALF_SQRT3
  const bxCell = Math.floor(s - 0.5)
  const bx = s - 0.5 - bxCell - 0.5
  const byCell = Math.floor((py - HALF_SQRT3) / SQRT3)
  const by = py - HALF_SQRT3 - byCell * SQRT3 - HALF_SQRT3
  if (ax * ax + ay * ay < bx * bx + by * by) {
    out.gx = ax
    out.gy = ay
    out.ix = Math.floor(s)
    out.iy = ayCell
    out.branch = 0
  } else {
    out.gx = bx
    out.gy = by
    out.ix = bxCell
    out.iy = byCell
    out.branch = 1
  }
}

/** 0 at the hex centre, 0.5 at the edge midpoints (the apothem is 0.5 pattern units). */
const hexDist = (gx: number, gy: number): number =>
  Math.max(Math.abs(gx), 0.5 * Math.abs(gx) + HALF_SQRT3 * Math.abs(gy))

export const honeycomb: TextureDef = {
  id: 'honeycomb',
  mark: 'T-15',
  name: 'Honeycomb',
  category: 'geometric',
  blurb: 'Hexagons: bevelled, pyramidal, domed, or open cells with standing walls.',
  defaults: { depth: 2.2, scale: 40 },
  scaleRange: [10, 120],
  depthRange: [0.8, 5],
  params: [
    {
      key: 'mode',
      label: 'Cell shape',
      min: 0,
      max: 3,
      step: 1,
      default: 0,
      hint: '0 bevelled face, 1 pyramid, 2 dome, 3 open cell with walls.',
    },
    {
      key: 'gap',
      label: 'Gap width',
      min: 0.6,
      max: 5,
      step: 0.1,
      default: 1.4,
      unit: 'mm',
      hint: 'Groove between hexagons, or the wall thickness in open-cell mode.',
    },
    {
      key: 'bevel',
      label: 'Bevel',
      min: 0.02,
      max: 0.35,
      step: 0.01,
      default: 0.14,
      hint: 'Width of the chamfer around each cell, as a share of the hexagon.',
    },
    {
      key: 'variation',
      label: 'Height variation',
      min: 0,
      max: 0.4,
      step: 0.02,
      default: 0,
      hint: 'Lets individual hexagons sit lower, like hand-set mosaic.',
    },
  ],
  directional: false,
  seeded: true,
  cellAspect: SQRT3,
  create(ctx: TextureContext): PatternSampler {
    const { repeatsX, repeatsY, seed } = ctx
    const mode = Math.round(ctx.params.mode)
    const mmPerCell = cellMmX(ctx)
    const gap = Math.min(ctx.params.gap / 2 / mmPerCell, 0.3)
    const bevel = Math.max(ctx.params.bevel, 0.3 / mmPerCell)
    const variation = ctx.params.variation
    const wall = Math.min(ctx.params.gap / mmPerCell, 0.35)
    const hex = makeHex()
    return (u, v) => {
      hexLocal(u * repeatsX, v * repeatsY, hex)
      const hd = hexDist(hex.gx, hex.gy)
      const edge = 0.5 - hd
      let h: number
      if (mode === 3) {
        h = 1 - smoothstep(wall, wall + bevel, edge)
      } else if (mode === 1) {
        h = clamp01((edge - gap) / (0.5 - gap)) * smoothstep(gap, gap + bevel * 0.3, edge)
      } else if (mode === 2) {
        const d = clamp01(hd / 0.5)
        h = Math.sqrt(clamp01(1 - d * d)) * smoothstep(gap, gap + bevel * 0.5, edge)
      } else {
        h = smoothstep(gap, gap + bevel, edge)
      }
      if (variation > 0 && mode !== 3) {
        const r = hashCell(wrap(hex.ix, repeatsX), wrap(hex.iy, repeatsY) * 2 + hex.branch, seed) / 4294967296
        h *= 1 - variation * r
      }
      return clamp01(h)
    }
  },
}

export const tumblingBlocks: TextureDef = {
  id: 'tumbling-blocks',
  mark: 'T-20',
  name: 'Tumbling blocks',
  category: 'geometric',
  blurb: 'Stacked cubes in real relief: three facets, three tones, one optical illusion.',
  defaults: { depth: 3, scale: 36 },
  scaleRange: [12, 120],
  depthRange: [1, 6],
  params: [
    {
      key: 'mode',
      label: 'Solid',
      min: 0,
      max: 1,
      step: 1,
      default: 0,
      hint: '0 stacked cubes, 1 a field of triangular pyramids.',
    },
    {
      key: 'groove',
      label: 'Outline groove',
      min: 0,
      max: 3,
      step: 0.1,
      default: 0,
      unit: 'mm',
      hint: 'Cuts a groove around each block so the stack reads even in flat light.',
    },
    {
      key: 'chamfer',
      label: 'Edge softening',
      min: 0,
      max: 0.5,
      step: 0.02,
      default: 0.1,
      hint: 'Rounds the facet ridges so the nozzle can follow them.',
    },
  ],
  directional: true,
  seeded: false,
  cellAspect: SQRT3,
  create(ctx: TextureContext): PatternSampler {
    const { repeatsX, repeatsY } = ctx
    const triangles = ctx.params.mode >= 0.5
    const mmPerCell = cellMmX(ctx)
    const groove = ctx.params.groove / 2 / mmPerCell
    const chamfer = ctx.params.chamfer * 0.3
    const invRc = SQRT3
    const hex = makeHex()
    return (u, v) => {
      const s = u * repeatsX
      const t = v * repeatsY
      if (triangles) {
        const qy = t * SQRT3
        const l1 = 2 * t
        const l2 = s + qy / SQRT3
        const l3 = -s + qy / SQRT3
        const d1 = 0.5 - Math.abs(fract(l1) - 0.5)
        const d2 = 0.5 - Math.abs(fract(l2) - 0.5)
        const d3 = 0.5 - Math.abs(fract(l3) - 0.5)
        const m = smin(smin(d1, d2, chamfer), d3, chamfer)
        return clamp01(3 * m)
      }
      hexLocal(s, t, hex)
      // The three rhombi of a hexagon are the three visible faces of a cube.
      const f1 = hex.gy
      const f2 = -HALF_SQRT3 * hex.gx - 0.5 * hex.gy
      const f3 = HALF_SQRT3 * hex.gx - 0.5 * hex.gy
      // smax(f1, smax(f2, f3)): the inner smin stays negated, so it is a max of all three.
      const top = -smin(-f1, smin(-f2, -f3, chamfer * 0.5), chamfer * 0.5)
      let h = clamp01(1 - top * invRc)
      if (groove > 0) {
        const edge = 0.5 - hexDist(hex.gx, hex.gy)
        h *= smoothstep(groove, groove + Math.max(0.3 / mmPerCell, 0.04), edge)
      }
      return h
    }
  },
}

export const dotsBubbles: TextureDef = {
  id: 'dots-bubbles',
  mark: 'T-22',
  name: 'Dots and bubbles',
  category: 'geometric',
  blurb: 'Close-packed domes, from a crisp penny-round grid to a drift of soap bubbles.',
  defaults: { depth: 2, scale: 14 },
  scaleRange: [4, 50],
  depthRange: [0.8, 4],
  params: [
    {
      key: 'radius',
      label: 'Dot size',
      min: 0.2,
      max: 0.5,
      step: 0.01,
      default: 0.44,
      hint: 'Radius as a share of the spacing; 0.5 has the dots touching.',
    },
    {
      key: 'profile',
      label: 'Profile',
      min: 0.3,
      max: 2,
      step: 0.05,
      default: 1,
      hint: 'Low is a flat pebble, 1 a hemisphere, high a soft blister.',
    },
    {
      key: 'random',
      label: 'Scatter',
      min: 0,
      max: 1,
      step: 1,
      default: 0,
      hint: 'On: bubbles of mixed sizes at random. Off: an even hex grid.',
    },
    {
      key: 'variation',
      label: 'Size variation',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.5,
      hint: 'Spread of bubble sizes when scatter is on.',
    },
  ],
  directional: false,
  seeded: true,
  cellAspect: SQRT3,
  create(ctx: TextureContext): PatternSampler {
    const { repeatsX, repeatsY, seed } = ctx
    const radius = ctx.params.radius
    const gamma = ctx.params.profile
    const scatter = ctx.params.random >= 0.5
    const variation = ctx.params.variation
    const mmPerCell = cellMmX(ctx)
    const soft = Math.max(0.3 / mmPerCell, 0.02)
    const hex = makeHex()
    const cell = makeWorleyResult()
    if (!scatter) {
      return (u, v) => {
        hexLocal(u * repeatsX, v * repeatsY, hex)
        const d = Math.hypot(hex.gx, hex.gy) / radius
        if (d >= 1) return 0
        // A dome meets the ground with a vertical tangent; the rim fade turns that into a slope a
        // nozzle can print and a neighbouring tile can continue.
        return clamp01(Math.pow(Math.sqrt(1 - d * d), gamma) * smoothstep(0, RIM_FADE, 1 - d))
      }
    }
    return (u, v) => {
      const s = u * repeatsX
      const t = v * repeatsY
      worley2(s, t, repeatsX, repeatsY, 0.9, seed, cell)
      const r = radius * mix(1, 0.45 + 1.1 * cell.id, variation)
      const d = cell.f1 / r
      if (d >= 1) return 0
      const dome = Math.pow(Math.sqrt(1 - d * d), gamma) * smoothstep(0, RIM_FADE, 1 - d)
      // Neighbouring bubbles have different radii, so their surfaces would meet in a step. Fading
      // to zero on the cell boundary turns that step into a groove the printer can follow.
      return clamp01(dome * smoothstep(0, soft, cell.f2 - cell.f1))
    }
  },
}
