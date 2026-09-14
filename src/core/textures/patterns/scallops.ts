// T-17 fish scale: offset rows of overlapping circles. Offset rows repeat every two, so the
// registry forces an even row count per period.
//
// The surface is the MAX over the overlapping scales, not "the topmost one wins". Each scale's
// profile falls to zero at its own rim, so the max is continuous everywhere, including where a rim
// crosses a tile edge: a hard shingle step there would be a wall the neighbouring tile cannot meet.

import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { clamp, clamp01, mix, smoothstep } from './common'

/**
 * Row pitch is normally half a scale width; holding it in this band keeps offset rows reading as
 * scales when the asked-for scale dwarfs the period. Any pitch stays seamless, because one period
 * is always a whole (even) number of rows.
 */
const PITCH_RANGE: [number, number] = [0.34, 0.62]

/** How much lower a scale sits at its top edge, so the row above visibly laps over it. */
const LAP = 0.22
/**
 * Height band over which the row above takes over from the row below. Equal circles at row pitch
 * 0.5 sit 0.707 apart diagonally but 1.0 apart along a row, so a plain max of their profiles can
 * only ever give diagonal quilting: the scallop arc needs the topmost row to win outright. Blending
 * over this band keeps that shingle step on a slope the nozzle can follow (about 0.3 mm).
 */
const SHINGLE_BLEND = 0.14

export const fishScale: TextureDef = {
  id: 'fish-scale',
  mark: 'T-17',
  name: 'Fish scale',
  category: 'geometric',
  blurb: 'Overlapping scallops in offset rows, each one lapping over the pair below it.',
  defaults: { depth: 2.2, scale: 36 },
  scaleRange: [12, 100],
  depthRange: [1, 4],
  params: [
    {
      key: 'overlap',
      label: 'Overlap',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.2,
      hint: 'How far each scale laps over its neighbours.',
    },
    {
      key: 'doming',
      label: 'Doming',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.65,
      hint: 'From a flat shingle with a rolled edge to a fully domed scale.',
    },
    {
      key: 'groove',
      label: 'Rim groove',
      min: 0.4,
      max: 3,
      step: 0.1,
      default: 1.1,
      unit: 'mm',
      hint: 'Shadow line around every scale, which is also what keeps the joint printable.',
    },
    {
      key: 'lift',
      label: 'Centre lift',
      min: 0,
      max: 0.5,
      step: 0.05,
      default: 0.2,
      hint: 'Raises the middle of each scale for a deeper, more sculpted shell.',
    },
  ],
  directional: true,
  seeded: false,
  cellAspect: 0.5,
  create(ctx: TextureContext): PatternSampler {
    const nx = ctx.repeatsX
    const ny = ctx.repeatsY
    const [wMm, hMm] = ctx.periodMm
    const scaleMm = wMm / nx
    // Row pitch in scale widths, taken from the real geometry so the scales stay round in mm.
    const pitch = clamp(hMm / ny / scaleMm, PITCH_RANGE[0], PITCH_RANGE[1])
    // Offset rows at pitch p are already fully covered by radius 0.5, so anything much larger
    // buries every scale in its neighbours and the valleys never come back down to the base.
    const radius = 0.5 * (1 + ctx.params.overlap * 0.3)
    const doming = ctx.params.doming
    const lift = ctx.params.lift
    const groove = Math.max(ctx.params.groove / scaleMm / radius, 0.02)
    // How many rows a scale actually reaches: stopping short would leave a step wherever the row
    // we skipped should have been the highest one.
    const rowSpan = Math.max(1, Math.ceil(radius / pitch))
    return (u, v) => {
      const x = u * nx
      const y = v * ny * pitch
      const row0 = Math.floor(y / pitch)
      let best = 0
      for (let row = row0 - rowSpan; row <= row0 + rowSpan; row++) {
        const dy = y - row * pitch
        if (dy > radius || dy < -radius) continue
        const offset = (((row % 2) + 2) % 2) * 0.5
        const base = Math.round(x - offset)
        for (let k = -1; k <= 1; k++) {
          const dx = x - (base + k + offset)
          const d2 = dx * dx + dy * dy
          if (d2 >= radius * radius) continue
          const d = Math.sqrt(d2) / radius
          const dome = Math.sqrt(clamp01(1 - d * d))
          // Both profiles reach zero at the rim: a scale that only dips in the last few percent of
          // its radius leaves the whole wall sitting high, with no scallop to catch the light.
          const dish = 1 - d * d
          // The rim groove takes every scale to zero at its own edge, which is what makes the max
          // of the overlapping scales continuous.
          // A scale sits lower at its top edge, so the row above laps over it: that shingle step is
          // what reads as fish scale rather than a field of even domes. The lift is normalised, so
          // raising the middle shapes the scale instead of clipping it flat.
          const lap = 1 - LAP * (0.5 + (0.5 * dy) / radius)
          const h =
            mix(dish, dome, doming) * ((1 + lift * (1 - d)) / (1 + lift)) * lap * smoothstep(0, groove, 1 - d)
          // Rows are visited in order, so this hands the surface to the scale nearest the viewer.
          best = mix(best, h, smoothstep(0, SHINGLE_BLEND, h))
        }
      }
      return clamp01(best)
    }
  },
}
