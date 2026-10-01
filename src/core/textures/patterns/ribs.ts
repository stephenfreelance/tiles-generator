// T-06 fluted (concave channels) and reeded (convex ribs). Both are one-dimensional profiles, so
// the seam falls on a flat land (or a valley) and the two tiles meet with matching tangents.
//
// A face-up print lays a profile down in layers, so a gentle curve (the bottom of a round scoop, the
// crest of a half-round reed) comes out as one wide flat tread edged by a line, not as a curve. Both
// profiles here are therefore built from their SLOPE: straight flanks steep enough that every layer
// line sits close to the next, exact flats, and short fillets sized in millimetres between them.

import { hashCell } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { cellMmX, clamp01, fract, MIN_SOFT_MM, mix, smoothstep } from './common'

/**
 * A rise from 0 to 1 given by its slope at a few knots (x in mm, slope in any unit), with the slope
 * linear between knots: each piece is then a parabola, so a straight flank prints as evenly spaced
 * lines and a fillet is exactly as wide as its knots say. Integrated once here, evaluated in closed form.
 */
function slopeRamp(xs: readonly number[], gs: readonly number[]): (x: number) => number {
  const k = xs.length
  const ys = new Float64Array(k)
  for (let i = 1; i < k; i++) ys[i] = ys[i - 1] + ((gs[i - 1] + gs[i]) * (xs[i] - xs[i - 1])) / 2
  const total = ys[k - 1] > 0 ? ys[k - 1] : 1
  const x0 = xs[0]
  const x1 = xs[k - 1]
  return (x) => {
    if (x <= x0) return 0
    if (x >= x1) return 1
    let i = 0
    while (i < k - 2 && x >= xs[i + 1]) i++
    const d = x - xs[i]
    const span = xs[i + 1] - xs[i]
    const y = span > 0 ? ys[i] + gs[i] * d + ((gs[i + 1] - gs[i]) * d * d) / (2 * span) : ys[i]
    return y / total
  }
}

/**
 * Longest flank, mm, that still prints as a slope at either texture's default depth (a mean of about 17
 * degrees or more): a wider feature grows a flat instead (a floor in a channel, a valley between reeds)
 * and keeps its flanks this steep, where a wider curve would spread its layers into stripes.
 */
const FLANK_MM = 6.5

export const fluted: TextureDef = {
  id: 'fluted',
  mark: 'T-06',
  name: 'Fluted',
  category: 'essential',
  blurb: 'Concave channels milled into the face, throwing one crisp shadow line each.',
  defaults: { depth: 2.4, scale: 14 },
  scaleRange: [5, 45],
  // Shallower than this, at its default feature size, a quarter or more of it prints as stair steps wider than 1 mm.
  depthRange: [1.4, 5],
  params: [
    {
      key: 'land',
      label: 'Flat land',
      min: 0,
      max: 0.5,
      step: 0.01,
      default: 0.14,
      hint: 'Share of each pitch left flat between channels.',
    },
    {
      key: 'profile',
      label: 'Channel profile',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.2,
      hint: 'From a round scoop (0) to a deep U with steep walls and a flat floor (1).',
    },
    {
      key: 'lip',
      label: 'Lip',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0,
      hint: 'Raises a fine bead along each land for a ribbed-glass glint.',
    },
  ],
  directional: true,
  seeded: false,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const n = ctx.repeatsX
    const mmPerCell = cellMmX(ctx)
    // The land has to hold two extrusion lines, and the channel needs room to be a channel.
    const land = clamp01(Math.max(ctx.params.land, 0.8 / mmPerCell))
    const halfMm = Math.max((1 - land) / 2, 0.05) * mmPerCell
    const profile = ctx.params.profile
    // Channel from its centre to the land: a flat floor, a fillet, a concave flank (steeper towards the
    // land, which is what reads as a scoop) and a short rounded shoulder that throws the shadow line.
    const floor = Math.max(profile * 0.42 * halfMm, halfMm - FLANK_MM)
    const flank = halfMm - floor
    const fillet = Math.min(floor > 0 ? 0.6 : 0.9, flank * 0.25)
    const shoulder = Math.min(0.45, flank * 0.15)
    const steepen = mix(2.2, 3.6, profile)
    const wall = slopeRamp([floor, floor + fillet, halfMm - shoulder, halfMm], [0, 1, steepen, 0])
    // A bead under two layers (at the default depth) would show in the preview and vanish in the print,
    // so the lip starts there.
    const lip = ctx.params.lip > 0 ? mix(0.17, 0.3, ctx.params.lip) : 0
    // The land is at least 0.8 mm, so the bead's slope is never narrower than MIN_SOFT_MM.
    const lipWidth = Math.min(0.6, 0.4 * land * mmPerCell)
    return (u, v) => {
      void v
      const x = Math.abs(fract(n * u) - 0.5) * mmPerCell
      if (x < halfMm) return wall(x)
      if (lip <= 0) return 1
      return 1 - lip * smoothstep(0, lipWidth, x - halfMm)
    }
  },
}

