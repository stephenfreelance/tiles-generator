// T-16 basketweave and T-21 knit: two woven surfaces. Basketweave alternates block direction, so
// the registry gives it an even repeat count on both axes.

import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { cellMmX, cellMmY, clamp01, fract, intAtLeast1, smoothstep } from './common'

export const basketweave: TextureDef = {
  id: 'basketweave',
  mark: 'T-16',
  name: 'Basketweave',
  category: 'geometric',
  blurb: 'Groups of slats turning a quarter-turn each block, woven over and under.',
  defaults: { depth: 1.7, scale: 30 },
  scaleRange: [12, 80],
  depthRange: [0.8, 3],
  params: [
    {
      key: 'slats',
      label: 'Slats per block',
      min: 1,
      max: 5,
      step: 1,
      default: 3,
      hint: 'How many reeds make up one woven block.',
    },
    {
      key: 'dip',
      label: 'Over and under',
      min: 0,
      max: 0.5,
      step: 0.02,
      default: 0.22,
      hint: 'How far each slat dips where it passes under its neighbour.',
    },
    {
      key: 'joint',
      label: 'Block groove',
      min: 0,
      max: 3,
      step: 0.1,
      default: 0.8,
      unit: 'mm',
      hint: 'Groove between blocks; 0 lets the blocks touch.',
    },
    {
      key: 'roundness',
      label: 'Slat roundness',
      min: 0.3,
      max: 1.5,
      step: 0.05,
      default: 0.6,
      hint: 'Low is a flat strap, high a rounded cord.',
    },
  ],
  directional: false,
  seeded: false,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const nx = ctx.repeatsX
    const ny = ctx.repeatsY
    const slats = intAtLeast1(ctx.params.slats)
    const dip = ctx.params.dip
    const gamma = ctx.params.roundness
    const mmX = cellMmX(ctx)
    const mmY = cellMmY(ctx)
    const jointHalf = ctx.params.joint / 2 / Math.min(mmX, mmY)
    const bevel = Math.max(0.3 / Math.min(mmX, mmY), 0.03)
    // The slat profile is a fractional power of a sine, so its edge needs a soft foot to stay
    // printable and to meet the next tile without a wall.
    const foot = Math.min((0.3 * slats) / Math.min(mmX, mmY), 0.25)
    return (u, v) => {
      const s = u * nx
      const t = v * ny
      const i = Math.floor(s)
      const j = Math.floor(t)
      const lx = s - i
      const ly = t - j
      // The (i + j) parity is why this pattern needs an even number of blocks per period.
      const horizontal = ((i + j) & 1) === 0
      const along = horizontal ? lx : ly
      const across = horizontal ? ly : lx
      const cross = fract(slats * across)
      const slat =
        Math.pow(Math.sin(Math.PI * cross), gamma) * smoothstep(0, foot, Math.min(cross, 1 - cross))
      if (slat <= 0) return 0
      // Each slat dips at its ends, where the perpendicular block passes over it.
      const weave = 1 - dip + dip * Math.sin(Math.PI * along)
      const edge = Math.min(along, 1 - along)
      return clamp01(slat * weave * smoothstep(jointHalf, jointHalf + bevel, edge))
    }
  },
}

export const knit: TextureDef = {
  id: 'knit',
  mark: 'T-21',
  name: 'Chunky knit',
  category: 'geometric',
  blurb: 'Rows of plump stitches, each a pair of twisted plies leaning into its neighbour.',
  defaults: { depth: 2.6, scale: 16 },
  scaleRange: [6, 45],
  depthRange: [1, 4],
  params: [
    {
      key: 'angle',
      label: 'Stitch lean',
      min: 20,
      max: 50,
      step: 1,
      default: 35,
      unit: '°',
      hint: 'Angle of the two legs of each stitch.',
    },
    {
      key: 'plump',
      label: 'Yarn thickness',
      min: 0.7,
      max: 1.35,
      step: 0.05,
      default: 1,
      hint: 'Thicker yarn closes the gaps between stitches.',
    },
    {
      key: 'ply',
      label: 'Ply twist',
      min: 0,
      max: 0.4,
      step: 0.02,
      default: 0.16,
      hint: 'Ripples along each leg, the twist of a spun yarn.',
    },
  ],
  directional: true,
  seeded: false,
  cellAspect: 0.8,
  create(ctx: TextureContext): PatternSampler {
    const nx = ctx.repeatsX
    const ny = ctx.repeatsY
    const angle = (ctx.params.angle * Math.PI) / 180
    const plump = ctx.params.plump
    const ply = ctx.params.ply
    const rx = 0.24 * plump
    const ry = 0.62 * plump
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    const offsets = [-0.22, 0.22]
    return (u, v) => {
      const lx = fract(u * nx) - 0.5
      const ly = fract(v * ny)
      let best = 0
      for (let row = -1; row <= 1; row++) {
        const cy = 0.5 + row
        for (let side = 0; side < 2; side++) {
          const dx = lx - offsets[side]
          const dy = ly - cy
          // Each leg leans the opposite way, which is what makes the V of a knit stitch.
          const sign = side === 0 ? 1 : -1
          const rxv = (cosA * dx + sign * sinA * dy) / rx
          const ryv = (-sign * sinA * dx + cosA * dy) / ry
          const q = rxv * rxv + ryv * ryv
          if (q >= 1) continue
          // The bare ellipse rim is a vertical wall; fading it over the last few percent of the
          // lobe keeps the yarn round and the tile edge meetable.
          let lobe = Math.sqrt(1 - q) * smoothstep(0, 0.15, 1 - q)
          if (ply > 0) lobe *= 1 - ply + ply * (0.5 + 0.5 * Math.cos(Math.PI * 6 * ryv + Math.PI * 0.25))
          if (lobe > best) best = lobe
        }
      }
      return clamp01(best)
    }
  },
}
