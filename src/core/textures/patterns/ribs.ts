// T-06 fluted (concave channels) and reeded (convex ribs). Both are one-dimensional profiles, so
// the seam falls on a flat land and the two tiles meet with matching tangents.

import { hashCell } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { cellMmX, clamp01, fract, mix, smoothstep, softMm } from './common'

export const fluted: TextureDef = {
  id: 'fluted',
  mark: 'T-06',
  name: 'Fluted',
  category: 'essential',
  blurb: 'Concave channels milled into the face, throwing one crisp shadow line each.',
  defaults: { depth: 2.4, scale: 14 },
  scaleRange: [5, 45],
  depthRange: [0.8, 5],
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
      hint: 'From a round scoop (0) to a deep U with steep walls (1).',
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
    const halfSpan = Math.max((1 - land) / 2, 0.05)
    // A raised cosine rather than a circle: the circle meets the land with a vertical wall, which
    // no nozzle can follow and no neighbouring tile can meet.
    const power = mix(0.5, 1.5, ctx.params.profile)
    const lip = ctx.params.lip
    const lipWidth = Math.min(softMm(0.6, mmPerCell), halfSpan * 0.6)
    return (u, v) => {
      void v
      const f = fract(n * u)
      const q = (f - 0.5) / halfSpan
      if (q <= -1 || q >= 1) {
        if (lip <= 0) return 1
        const toLand = Math.min(Math.abs(q) - 1, 1) * halfSpan
        return 1 - 0.18 * lip * smoothstep(0, lipWidth, toLand)
      }
      const deep = 0.5 + 0.5 * Math.cos(Math.PI * q)
      return clamp01(1 - Math.pow(deep, power))
    }
  },
}

export const reeded: TextureDef = {
  id: 'reeded-ribbed',
  mark: 'T-08',
  name: 'Reeded',
  category: 'linear',
  blurb: 'Convex reeds, optionally in an irregular hand-cut rhythm, like a pleated curtain.',
  defaults: { depth: 2, scale: 12 },
  scaleRange: [4, 40],
  depthRange: [0.8, 4],
  params: [
    {
      key: 'roundness',
      label: 'Roundness',
      min: 0.3,
      max: 2,
      step: 0.05,
      default: 0.6,
      hint: 'Low is a half-round reed, high is a soft flute with a flat valley.',
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
      hint: 'Lets some reeds sit lower than their neighbours.',
    },
    {
      key: 'groove',
      label: 'Valley width',
      min: 0,
      max: 3,
      step: 0.1,
      default: 0,
      unit: 'mm',
      hint: 'Flat gap between reeds. 0 keeps them touching.',
    },
  ],
  directional: true,
  seeded: true,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const n = ctx.repeatsX
    const mmPerCell = cellMmX(ctx)
    const gamma = ctx.params.roundness
    const rho = ctx.params.widthVar
    const sigma = ctx.params.heightVar
    const gap = clamp01(ctx.params.groove / mmPerCell)
    // sin(pi f) ^ gamma has an infinite slope at the rib edge when gamma < 1, so every rib gets a
    // soft foot at least 0.3 mm wide.
    const foot = Math.min(0.3 / mmPerCell, 0.25)
    const seed = ctx.seed

    // One period holds exactly n reeds; their widths and heights are precomputed so sampling is a
    // table lookup instead of a hash chain.
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
    for (let i = 0; i < n; i++) {
      widths[i] = widths[i] / total
      edges[i] = acc
      acc += widths[i]
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
      const width = widths[i]
      let f = (uu - edges[i]) / width
      if (gap > 0) {
        // The gap eats into both ends of the reed, leaving a flat valley at zero.
        const half = Math.min(gap * 0.5, 0.45)
        f = (f - half) / Math.max(1 - 2 * half, 1e-6)
        if (f <= 0 || f >= 1) return 0
      }
      const s = Math.sin(Math.PI * clamp01(f))
      const edge = Math.min(f, 1 - f)
      return clamp01(heights[i] * Math.pow(s, gamma) * smoothstep(0, foot, edge))
    }
  },
}
