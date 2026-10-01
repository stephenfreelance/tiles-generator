// T-07 zellige: hand-cut Moroccan clay. Wobbly grout lines, and edges rolled down into the grout by a hand
// that never pressed two pieces alike, so raking light catches every piece differently.
//
// The face of each piece is exactly flat. A face that undulated or tilted by a fraction of a millimetre looked
// glazed in the render and printed as one stray contour line wandering across the piece, since a face-up print
// can only hold whole layers; the life of the piece lives in its edge and its height instead. That edge is a
// roll a few millimetres wide at one even slope, eased in at both ends: a narrow, steep roll shaded as a crack
// beside the grout, and a gently curved one printed as wide treads.

import { hashCell, perlin2, wrap } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { cellMmX, cellMmY, clamp, clamp01, mix } from './common'

/** The most a piece sinks below its neighbours at full lift, as a share of the relief. */
const MAX_SINK = 0.38
/**
 * Gentlest slope a roll is sized for at the default depth: 18 degrees, which the swell of the roll eases to
 * no less than 15 where it widens across itself, so its steps stay well under a millimetre.
 */
const ROLL_SLOPE = 0.32
/** Convex fillet that rounds each roll over onto its face, mm: the soft top edge a glaze leaves. */
const TOP_FILLET = 1
/** Concave fillet that eases each roll onto the grout floor, mm, so the foot reads as a hollow, not a cut. */
const FOOT_FILLET = 0.7

/**
 * Height across a roll `d` mm out from its foot, 0 to 1: one even slope over `run`, eased onto the grout
 * floor and onto the face by the two fillets, which give way on a run too short to hold them.
 */
function roll(d: number, run: number): number {
  if (d <= 0) return 0
  if (d >= run) return 1
  const a = Math.min(FOOT_FILLET, run / 3)
  const b = Math.min(TOP_FILLET, run / 3)
  const k = 1 / (run - (a + b) / 2)
  if (d < a) return (k * d * d) / (2 * a)
  const t = run - d
  if (t < b) return 1 - (k * t * t) / (2 * b)
  return k * (d - a / 2)
}

/** Widest roll whose even part keeps `slope` over a rise of `riseMm`. */
const rollLimit = (riseMm: number, slope: number): number => riseMm / slope + (FOOT_FILLET + TOP_FILLET) / 2

export const zellige: TextureDef = {
  id: 'zellige',
  mark: 'T-07',
  name: 'Zellige',
  category: 'essential',
  blurb: 'Hand-cut clay squares: wobbly edges rolled into the grout, every piece at its own height.',
  defaults: { depth: 1.6, scale: 50 },
  scaleRange: [20, 150],
  // Under 1 mm of relief a roll this wide prints as treads over a millimetre wide.
  depthRange: [1, 2.5],
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
      label: 'Uneven roll',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.55,
      hint: 'How much the rolled edge of each piece swells and narrows, so every piece catches the light its own way.',
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
    const mm = Math.min(mmX, mmY)
    const wobble = ctx.params.wobble * 0.1
    const undulation = ctx.params.undulation
    const lift = ctx.params.lift
    const groutHalfMm = Math.min(ctx.params.grout / 2, 0.2 * mm)
    // Every roll is a few millimetres wide: the narrowest one still reads as a soft edge, never as a crack,
    // and the widest stays steep enough to print as fine lines (see the per-piece limit below).
    const rollLo = clamp(0.064 * mm, 1.6, 3.2)
    const rollHi = clamp(0.11 * mm, rollLo + 0.8, 5.5)
    // Wobble and swell frequencies are multiples of the grid, so both repeat with the tile.
    const wx = gx * 3
    const wy = gy * 3
    // Each grout line wanders along its own length only. Warping the whole plane stretched the distance
    // across a line too, which squeezed some rolls into slits and spread others into treads.
    const lineX = (k: number, v: number): number =>
      wobble > 0 ? k + wobble * perlin2(v * wy, 0.5, wy, 2, seed + 11 + 977 * wrap(k, gx)) : k
    const lineY = (k: number, u: number): number =>
      wobble > 0 ? k + wobble * perlin2(u * wx, 0.5, wx, 2, seed + 29 + 977 * wrap(k, gy)) : k

    return (u, v) => {
      const s = u * gx
      const t = v * gy
      // The column and row are found against the wandering lines, never against the straight grid.
      let ix = Math.floor(s)
      let left = lineX(ix, v)
      let right: number
      if (s < left) {
        right = left
        ix--
        left = lineX(ix, v)
      } else {
        right = lineX(ix + 1, v)
        if (s >= right) {
          ix++
          left = right
          right = lineX(ix + 1, v)
        }
      }
      let iy = Math.floor(t)
      let bottom = lineY(iy, u)
      let top: number
      if (t < bottom) {
        top = bottom
        iy--
        bottom = lineY(iy, u)
      } else {
        top = lineY(iy + 1, u)
        if (t >= top) {
          iy++
          bottom = top
          top = lineY(iy + 1, u)
        }
      }
      const dx = Math.min(s - left, right - s) * mmX
      const dy = Math.min(t - bottom, top - t) * mmY
      const d = Math.min(dx, dy) - groutHalfMm
      if (d <= 0) return 0
      const h = hashCell(wrap(ix, gx), wrap(iy, gy), seed)
      // Each piece sits flat at its own height, up to MAX_SINK below the proudest.
      const level = 1 - (lift * MAX_SINK * ((h >>> 16) & 0xff)) / 255
      if (d >= rollHi) return level
      // A lower piece has less to roll down, so its widest roll is narrower: the slope holds, not the width.
      const hi = Math.max(rollLo, Math.min(rollHi, rollLimit(zellige.defaults.depth * level, ROLL_SLOPE)))
      let q = 0.5
      if (undulation > 0) {
        // The roll swells and narrows along every edge, each piece to its own noise and its own mean.
        const bias = (((h >>> 8) & 0xff) / 255 - 0.5) * 0.7
        q = clamp01(0.5 + undulation * (bias + 1.5 * perlin2(u * wx, v * wy, wx, wy, seed + 53 + (h & 0xfff))))
      }
      return level * roll(d, mix(rollLo, hi, q))
    }
  },
}
