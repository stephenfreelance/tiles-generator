// T-07 zellige: hand-cut Moroccan clay. Wobbly grout lines, pillowed faces and a slow undulation
// that catches raking light differently on every piece.

import { hashCell, perlin2 } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { cellMmX, cellMmY, clamp01, smoothstep, softMm } from './common'

export const zellige: TextureDef = {
  id: 'zellige',
  mark: 'T-07',
  name: 'Zellige',
  category: 'essential',
  blurb: 'Hand-cut clay squares: uneven edges, pillowed faces, every piece sitting a little proud.',
  defaults: { depth: 1.6, scale: 50 },
  scaleRange: [20, 150],
  depthRange: [0.6, 2.5],
  params: [
    {
      key: 'wobble',
      label: 'Hand-cut wobble',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.45,
      hint: 'How far the grout lines wander off straight.',
    },
    {
      key: 'undulation',
      label: 'Surface undulation',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.55,
      hint: 'Rolling of each face, the part that makes glazed zellige glitter.',
    },
    {
      key: 'grout',
      label: 'Grout width',
      min: 0,
      max: 4,
      step: 0.1,
      default: 1.4,
      unit: 'mm',
      hint: 'Width of the recess between pieces, cut to the base plate.',
    },
    {
      key: 'lift',
      label: 'Piece lift',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.5,
      hint: 'Random height difference between neighbouring pieces.',
    },
  ],
  directional: false,
  seeded: true,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const gx = ctx.repeatsX
    const gy = ctx.repeatsY
    const seed = ctx.seed
    const mmX = cellMmX(ctx)
    const mmY = cellMmY(ctx)
    const wobble = ctx.params.wobble * 0.1
    const undulation = ctx.params.undulation
    const lift = ctx.params.lift
    const groutHalf = Math.min(ctx.params.grout / 2 / Math.min(mmX, mmY), 0.2)
    // Edges roll off over a wide band: that soft shoulder is the whole look of a glazed piece.
    const roll = Math.max(softMm(1.2, Math.min(mmX, mmY)), 0.08)
    // Warp frequency is a multiple of the grid, so the wobble itself repeats with the tile.
    const wx = gx * 3
    const wy = gy * 3

    return (u, v) => {
      const s = u * gx
      const t = v * gy
      let px = s
      let py = t
      if (wobble > 0) {
        px += wobble * perlin2(u * wx, v * wy, wx, wy, seed + 11)
        py += wobble * perlin2(u * wx + 7, v * wy + 3, wx, wy, seed + 29)
      }
      const ix = Math.floor(px)
      const iy = Math.floor(py)
      const lx = px - ix
      const ly = py - iy
      const edge = Math.min(Math.min(lx, 1 - lx), Math.min(ly, 1 - ly))
      const face = smoothstep(groutHalf, groutHalf + roll, edge)
      if (face <= 0) return 0
      const h = hashCell(((ix % gx) + gx) % gx, ((iy % gy) + gy) % gy, seed)
      const tiltX = ((h & 0xff) / 255 - 0.5) * 2
      const tiltY = (((h >>> 8) & 0xff) / 255 - 0.5) * 2
      // Amplitudes are shares of the relief depth: below about 0.2 of it the wobble stops being
      // visible at all, which is what turns hand-cut clay back into a flat chocolate bar.
      const level = 1 - lift * 0.38 * ((h >>> 16) & 0xff) / 255
      // A gentle saddle plus noise: clay that was pressed by hand, not rolled flat.
      let body = level + 0.09 * (tiltX * (lx - 0.5) + tiltY * (ly - 0.5))
      if (undulation > 0) {
        body += undulation * 0.17 * perlin2(u * gx * 2, v * gy * 2, gx * 2, gy * 2, seed + 53)
        body -= undulation * 0.08 * ((lx - 0.5) * (lx - 0.5) + (ly - 0.5) * (ly - 0.5))
      }
      return clamp01(face * body)
    }
  },
}
