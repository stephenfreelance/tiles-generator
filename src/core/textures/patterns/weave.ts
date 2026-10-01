// T-16 basketweave and T-21 knit: two woven surfaces. Basketweave alternates block direction, so
// the registry gives it an even repeat count on both axes.

import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { cellMmX, cellMmY, clamp01, fract, intAtLeast1, MIN_SOFT_MM, mix, smax } from './common'

export const basketweave: TextureDef = {
  id: 'basketweave',
  mark: 'T-16',
  name: 'Basketweave',
  category: 'geometric',
  blurb: 'Groups of flat-topped slats turning a quarter-turn each block, each tucking under the next.',
  defaults: { depth: 2, scale: 30 },
  scaleRange: [12, 80],
  depthRange: [1, 3],
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
      default: 0.4,
      hint: 'How far each slat bends down at its ends, where it tucks under the next block.',
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
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.4,
      hint: 'Low is a flat strap with crisp edges, high a strap with broad rounded edges; the top always stays flat.',
    },
  ],
  directional: false,
  seeded: false,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const nx = ctx.repeatsX
    const ny = ctx.repeatsY
    const slats = intAtLeast1(ctx.params.slats)
    const dip = clamp01(ctx.params.dip)
    const round = clamp01(ctx.params.roundness)
    const mmX = cellMmX(ctx)
    const mmY = cellMmY(ctx)
    // Every slat is flat on top (a plateau prints as one clean skin) and steep at its sides and ends, so
    // nothing prints as the flat disc ringed by steps that a gently rounded top turns into.
    const across = (blockMm: number) => sideProfile(blockMm / slats / 2, round)
    const along = (blockMm: number) => endProfile(blockMm / 2, ctx.params.joint / 2, dip, round)
    const sideX = across(mmX)
    const sideY = across(mmY)
    const endX = along(mmX)
    const endY = along(mmY)
    return (u, v) => {
      const s = u * nx
      const t = v * ny
      const i = Math.floor(s)
      const j = Math.floor(t)
      const lx = s - i
      const ly = t - j
      // The (i + j) parity is why this pattern needs an even number of blocks per period.
      const horizontal = ((i + j) & 1) === 0
      const alongF = horizontal ? lx : ly
      const acrossF = horizontal ? ly : lx
      const side = horizontal ? sideY : sideX
      const end = horizontal ? endX : endY
      const cross = fract(slats * acrossF)
      const c = side.at(Math.min(cross, 1 - cross) * side.slatMm)
      if (c <= 0) return 0
      return clamp01(c * end.at(Math.min(alongF, 1 - alongF) * end.blockMm))
    }
  },
}

/** A hinge (0, then a slope of 1 from k) with its corner rounded over 2f: the kink box-filtered, so it is C1. */
function hinge(x: number, k: number, f: number): number {
  if (x <= k - f) return 0
  if (x >= k + f) return x - k
  const t = x - k + f
  return (t * t) / (4 * f)
}

/**
 * 0 up to a, a straight rise to 1 at b, the foot rounded over 2 f0 and the shoulder over 2 f1. Exactly 0
 * and exactly 1 beyond the fillets, which is what leaves a true flat for the printer. Needs f0 + f1 <= b - a.
 */
function ramp(x: number, a: number, b: number, f0: number, f1: number): number {
  if (x <= a - f0) return 0
  if (x >= b + f1) return 1
  return (hinge(x, a, f0) - hinge(x, b, f1)) / (b - a)
}

interface SideProfile {
  /** A slat's width, mm; the profile is read at the distance from its nearer long edge. */
  slatMm: number
  at(dMm: number): number
}

/**
 * Across a slat: a steep straight flank from the groove between two slats to a flat top. Roundness widens
 * the flank and, more, the shoulder, so a cord reads round while its shoulder lies flatter than a printer
 * can step cleanly for about a third of a millimetre at most; the flat between the shoulders stays exact.
 */
function sideProfile(halfMm: number, round: number): SideProfile {
  // The three widths scale together, which keeps the fillets from overlapping (foot + shoulder <= flank at
  // every roundness), and a narrow slat keeps two fifths of its top flat rather than meeting in a crown.
  const fit = Math.min(1, (0.6 * halfMm) / (MIN_SOFT_MM + mix(0.6, 1.8, round) + mix(0.3, 1.2, round)))
  const foot = MIN_SOFT_MM * fit
  const flank = mix(0.6, 1.8, round) * fit
  const shoulder = mix(0.3, 1.2, round) * fit
  return { slatMm: 2 * halfMm, at: (d) => ramp(d, foot, foot + flank, foot, shoulder) }
}

interface EndProfile {
  /** A block's length, mm; the profile is read at the distance from its nearer end. */
  blockMm: number
  at(eMm: number): number
}

/**
 * Along a slat: the block groove, a steep end wall up to the tucked height, then a short straight tuck up to
 * the flat top. The tuck's length follows the dip, so its slope is the same at every dip (the depth over 4.5 mm),
 * steep enough at every depth the texture offers that its steps stay narrow instead of printing wide stripes.
 */
