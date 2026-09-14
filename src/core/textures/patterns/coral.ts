// T-04 coral: domain-warped ridged noise for the reef, banded to a brain-coral labyrinth, with
// worley pits for polyps. Everything is periodic, so the reef grows straight through a tile joint.

import { fbm2, makeWorleyResult, ridged2, valueFbm2, worley2 } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { cellMmX, clamp01, mix, smoothstep, usefulOctaves, TAU } from './common'

export const coral: TextureDef = {
  id: 'coral',
  mark: 'T-04',
  name: 'Coral',
  category: 'essential',
  blurb: 'A living reef: brain-coral ridges wander and split, pitted with polyps.',
  defaults: { depth: 2.6, scale: 20 },
  scaleRange: [6, 50],
  depthRange: [1, 5],
  params: [
    {
      key: 'labyrinth',
      label: 'Brain coral',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.8,
      hint: 'From a rough reef crust (0) to the winding, evenly spaced grooves of brain coral (1).',
    },
    {
      key: 'warp',
      label: 'Flow',
      min: 0,
      max: 1.5,
      step: 0.05,
      default: 0.85,
      hint: 'How much the ridges meander. Higher values look grown rather than drawn.',
    },
    {
      key: 'polyps',
      label: 'Polyps',
      min: 0,
      max: 0.45,
      step: 0.01,
      default: 0.18,
      hint: 'Size of the little pits scattered over the crests.',
    },
    {
      key: 'detail',
      label: 'Detail',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.45,
      hint: 'Extra fine structure; octaves finer than the nozzle can print are dropped anyway.',
    },
  ],
  directional: false,
  seeded: true,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const { repeatsX, repeatsY, seed } = ctx
    const mmPerCell = cellMmX(ctx)
    const maxOctaves = 2 + Math.round(ctx.params.detail * 3)
    // Reef ridges thinner than about 3 mm read as crinkled foil and print as fuzz, so stop there
    // rather than at the nozzle limit.
    const octaves = usefulOctaves(mmPerCell, maxOctaves, 3)
    const warp = ctx.params.warp
    const labyrinth = ctx.params.labyrinth
    const polyps = ctx.params.polyps
    // Brain coral is a few broad winding grooves, not a fine maze: banding once per noise swing
    // keeps each ridge wide enough to read across a room and to print.
    const bandRate = 0.9
    const worleyResult = makeWorleyResult()
    // Polyps sit on a finer lattice than the ridges; 3x is the research's figure.
    const px = repeatsX * 3
    const py = repeatsY * 3

    return (u, v) => {
      const s = u * repeatsX
      const t = v * repeatsY
      let x = s
      let y = t
      if (warp > 0) {
        // Value-noise warp: cheaper than gradient noise and smoother at this amplitude.
        const wx = valueFbm2(s, t, repeatsX, repeatsY, 2, seed + 101) - 0.5
        const wy = valueFbm2(s + 5, t + 1, repeatsX, repeatsY, 2, seed + 227) - 0.5
        x = s + warp * 2 * wx
        y = t + warp * 2 * wy
      }
      const reef = ridged2(x, y, repeatsX, repeatsY, octaves, seed)
      let h = clamp01((reef - 0.18) * 1.9)
      if (labyrinth > 0) {
        // Banding a smooth field turns it into evenly spaced, splitting ridges: the brain-coral look.
        const field = fbm2(x, y, repeatsX, repeatsY, Math.max(2, octaves - 1), seed + 77)
        const maze = 0.5 + 0.5 * Math.cos(TAU * field * bandRate)
        h = mix(h, maze * maze * (3 - 2 * maze) * 0.92 + 0.04, labyrinth)
      }
      if (polyps > 0) {
        worley2(u * px, v * py, px, py, 0.85, seed + 313, worleyResult)
        h -= 0.38 * (1 - smoothstep(0, polyps, worleyResult.f1)) * h
      }
      return clamp01(h)
    }
  },
}
