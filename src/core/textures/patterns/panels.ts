// T-18 arches, T-19 diamond quilted and T-23 Moroccan star: three drawn, architectural patterns.
// All three are functions of fract(s) and fract(t) with integer counts, so they tile exactly.

import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { cellMmX, cellMmY, clamp01, fract, mix, smoothstep, SQRT3 } from './common'

export const arches: TextureDef = {
  id: 'arches',
  mark: 'T-18',
  name: 'Arches',
  category: 'geometric',
  blurb: 'A colonnade of round-headed arches, filled or drawn as an outline.',
  defaults: { depth: 1.6, scale: 42 },
  scaleRange: [15, 120],
  depthRange: [0.8, 3],
  params: [
    {
      key: 'margin',
      label: 'Gap',
      min: 0.8,
      max: 10,
      step: 0.1,
      default: 2.5,
      unit: 'mm',
      hint: 'Space around each arch; the pattern is flat there, which is where tiles meet.',
    },
    {
      key: 'outline',
      label: 'Outline',
      min: 0,
      max: 1,
      step: 1,
      default: 0,
      hint: 'On: a drawn line follows the arch. Off: the whole arch is raised.',
    },
    {
      key: 'lineWidth',
      label: 'Line width',
      min: 0.8,
      max: 6,
      step: 0.1,
      default: 2.5,
      unit: 'mm',
      hint: 'Thickness of the outline, when outline mode is on.',
    },
    {
      key: 'offsetRows',
      label: 'Offset rows',
      min: 0,
      max: 1,
      step: 1,
      default: 0,
      hint: 'Shifts every other row by half an arch, like a running bond.',
    },
  ],
  directional: true,
  seeded: false,
  cellAspect: 1.7,
  create(ctx: TextureContext): PatternSampler {
    const nx = ctx.repeatsX
    const ny = ctx.repeatsY
    const cw = cellMmX(ctx)
    const ch = cellMmY(ctx)
    const margin = Math.min(ctx.params.margin, cw * 0.4, ch * 0.4)
    const outline = ctx.params.outline >= 0.5
    // The outline has to die out before the cell boundary, or offset rows would meet mid-line.
    const lineHalf = Math.min(ctx.params.lineWidth / 2, Math.max(0.4, margin - 0.4))
    const offsetRows = ctx.params.offsetRows >= 0.5
    const a = cw / 2 - margin
    const springline = ch - margin - a
    const bevelMm = 0.4
    return (u, v) => {
      const t = v * ny
      const row = Math.floor(t)
      const s = u * nx + (offsetRows && (row & 1) === 1 ? 0.5 : 0)
      const x = (fract(s) - 0.5) * cw
      const y = fract(t) * ch
      // Signed distance to a round-headed arch: a rectangle below the springline, a disc above.
      let sd: number
      if (y <= springline) {
        sd = Math.max(Math.abs(x) - a, margin - y)
      } else {
        sd = Math.max(Math.hypot(x, y - springline) - a, margin - y)
      }
      if (outline) {
        return clamp01(1 - smoothstep(lineHalf, lineHalf + bevelMm, Math.abs(sd)))
      }
      return clamp01(smoothstep(0, bevelMm, -sd))
    }
  },
}