function endProfile(halfMm: number, jointHalfMm: number, dip: number, round: number): EndProfile {
  const joint = Math.min(Math.max(jointHalfMm, 0), 0.3 * halfMm)
  // Groove, wall and tuck take at most three fifths of half the block, so every slat keeps a long flat top.
  const want = MIN_SOFT_MM + mix(0.6, 1.2, round) + dip * TUCK_MM_PER_DIP + MIN_SOFT_MM
  const fit = Math.min(1, (0.6 * halfMm - joint) / want)
  const foot = MIN_SOFT_MM * fit
  const wall = mix(0.6, 1.2, round) * fit
  const tuck = dip * TUCK_MM_PER_DIP * fit
  const w0 = joint + foot
  const w1 = w0 + wall
  if (tuck <= 0) return { blockMm: 2 * halfMm, at: (e) => ramp(e, w0, w1, foot, foot) }
  // The knee between wall and tuck is rounded on both sides; halving it on a short tuck keeps both ramps monotonic.
  const knee = Math.min(foot, tuck / 2)
  return {
    blockMm: 2 * halfMm,
    at: (e) => (1 - dip) * ramp(e, w0, w1, foot, knee) + dip * ramp(e, w1, w1 + tuck, knee, knee),
  }
}

/** Millimetres of tuck per unit of dip: the tuck falls at about 24 degrees at the default 2 mm depth, 12 at 1 mm. */
const TUCK_MM_PER_DIP = 4.5

export const knit: TextureDef = {
  id: 'knit',
  mark: 'T-21',
  name: 'Chunky knit',
  category: 'geometric',
  blurb: 'Rows of plump stitches, each a pair of twisted plies leaning into its neighbour.',
  defaults: { depth: 2.6, scale: 16 },
  scaleRange: [6, 45],
  // A leg is nearly 8 mm wide at the default size: with less than 2 mm of relief its top lies flatter than a
  // printer can step cleanly.
  depthRange: [2, 4],
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
      default: 0.25,
      hint: 'Grooves winding round each leg, the twist of a spun yarn.',
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
    const cellX = cellMmX(ctx)
    const cellY = cellMmY(ctx)
    // A leg is an oval KNIT_RX by KNIT_RY of a cell, leaning by the angle in cell units. Measured in millimetres:
    // its two semi-axes and the direction of the long one.
    const ax = KNIT_RX * plump * Math.cos(angle) * cellX
    const ay = KNIT_RX * plump * Math.sin(angle) * cellY
    const bx = -KNIT_RY * plump * Math.sin(angle) * cellX
    const by = KNIT_RY * plump * Math.cos(angle) * cellY
    const mean = (ax * ax + bx * bx + ay * ay + by * by) / 2
    const dev = Math.hypot((ax * ax + bx * bx - ay * ay - by * by) / 2, ax * ay + bx * by)
    const half = Math.sqrt(mean + dev)
    const across = Math.sqrt(Math.max(mean - dev, 1e-6))
    const theta = 0.5 * Math.atan2(2 * (ax * ay + bx * by), ax * ax + bx * bx - ay * ay - by * by)
    const ux = Math.sin(theta) < 0 ? -Math.cos(theta) : Math.cos(theta)
    const uy = Math.abs(Math.sin(theta))
    // Its crest is a level ridge along the middle of its length, flat on top for a millimetre across, and each
    // end tapers from there over at most KNIT_TIP_MM, so a long leg still falls steeply enough to its tip.
    const spine = Math.max(KNIT_SPINE * half, half - KNIT_TIP_MM)
    const tip = half - spine
    const n0 = KNIT_CREST_MM / across
    const span = 1 - n0
    const soft = KNIT_SOFT_MM / across
    // How fast the yarn falls away from its crest, across the leg and toward its ends: as a share of the depth
    // per millimetre, so a bigger stitch keeps a top steep enough to print as fine steps.
    const kAcross = Math.min(Math.max(KNIT_CREST_RISE * span * across, KNIT_CREST_SLOPE), 0.9)
    const kAlong = Math.min(Math.max(KNIT_CREST_RISE * span * tip, KNIT_CREST_SLOPE), 0.9)
    const pitch = Math.min(Math.max((2 * half) / KNIT_PLIES, 2 * (KNIT_SOFT_MM + KNIT_GROOVE_MM) + 0.4), KNIT_PLY_MM)
    const fold = Math.min(KNIT_SOFT_MM / cellX, 0.2)
    const twist = Math.tan((KNIT_TWIST * Math.PI) / 180)
    return (u, v) => {
      // A stitch is one left leg and its mirror image, so the field is read at the distance from the stitch's
      // centre line, folded once more at the cell edge: the legs meet along the folds in creases rounded over
      // MIN_SOFT_MM, and no leg's tip crosses its partner to stick out below the V.
      const q = 0.5 - softAbs(0.5 - softAbs(fract(u * nx) - 0.5, fold), fold)
      const px = (KNIT_LEG_X - q) * cellX
      const fy = fract(v * ny)
      // The plies fade to their mean depth near a crease, where two legs merge into one gentle saddle that a
      // groove would cut into islands.
      const plyFade = ramp(Math.min(q, 0.5 - q) * cellX, KNIT_SOFT_MM, KNIT_PLY_FADE_MM, KNIT_SOFT_MM, KNIT_SOFT_MM)
      let best = 0
      for (let row = -1; row <= 1; row++) {
        const py = (fy - 0.5 - row) * cellY
        const s = px * ux + py * uy
        const w = px * uy - py * ux
        const e = Math.max(Math.abs(s) - spine, 0) / tip
        const n = Math.hypot(e, w / across)
        // The cross-section: a straight fall from the crest (k), a body that rounds over like a yarn (a cube)
        // and a rim that drops nearly sheer to the floor (a high power), so the leg is plump to its outline
        // but its top never flattens into a dome.
        const along = n > 0 ? (e * e) / (n * n) : 0
        const k = kAcross + (kAlong - kAcross) * along
        const body = KNIT_BODY * (1 - k)
        const sheer = 1 - k - body
        const x = (n - n0) / span
        const xc = Math.min(Math.max(x, 0), 1)
        let h = 1 - (k * hinge(n, n0, soft)) / span - body * xc * xc * xc - sheer * Math.pow(xc, KNIT_RIM)
        const rim = k + 3 * body + KNIT_RIM * sheer
        if (x > 1) h -= (x - 1) * (rim - k)
        const foot = (KNIT_SOFT_MM / (across + (tip - across) * along)) * (rim / span)
        if (h <= -foot) continue
        let lobe = hinge(h, 0, foot)
        if (ply > 0 && lobe > 0) {
          // Plies as a twisted ridge and groove of even slope, cut in proportion to the yarn's height so they
          // fade into its rim: sharp-crested, so where one crosses the top it leaves a speck, not a disc.
          const t = fract((s + w * twist) / pitch + 0.5)
          const dg = Math.min(t, 1 - t) * pitch
          const groove = ramp(dg, KNIT_SOFT_MM, pitch / 2 - KNIT_GROOVE_MM, KNIT_SOFT_MM, KNIT_GROOVE_MM)
          lobe *= 1 - ply * (plyFade * groove + (1 - plyFade) * 0.5)
        }
        // Two rows' legs that overlap meet in a rounded crease; the blend dies away before the floor, never lifting it.
        const seam = KNIT_SEAM * Math.min(1, Math.min(lobe, best) / KNIT_SEAM)
        best = seam > 0 ? smax(best, lobe, seam) : Math.max(best, lobe)
      }
      return clamp01(best)
    }
  },
}

