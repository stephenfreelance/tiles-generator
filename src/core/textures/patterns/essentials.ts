// T-01 plane, T-02 wavy, T-03 stripes: the three textures the studio opens with.

import { valueFbm2 } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { cellMmX, clamp, fract, intAtLeast1, mix, smin, softEdge, TAU, usefulOctaves } from './common'

export const plane: TextureDef = {
  id: 'plane',
  mark: 'T-01',
  name: 'Plane',
  category: 'essential',
  blurb: 'A flat tile: colour and joint pattern do the work, with an optional faint stone grain.',
  defaults: { depth: 0.3, scale: 6 },
  scaleRange: [3, 30],
  depthRange: [0, 1.2],
  params: [
    {
      key: 'micro',
      label: 'Stone grain',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0,
      hint: 'Leave at 0 for a smooth face; printed face up, grain comes out as faint contour lines, not a soft texture.',
    },
  ],
  directional: false,
  seeded: true,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const micro = ctx.params.micro
    if (micro <= 0) return () => 0
    const { repeatsX, repeatsY, seed } = ctx
    // Drop the octaves whose wavelength the nozzle could not lay down anyway.
    const octaves = usefulOctaves(cellMmX(ctx), 3)
    return (u, v) => micro * valueFbm2(u * repeatsX, v * repeatsY, repeatsX, repeatsY, octaves, seed)
  },
}

// Wavy is laid out across each ridge in millimetres, for the printer: a face-up print lays every slope
// down as stairs one layer tall, so a slope gentler than about 11 degrees (at 0.2 mm layers) prints as
// wide flat treads, and a cosine's broad crest and trough are exactly that: a flat stripe ringed by
// lines along every crest and hollow. Here the flanks carry the relief at a printable slope, the crest
// and the hollow round over only a millimetre or two, and a valley floor, when there is one, is exactly
// flat, so it prints as one clean skin.

/** The relief Wavy is designed at: its bulge is sized so the flanks stay printable at this depth. */
const WAVY_DEPTH = 2.6
/**
 * Share of each crest-to-hollow run left as an exactly flat floor at the crisp end of Crest shape. The
 * flanks take the rest, so a wider floor also steepens them: at 2.6 mm on 22 mm they average about 14
 * degrees with no floor and 26 at the crisp end.
 */
const WAVY_FLOOR_MAX = 0.5
/**
 * Half width (mm) of the rounding over each crest and each hollow at the soft end. The rounding is the
 * one place a flank eases through the slopes that print as wide treads, so it stays narrow: the crest
 * prints as a top tread about 2 mm wide at most, not as a flat stripe ringed by steps.
 */
const WAVY_SOFT_MM = 1.2
/** Half width of the crest rounding at the crisp end: a ridge line, still wider than MIN_SOFT_MM. */
const WAVY_CROWN_CRISP_MM = 0.4
/** The foot where a flank meets the flat floor stays a touch softer than the crest. */
const WAVY_FOOT_CRISP_MM = 0.9
/**
 * Slope (rise over run) the ends of a flank keep at WAVY_DEPTH: 15 degrees, whose steps at 0.2 mm
 * layers are 0.75 mm wide, still one ramp to the eye.
 */
const WAVY_END_SLOPE = 0.27
/** At most, the middle of a flank runs this much steeper than its ends. */
const WAVY_BULGE_MAX = 1

interface RidgeShape {
  /** Share of the crest-to-hollow run that is flat floor. */
  floor: number
  crownMm: number
  footMm: number
  /** How much steeper the middle of the flank runs than its ends (0 is one straight slope). */
  bulge: number
}

/** Shrinks the crown and the foot smoothly on a ridge too tight to hold both, so they never cross. */
const filletScale = (endMm: number, shape: RidgeShape): number =>
  smin((0.8 * endMm) / (shape.crownMm + shape.footMm), 1, 0.3)

/**
 * Height (1 on the crest, 0 on the floor) at `x` mm from the crest, on a run of `halfMm` to the hollow.
 * The slope rises linearly from 0 over the crown, swells gently through the middle of the flank (by
 * `bulge`, a half sine, so the shading reads as a wave) and falls linearly to 0 over the foot, so the
 * relief is C1 everywhere and reaches exactly 1 and exactly 0. Past the flank the floor is exactly flat.
 */