export const diamondQuilted: TextureDef = {
  id: 'diamond-quilted',
  mark: 'T-19',
  name: 'Diamond quilted',
  category: 'geometric',
  blurb: 'Pyramids, pillows, tufted buttons or a waffle grid, on the square or on the diagonal.',
  defaults: { depth: 2.2, scale: 26 },
  scaleRange: [8, 80],
  depthRange: [1, 5],
  params: [
    {
      key: 'mode',
      label: 'Form',
      min: 0,
      max: 3,
      step: 1,
      default: 0,
      hint: '0 pyramid, 1 pillow, 2 tufted, 3 waffle grid.',
    },
    {
      key: 'diamond',
      label: 'Diagonal',
      min: 0,
      max: 1,
      step: 1,
      default: 1,
      hint: 'On: diamonds at 45°. Off: squares aligned with the tile.',
    },
    {
      key: 'flatTop',
      label: 'Flat top',
      min: 0,
      max: 0.5,
      step: 0.02,
      default: 0.1,
      hint: 'Truncates the peaks, which prints more cleanly than a point.',
    },
    {
      key: 'button',
      label: 'Button dimple',
      min: 0,
      max: 0.6,
      step: 0.02,
      default: 0.3,
      hint: 'Depth of the tufting button, in tufted mode.',
    },
  ],
  directional: false,
  seeded: false,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const nx = ctx.repeatsX
    const ny = ctx.repeatsY
    const mode = Math.round(ctx.params.mode)
    const diamond = ctx.params.diamond >= 0.5
    const flatTop = clamp01(ctx.params.flatTop)
    const button = ctx.params.button
    const mmPerCell = Math.min(cellMmX(ctx), cellMmY(ctx))
    const ribHalf = Math.min(0.06 + 0.3 / mmPerCell, 0.3)
    const soft = Math.max(0.3 / mmPerCell, 0.03)
    return (u, v) => {
      const s = u * nx
      const t = v * ny
      const a = diamond ? s + t : s
      const b = diamond ? s - t : t
      const da = fract(a) - 0.5
      const db = fract(b) - 0.5
      if (mode === 3) {
        const edge = Math.min(0.5 - Math.abs(da), 0.5 - Math.abs(db))
        return clamp01(1 - smoothstep(ribHalf, ribHalf + soft, edge))
      }
      if (mode === 0) {
        const m = Math.max(Math.abs(da), Math.abs(db))
        return clamp01((1 - 2 * m) / Math.max(1 - flatTop, 1e-3))
      }
      // The fractional power leaves an infinite slope where the pillow meets the cell edge, so the
      // last fraction of a millimetre is faded by hand.
      const cellEdge = Math.min(0.5 - Math.abs(da), 0.5 - Math.abs(db))
      const pillow =
        Math.pow(clamp01(Math.cos(Math.PI * da) * Math.cos(Math.PI * db)), mix(0.75, 0.45, flatTop * 2)) *
        smoothstep(0, soft, cellEdge)
      if (mode === 1) return clamp01(pillow)
      const ba = fract(a + 0.5) - 0.5
      const bb = fract(b + 0.5) - 0.5
      const r2 = (ba * ba + bb * bb) / 0.018
      return clamp01(pillow - button * Math.exp(-r2))
    }
  },
}

export const moroccanStar: TextureDef = {
  id: 'moroccan-star',
  mark: 'T-23',
  name: 'Moroccan star',
  category: 'geometric',
  blurb: 'The eight-point star and cross of zellij, stars raised proud of their crosses.',
  defaults: { depth: 1.6, scale: 42 },
  scaleRange: [15, 120],
  depthRange: [0.8, 3],
  params: [
    {
      key: 'crossHeight',
      label: 'Cross height',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.55,
      hint: 'Height of the crosses relative to the stars.',
    },
    {
      key: 'groove',
      label: 'Grout width',
      min: 0.6,
      max: 4,
      step: 0.1,
      default: 1.2,
      unit: 'mm',
      hint: 'Recess between the pieces, cut to the base plate.',
    },
    {
      key: 'bevel',
      label: 'Bevel',
      min: 0.3,
      max: 4,
      step: 0.1,
      default: 1.2,
      unit: 'mm',
      hint: 'Chamfer around every piece; wider bevels round off the fragile star points.',
    },
    {
      key: 'incise',
      label: 'Incised star',
      min: 0,
      max: 0.5,
      step: 0.05,
      default: 0,
      hint: 'Carves a line inside each star, the way a painted zellij panel is scored.',
    },
  ],
  directional: false,
  seeded: false,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const nx = ctx.repeatsX
    const ny = ctx.repeatsY
    const mmPerCell = Math.min(cellMmX(ctx), cellMmY(ctx))
    const grout = ctx.params.groove / 2 / mmPerCell
    const bevel = Math.max(ctx.params.bevel / mmPerCell, 0.3 / mmPerCell)
    const crossHeight = ctx.params.crossHeight
    const incise = ctx.params.incise
    // Star points reach the cell edge midpoints at this radius, so crosses fill the gaps exactly.
    const starRadius = 0.5 / SQRT3 + 0.0648
    return (u, v) => {
      const lx = fract(u * nx) - 0.5
      const ly = fract(v * ny) - 0.5
      const ax = Math.abs(lx)
      const ay = Math.abs(ly)
      // Union of a square and a square turned 45°: the eight-point star.
      const field = starRadius - Math.min(Math.max(ax, ay), (ax + ay) / Math.SQRT2)
      let h: number
      if (field > 0) {
        h = smoothstep(grout, grout + bevel, field)
        if (incise > 0) {
          const line = Math.abs(field - starRadius * 0.45)
          h -= incise * (1 - smoothstep(0, 0.05, line))
        }
      } else {
        h = crossHeight * smoothstep(grout, grout + bevel, -field)
      }
      return clamp01(h)
    }
  },
}