/** |x| with its kink rounded over 2e (a parabola there), so a fold of the field is a soft crease. */
function softAbs(x: number, e: number): number {
  const m = Math.abs(x)
  return m >= e ? m : (x * x) / (2 * e) + e / 2
}

/** A knit leg's centre, as a share of the cell width left of the stitch's centre line. */
const KNIT_LEG_X = 0.22
/** A leg's oval in cell units: half its width and half its length. */
const KNIT_RX = 0.26
const KNIT_RY = 0.62
/** Half of every rounding on a leg (crest, foot, folds, ply crests), mm: each edge spans MIN_SOFT_MM. */
const KNIT_SOFT_MM = MIN_SOFT_MM / 2
/** Share of a leg's half-length its crest runs level, and the longest taper from there to its tip, mm. */
const KNIT_SPINE = 0.18
const KNIT_TIP_MM = 7
/** Half-width of the flat ribbon along the crest, mm: an exact flat prints as one skin, not as a disc. */
const KNIT_CREST_MM = 0.5
/**
 * Share of a leg's fall taken at the crest's own even slope (at least KNIT_CREST_SLOPE), and the least that slope
 * may be, as a share of the depth per mm: 0.13 is 0.34 mm per mm (19 degrees) at the default depth.
 */
const KNIT_CREST_SLOPE = 0.5
const KNIT_CREST_RISE = 0.13
/** How much of the rest of the fall rounds the body, and the power of the sheer rim that takes the remainder. */
const KNIT_BODY = 0.5
const KNIT_RIM = 12
/** Plies per leg, and their longest pitch, mm: a longer one leaves a wide top on every ply. */
const KNIT_PLIES = 6
const KNIT_PLY_MM = 3.2
/** Slant of the plies across the leg, degrees; rounding of a groove's bottom, mm. */
const KNIT_TWIST = 15
const KNIT_GROOVE_MM = 0.4
/** Distance from a crease over which the plies fade in, mm. */
const KNIT_PLY_FADE_MM = 1.6
/** Blend of the crease where two rows' legs overlap, as a share of the depth. */
const KNIT_SEAM = 0.08