function ridgeProfile(x: number, halfMm: number, shape: RidgeShape): number {
  const end = halfMm * (1 - shape.floor)
  if (x >= end) return 0
  const scale = filletScale(end, shape)
  const crown = shape.crownMm * scale
  const foot = shape.footMm * scale
  const run = end - crown - foot
  const swell = (shape.bulge * run) / Math.PI
  // Area under the slope profile: the whole drop from crest to floor, which normalises it to 1.
  const drop = 0.5 * (crown + foot) + run + 2 * swell
  let fall: number
  if (x <= crown) fall = (x * x) / (2 * crown)
  else if (x <= end - foot) {
    const y = x - crown
    fall = 0.5 * crown + y + swell * (1 - Math.cos((Math.PI * y) / run))
  } else fall = drop - ((end - x) * (end - x)) / (2 * foot)
  return 1 - fall / drop
}

/**
 * The ridge shape for one design. The bulge is spent only where the ridge has slope to spare: it is
 * sized on the nominal ridge so the ends of each flank still hold WAVY_END_SLOPE at WAVY_DEPTH, which
 * leaves a wide, shallow ridge (large feature size, no floor) one straight slope.
 */
function ridgeShape(crest: number, halfMm: number): RidgeShape {
  const shape: RidgeShape = {
    floor: WAVY_FLOOR_MAX * crest,
    crownMm: mix(WAVY_SOFT_MM, WAVY_CROWN_CRISP_MM, crest),
    footMm: mix(WAVY_SOFT_MM, WAVY_FOOT_CRISP_MM, crest),
    bulge: 0,
  }
  const end = halfMm * (1 - shape.floor)
  const scale = filletScale(end, shape)
  const crown = shape.crownMm * scale
  const foot = shape.footMm * scale
  const run = end - crown - foot
  // drop / WAVY_DEPTH is the run over which the ends' slope is WAVY_END_SLOPE: solve for the bulge.
  const spare = (WAVY_DEPTH / WAVY_END_SLOPE - 0.5 * (crown + foot)) / run - 1
  shape.bulge = clamp((spare * Math.PI) / 2, 0, WAVY_BULGE_MAX)
  return shape
}

export const wavy: TextureDef = {
  id: 'wavy',
  mark: 'T-02',
  name: 'Wavy',
  category: 'essential',
  blurb: 'Undulating ridges that drift across the wall like a slow swell; the house default.',
  defaults: { depth: WAVY_DEPTH, scale: 22 },
  scaleRange: [8, 60],
  // Shallower than this, at its default feature size, a quarter or more of it prints as stair steps wider than 1 mm.
  depthRange: [1.6, 6],
  params: [
    {
      key: 'waves',
      label: 'Waves per tile',
      min: 1,
      max: 5,
      step: 1,
      default: 2,
      hint: 'How many times the ridges swing back and forth across one tile.',
    },
    {
      key: 'sway',
      label: 'Sway',
      min: 0,
      max: 1.4,
      step: 0.05,
      default: 0.55,
      hint: 'Sideways travel of each ridge, in ridge widths. 0 is a straight corduroy.',
    },
    {
      key: 'cross',
      label: 'Cross swell',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.25,
      hint: 'A second, diagonal wave that breaks the rhythm into an egg-crate.',
    },
    {
      key: 'crest',
      label: 'Crest shape',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.35,
      hint: 'From softly rounded ridges with no valley floor (0) to crisp ridges over wide, flat valleys (1).',
    },
  ],
  directional: true,
  seeded: false,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const ridges = ctx.repeatsY
    const waves = intAtLeast1(ctx.params.waves)
    const sway = ctx.params.sway
    const cross = ctx.params.cross * 0.4
    const [widthMm, heightMm] = ctx.periodMm
    const shape = ridgeShape(ctx.params.crest, (0.5 * heightMm) / ridges)
    const swayRate = (sway * TAU * waves) / widthMm
    const crossRateX = (cross * TAU * 2 * waves) / widthMm
    const crossRateY = (cross * TAU) / heightMm
    const ridgeRate = ridges / heightMm
    return (u, v) => {
      const a = TAU * waves * u
      const b = TAU * (2 * waves * u + v)
      const cb = Math.cos(b)
      const phase = v * ridges + sway * Math.sin(a) + cross * Math.sin(b)
      // Sway and swell squeeze and spread the ridges, so the profile is laid out in the millimetres
      // of the ridge it is on (1 / the phase gradient), not of the nominal one: every crown and foot
      // keeps its printed width wherever the ridge swings.
      const gx = swayRate * Math.cos(a) + crossRateX * cb
      const gy = ridgeRate + crossRateY * cb
      const halfMm = 0.5 / Math.max(Math.hypot(gx, gy), 1e-6)
      // 0 on a crest, 1 in the hollow halfway to the next.
      const t = 2 * Math.abs(fract(phase + 0.5) - 0.5)
      return ridgeProfile(t * halfMm, halfMm, shape)
    }
  },
}