export const reeded: TextureDef = {
  id: 'reeded-ribbed',
  mark: 'T-08',
  name: 'Reeded',
  category: 'linear',
  blurb: 'Convex reeds, optionally in an irregular hand-cut rhythm, like a pleated curtain.',
  // Deep enough that the steep foot drawing each valley line leaves the flanks past 11 degrees.
  defaults: { depth: 2.4, scale: 12 },
  scaleRange: [4, 40],
  // Shallower than this, at its default feature size, a quarter or more of it prints as stair steps wider than 1 mm.
  depthRange: [2, 4],
  params: [
    {
      key: 'roundness',
      label: 'Roundness',
      min: 0.3,
      max: 2,
      step: 0.05,
      default: 0.6,
      hint: 'Low is a full reed rising steeply out of a crisp valley, high a sharper ridge with straight sides.',
    },
    {
      key: 'widthVar',
      label: 'Width variation',
      min: 0,
      max: 0.8,
      step: 0.05,
      default: 0,
      hint: 'Randomises reed widths for the hand-cut, irregular look.',
    },
    {
      key: 'heightVar',
      label: 'Height variation',
      min: 0,
      max: 0.6,
      step: 0.05,
      default: 0,
      hint: 'Makes some reeds smaller than their neighbours, lower and narrower alike.',
    },
    {
      key: 'groove',
      label: 'Valley width',
      min: 0,
      max: 3,
      step: 0.1,
      default: 0,
      unit: 'mm',
      hint: 'Flat gap between reeds. At 0 they touch, unless a reed is too wide to keep its sides steep.',
    },
  ],
  directional: true,
  seeded: true,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const n = ctx.repeatsX
    const periodMm = ctx.periodMm[0]
    // A reed is built from its slope (see slopeRamp): a steep foot out of the valley, a short shoulder that
    // eases it into the flank, a flank that flattens towards the crest and a narrow rounded crown. The steep
    // foot is what draws the dark valley line of reeded glass; a full reed also curves its flank, so its
    // shading rolls across it, where a sharp one keeps straight sides and a softer valley.
    const fullness = clamp01((2 - ctx.params.roundness) / 1.7)
    const footSlope = mix(4, 14, fullness)
    const sideSlope = mix(1, 2.4, fullness)
    const crownMm = mix(0.5, 0.9, fullness)
    const rho = ctx.params.widthVar
    const sigma = ctx.params.heightVar
    const groove = ctx.params.groove
    const seed = ctx.seed

    // One period holds exactly n reeds; their widths, heights and profiles are precomputed so sampling
    // is a table lookup instead of a hash chain.
    const edges = new Float64Array(n + 1)
    const widths = new Float64Array(n)
    const heights = new Float64Array(n)
    let total = 0
    for (let i = 0; i < n; i++) {
      const r = hashCell(i, 0, seed) / 4294967296
      widths[i] = 1 + rho * (2 * r - 1)
      total += widths[i]
      heights[i] = 1 - sigma * (hashCell(i, 77, seed) / 4294967296)
    }
    let acc = 0
    const profiles: ((x: number) => number)[] = []
    for (let i = 0; i < n; i++) {
      widths[i] = widths[i] / total
      edges[i] = acc
      acc += widths[i]
      // Half a reed, from its edge (the valley) to its crest, in mm. A lower reed is a smaller copy of a
      // full one, narrower as well as lower, so its sides keep the slope that prints smoothly.
      const halfMm = (widths[i] * periodMm) / 2
      const flank = (halfMm - Math.max(Math.min(groove / 2, 0.4 * halfMm), halfMm - FLANK_MM)) * heights[i]
      const valley = halfMm - flank
      // Fillet, shoulder and crown are fixed widths in mm, so the crest prints as one tread under 2 mm wide
      // whatever the reed's width. Where two reeds touch, their fillets meet as one MIN_SOFT_MM round.
      const fillet = Math.min(MIN_SOFT_MM / 2, flank * 0.06)
      const shoulder = Math.min(0.4, flank * 0.15)
      const crown = Math.min(crownMm, flank * 0.27)
      profiles.push(
        slopeRamp(
          [valley, valley + fillet, valley + fillet + shoulder, halfMm - crown, halfMm],
          [0, footSlope, sideSlope, 1, 0],
        ),
      )
    }
    edges[n] = 1

    // Uniform bucket index: with irregular widths a direct floor is wrong, so map u through a table.
    const buckets = new Int32Array(n * 4)
    for (let b = 0; b < buckets.length; b++) {
      const target = b / buckets.length
      let i = 0
      while (i < n - 1 && edges[i + 1] <= target) i++
      buckets[b] = i
    }

    return (u, v) => {
      void v
      const uu = fract(u)
      let i = buckets[Math.min(buckets.length - 1, (uu * buckets.length) | 0)]
      while (i < n - 1 && uu >= edges[i + 1]) i++
      const fromEdge = Math.min(uu - edges[i], edges[i + 1] - uu) * periodMm
      return clamp01(heights[i] * profiles[i](fromEdge))
    }
  },
}
