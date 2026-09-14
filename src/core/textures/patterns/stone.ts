// T-11 voronoi stone and T-12 terrazzo: two "material" textures, both built on wrapped-cell
// hashing so a stone or a chip can straddle a tile joint and still line up.

import { hashCell, makeWorleyResult, valueFbm2, worley2, worleyBorder } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { cellMmX, cellMmY, clamp01, smoothstep, usefulOctaves } from './common'

export const voronoiStone: TextureDef = {
  id: 'voronoi-stone',
  mark: 'T-11',
  name: 'Voronoi stone',
  category: 'organic',
  blurb: 'Dry-laid flagstones: irregular slabs with rolled edges and a deep joint between them.',
  defaults: { depth: 2, scale: 32 },
  scaleRange: [12, 90],
  depthRange: [1, 4],
  params: [
    {
      key: 'irregularity',
      label: 'Irregularity',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.85,
      hint: 'From a tidy grid of pavers to a wild rubble wall.',
    },
    {
      key: 'joint',
      label: 'Joint width',
      min: 0.6,
      max: 4,
      step: 0.1,
      default: 1.6,
      unit: 'mm',
      hint: 'Gap between stones, cut all the way to the base plate.',
    },
    {
      key: 'roll',
      label: 'Edge rounding',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.45,
      hint: 'Rounds the stone edges like a tumbled, worn surface.',
    },
    {
      key: 'texture',
      label: 'Surface texture',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.35,
      hint: 'Roughens the face of each stone with a fine quarry grain.',
    },
  ],
  directional: false,
  seeded: true,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const { repeatsX, repeatsY, seed } = ctx
    const jitter = ctx.params.irregularity
    const mmPerCell = Math.min(cellMmX(ctx), cellMmY(ctx))
    const jointHalf = ctx.params.joint / 2 / mmPerCell
    const roll = Math.max(ctx.params.roll * 0.22, 0.4 / mmPerCell)
    const rough = ctx.params.texture
    const octaves = usefulOctaves(mmPerCell / 4, 3)
    const cell = makeWorleyResult()
    // A 3x3 bisector pass is enough while sites stay inside their own cell (jitter <= 1).
    const borderRadius = jitter > 0.9 ? 2 : 1
    return (u, v) => {
      const s = u * repeatsX
      const t = v * repeatsY
      worley2(s, t, repeatsX, repeatsY, jitter, seed, cell)
      const border = worleyBorder(s, t, repeatsX, repeatsY, jitter, seed, cell, borderRadius)
      const face = smoothstep(jointHalf, jointHalf + roll, border)
      if (face <= 0) return 0
      let h = 0.72 + 0.28 * cell.id
      if (rough > 0) {
        h += rough * 0.1 * (valueFbm2(s * 4, t * 4, repeatsX * 4, repeatsY * 4, octaves, seed + 91) - 0.5)
      }
      return clamp01(face * h)
    }
  },
}

export const terrazzo: TextureDef = {
  id: 'terrazzo',
  mark: 'T-12',
  name: 'Terrazzo',
  category: 'organic',
  blurb: 'Stone chips set in a flat ground, two sizes scattered like poured terrazzo.',
  defaults: { depth: 0.9, scale: 16 },
  scaleRange: [6, 45],
  depthRange: [0.4, 2],
  params: [
    {
      key: 'density',
      label: 'Chip density',
      min: 0.2,
      max: 1,
      step: 0.05,
      default: 0.82,
      hint: 'Share of cells that actually carry a chip.',
    },
    {
      key: 'margin',
      label: 'Chip gap',
      min: 0.05,
      max: 0.4,
      step: 0.01,
      default: 0.14,
      hint: 'Shrinks every chip away from its neighbours, which sharpens their angular shape.',
    },
    {
      key: 'pebble',
      label: 'Rounded pebbles',
      min: 0,
      max: 1,
      step: 1,
      default: 0,
      hint: 'On: domed river pebbles. Off: flat angular chips.',
    },
    {
      key: 'fines',
      label: 'Small chips',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.7,
      hint: 'Weight of the second, finer layer of chips.',
    },
  ],
  directional: false,
  seeded: true,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const { repeatsX, repeatsY, seed } = ctx
    const density = ctx.params.density
    const margin = ctx.params.margin
    const pebble = ctx.params.pebble >= 0.5
    const fines = ctx.params.fines
    const mmPerCell = Math.min(cellMmX(ctx), cellMmY(ctx))
    const soft = Math.max(0.35 / mmPerCell, 0.04)
    // The fine layer is about 2.5x denser; both layers keep their own integer period.
    const fx = Math.max(1, Math.round(repeatsX * 2.5))
    const fy = Math.max(1, Math.round(repeatsY * 2.5))
    const cell = makeWorleyResult()

    const layer = (x: number, y: number, px: number, py: number, salt: number): number => {
      worley2(x, y, px, py, 0.9, seed + salt, cell)
      if (cell.id > density) return 0
      const shade = 0.62 + 0.38 * (hashCell(cell.cx, cell.cy, seed + salt + 13) / 4294967296)
      if (pebble) {
        const radius = 0.28 + 0.22 * (hashCell(cell.cx, cell.cy, seed + salt + 29) / 4294967296)
        const d = cell.f1 / radius
        if (d >= 1) return 0
        // Pebbles of different sizes would meet in a step on the cell boundary, and a bare dome rim
        // is a vertical wall; both get faded out.
        return Math.sqrt(1 - d * d) * shade * smoothstep(0, soft, cell.f2 - cell.f1) * smoothstep(0, 0.15, 1 - d)
      }
      // Half the gap to the neighbouring site is the chip's own border distance.
      const border = (cell.f2 - cell.f1) * 0.5
      return smoothstep(margin, margin + soft, border) * shade
    }

    return (u, v) => {
      const big = layer(u * repeatsX, v * repeatsY, repeatsX, repeatsY, 0)
      if (fines <= 0) return clamp01(big)
      const small = layer(u * fx, v * fy, fx, fy, 500) * 0.75 * fines
      return clamp01(Math.max(big, small))
    }
  },
}
