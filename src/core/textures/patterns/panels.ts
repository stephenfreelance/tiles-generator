// T-18 arches, T-19 diamond quilted and T-23 Moroccan star: three drawn, architectural patterns.
// All three are functions of fract(s) and fract(t) with integer counts, so they tile exactly.

import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { cellMmX, cellMmY, clamp01, fract, MIN_SOFT_MM, mix, shoulder, SHOULDER_SLOPE, shoulderRunLimit, smoothstep, SQRT3 } from './common'

/** A pillow's shoulder is twice as steep at its seam as at its face, which is what makes it read puffed. */
const PILLOW_RATIO = 2
/** Tufting button height, a share of the relief. */
const BUTTON_HEIGHT = 0.45

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
  // Below 1.8 mm a pyramid on the square lattice, whose flank reaches its widest run at the default size, falls
  // under 11 degrees and prints as ringed terraces.
  depthRange: [1.8, 5],
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
      max: 0.6,
      step: 0.02,
      default: 0.3,
      hint: 'Share of each pyramid or pillow left flat on top, which prints as one clean face.',
    },
    {
      key: 'button',
      label: 'Button pull',
      min: 0,
      max: 0.6,
      step: 0.02,
      default: 0.3,
      hint: 'How far each button draws the corners of the pillows around it back, in tufted mode.',
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
    // Millimetres across one unit of a or b: the diagonal lattice packs its lines root 2 closer.
    const unitMm = diamond ? mmPerCell / Math.SQRT2 : mmPerCell
    const halfMm = unitMm / 2
    const refDepth = diamondQuilted.defaults.depth
    // Every flank keeps 14 degrees at the default depth: a bigger cell grows its flat top, never a shallower slope.
    const pyramidRun = Math.max(Math.min((1 - flatTop) * halfMm, shoulderRunLimit(refDepth, SHOULDER_SLOPE, 0)), 0.3)
    // Pillows: a squircle face, flat across its middle, with a shoulder that rolls steeply into a stitched seam.
    const seamHalf = 0.3
    const fillet = Math.min(0.8, 0.12 * halfMm)
    const pillowRun = Math.max(
      Math.min(halfMm - seamHalf - flatTop * halfMm, shoulderRunLimit(refDepth, SHOULDER_SLOPE, fillet, PILLOW_RATIO)),
      0.3,
    )
    const pillowTop = halfMm - seamHalf - pillowRun
    // The norm's power sets the pillow's plan: 4 is a cushion with pinched corners; tufting pulls it towards 2, a
    // round pillow drawn back from a wide pit where the button sits.
    const power = mode === 2 ? mix(4, 2.4, clamp01(button / 0.6)) : 4
    const buttonR = Math.min(Math.max(0.12 * halfMm, 1.2), 3)
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
      const xa = Math.abs(da) * unitMm
      const xb = Math.abs(db) * unitMm
      if (mode === 0) return clamp01((halfMm - Math.max(xa, xb)) / pyramidRun)
      const n = power === 4 ? Math.sqrt(Math.sqrt(xa ** 4 + xb ** 4)) : (xa ** power + xb ** power) ** (1 / power)
      const pillow = shoulder(pillowTop + pillowRun - n, pillowRun, fillet, PILLOW_RATIO)
      if (mode === 1) return pillow
      const ca = (fract(a + 0.5) - 0.5) * unitMm
      const cb = (fract(b + 0.5) - 0.5) * unitMm
      // The button: a flat-topped stud with a 0.4 mm chamfer, standing on the floor of the pit.
      return Math.max(pillow, BUTTON_HEIGHT * clamp01((buttonR - Math.hypot(ca, cb)) / 0.4))
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
      step: 0.25,
      default: 0,
      hint: 'Carves a line inside each star, the way a painted zellij panel is scored: off, or two depths.',
    },
  ],
  directional: false,
  seeded: false,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const nx = ctx.repeatsX
    const ny = ctx.repeatsY
    const mmPerCell = Math.min(cellMmX(ctx), cellMmY(ctx))
    const groutMm = ctx.params.groove / 2
    const bevelMm = Math.max(ctx.params.bevel, MIN_SOFT_MM)
    // A straight chamfer prints evenly spaced lines; the short fillet lays it onto the face without a crease.
    const bevelFillet = Math.min(0.2, bevelMm / 4)
    const crossHeight = ctx.params.crossHeight
    // Star points reach the cell edge midpoints at this radius, so crosses fill the gaps exactly.
    const starRadius = 0.5 / SQRT3 + 0.0648
    const starMm = starRadius * mmPerCell
    // The score: straight flanks into a 0.6 mm flat floor, the narrowest groove a 0.4 mm nozzle leaves clean,
    // kept behind a flat land clear of the chamfer. One shallower than two layers at the default depth prints
    // as a stray contour or not at all, and a star too small to hold it with a face inside goes unscored.
    const inciseFlank = Math.min(0.9, 0.05 * mmPerCell)
    const inciseHalf = 0.3 + inciseFlank
    const inciseAt = Math.max(0.45 * starMm, groutMm + bevelMm + 0.6 + inciseHalf)
    const room = inciseAt + inciseHalf + 1 <= starMm
    const incise = ctx.params.incise < 0.05 || !room ? 0 : Math.max(ctx.params.incise, 0.25)
    return (u, v) => {
      const lx = fract(u * nx) - 0.5
      const ly = fract(v * ny) - 0.5
      const ax = Math.abs(lx)
      const ay = Math.abs(ly)
      // Union of a square and a square turned 45°: the eight-point star. Both terms have unit gradient, so
      // the field is a distance and reads straight in millimetres.
      const fieldMm = (starRadius - Math.min(Math.max(ax, ay), (ax + ay) / Math.SQRT2)) * mmPerCell
      let h: number
      if (fieldMm > 0) {
        h = shoulder(fieldMm - groutMm, bevelMm, bevelFillet)
        if (incise > 0) h -= incise * clamp01(1 - (Math.abs(fieldMm - inciseAt) - 0.3) / inciseFlank)
      } else {
        h = crossHeight * shoulder(-fieldMm - groutMm, bevelMm, bevelFillet)
      }
      return clamp01(h)
    }
  },
}