/** Share of the flat top a full crown rounds into the shoulders: the middle 40 % always stays flat. */
const STRIPES_SHOULDER_SHARE = 0.6
/** Widest shoulder, mm: at the default 1.2 mm relief it still falls at 25 degrees or more on average. */
const STRIPES_SHOULDER_MM = 2.5

export const stripes: TextureDef = {
  id: 'stripes',
  mark: 'T-03',
  name: 'Stripes',
  category: 'essential',
  blurb: 'Raised bands at any snapped angle: from a fine pinstripe to a bold ribbon.',
  defaults: { depth: 1.2, scale: 14 },
  scaleRange: [4, 60],
  depthRange: [0.4, 3],
  params: [
    {
      key: 'angle',
      label: 'Angle',
      min: 0,
      max: 90,
      step: 5,
      default: 0,
      unit: '°',
      hint: 'Snapped to the nearest angle that still meets the neighbouring tile.',
    },
    {
      key: 'duty',
      label: 'Band width',
      min: 0.15,
      max: 0.85,
      step: 0.05,
      default: 0.45,
      hint: 'Share of each pitch that is raised. Low values give a pinstripe.',
    },
    {
      key: 'edge',
      label: 'Edge softness',
      min: 0,
      max: 0.35,
      step: 0.01,
      default: 0.08,
      hint: 'Chamfer on the band walls; always at least 0.3 mm so the wall prints cleanly.',
    },
    {
      key: 'crown',
      label: 'Crown',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.15,
      hint: 'Rounds the shoulders of each band into its walls; the middle of the top stays flat.',
    },
  ],
  directional: true,
  seeded: false,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const theta = (ctx.params.angle * Math.PI) / 180
    // An integer wave vector is what keeps a diagonal stripe seamless (the angle snaps, by design).
    let i = Math.round(ctx.repeatsX * Math.cos(theta))
    const j = Math.round(ctx.repeatsY * Math.sin(theta))
    if (i === 0 && j === 0) i = 1
    const [w, h] = ctx.periodMm
    // Millimetres per unit of phase: the wavelength of the chosen wave vector.
    const fx = i / w
    const fy = j / h
    const mmPerPhase = 1 / Math.hypot(fx, fy)
    const duty = ctx.params.duty
    const edge = Math.min(softEdge(ctx.params.edge, mmPerPhase), duty * 0.49, (1 - duty) * 0.49)
    // Centring the band in its pitch puts the tile joint in the middle of a flat valley, where the
    // physical gap between two tiles disappears into the groove instead of splitting a band.
    const half = duty * 0.5
    // A domed top is a gentle curve, which prints as a flat stripe ringed by stray lines, so the crown
    // rounds each shoulder into its wall instead: the top stays exactly flat (one clean skin) and the
    // shoulder stays short enough to be steep.
    const shoulder =
      ctx.params.crown * Math.min(STRIPES_SHOULDER_SHARE * (half - edge), STRIPES_SHOULDER_MM / mmPerPhase)
    // The wall's slope rises linearly over the lower half of the edge and falls back to 0 over the upper
    // half plus the shoulder: C1 from the valley floor to the flat top, steepest at or below half height.
    const foot = edge / 2
    const upper = edge / 2 + shoulder
    const steep = 2 / (foot + upper)
    return (u, v) => {
      const s = half - Math.abs(fract(i * u + j * v) - 0.5)
      if (s <= 0) return 0
      if (s >= foot + upper) return 1
      if (s <= foot) return (steep * s * s) / (2 * foot)
      const r = foot + upper - s
      return 1 - (steep * r * r) / (2 * upper)
    }
  },
}
