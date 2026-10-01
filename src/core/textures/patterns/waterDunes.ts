// T-09 ocean water and T-10 topographic map: the two "moving surface" textures. The sea is laid out in
// millimetres for a face-up print. A printer lays a relief down in flat layers, so a slope gentler than
// about 11 degrees (at 0.2 mm layers) prints as wide flat treads ringed by lines, and the soft top of a
// swell as a flat disc. So the sea is long swells with a narrow crest, straight faces and exactly flat
// troughs, and the other wave trains bend the crests and score the faces.
//
// The topographic map is the one relief kept gentle on purpose. It is a warped ridge phase with a long
// windward slope, a sharp brink and a soft lee face, and printed in layers those long slopes draw
// themselves as the contour lines of a survey map, which is the look makers print it for.
import { mulberry32, value2, valueFbm2 } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { clamp, clamp01, fract, intAtLeast1, mix, smin, smoothstep, TAU } from './common'

/** Wavenumber span of the spectrum: the shortest train is this many times the dominant swell. */
const SPECTRUM_SPAN = 3.2
/** Golden ratio, used to spread a handful of wave directions evenly instead of at random. */
const GOLDEN = 0.6180339887498949

/** The relief the sea is designed at: every slope below is sized so the faces print evenly at this depth. */
const OCEAN_DEPTH = 2.6
/** Slope (rise over run) of a swell's face, from the softest crest shape to the sharpest: 19 to 26 degrees. */
const SWELL_SLOPE_SOFT = 0.34
const SWELL_SLOPE_SHARP = 0.48
/** Rounding over a swell's crest, mm, soft to sharp: the top tread it prints stays a narrow line. */
const CREST_SOFT_MM = 1.4
const CREST_SHARP_MM = 0.45
/** Rounding where a face meets the flat trough, mm. */
const TROUGH_MM = 0.8
/**
 * Most the bends may change the crest spacing, as a share of the swell's own wavenumber, so a crest never
 * folds back on itself.
 */
const BEND = 0.35
/** Most of the half spacing a face may take, so the trough between two crowded crests still reaches the floor. */
const CROWD = 0.9
/**
 * Height of the chop at full Chop, as a share of the relief, shared out over its trains. A gate fades the
 * chop out towards each crest and trough, and at this height it keeps every face between the two.
 */
const CHOP_HEIGHT = 0.28
/**
 * Steepest the chop may get, as a share of the swell face's own slope, where every train lines up. A
 * cusped wave is that steep only at its crest and the trains rarely line up, so the face stays a slope.
 */
const CHOP_SHARE = 1.5
/** Steepest any one chop train may be, as a share of the face's slope: a lone train has nothing to cancel it. */
const CHOP_TRAIN_MAX = 0.55
/** Half width of the rounding over each chop crest, mm. */
const CHOP_ROUND_MM = 0.3

/** Ridge of height 1 at x = 0 falling at m per mm to 0, its two bends rounded over `crown` and `foot` mm. */
function ridge(x: number, m: number, crown: number, foot: number): number {
  const reach = 1 / m
  const c = Math.min(crown, reach)
  const f = Math.min(foot, reach)
  const run = reach - (c + f) / 2
  const end = c + run + f
  if (x >= end) return 0
  if (x <= c) return 1 - (m * x * x) / (2 * c)
  if (x <= c + run) return 1 - m * (x - c / 2)
  const r = end - x
  return (m * r * r) / (2 * f)
}

export const oceanWater: TextureDef = {
  id: 'ocean-water',
  mark: 'T-09',
  name: 'Ocean water',
  category: 'organic',
  blurb: 'Open sea: long swells with sharp crests and flat troughs, bent by crossing waves and scored by wind chop.',
  defaults: { depth: OCEAN_DEPTH, scale: 22 },
  scaleRange: [12, 80],
  // Shallower than this, at its default feature size, a quarter or more of it prints as stair steps wider than 1 mm.
  depthRange: [1.6, 3.5],
  params: [
    {
      key: 'trains',
      label: 'Wave trains',
      min: 3,
      max: 14,
      step: 1,
      default: 8,
      hint: 'How many wave trains make up the sea. Few reads as clean swell, many as a busy surface.',
    },
    {
      key: 'spread',
      label: 'Direction spread',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.45,
      hint: '0 keeps every crossing wave in line with the swell; 1 bends its crests and scores its faces from many directions.',
    },
    {
      key: 'chop',
      label: 'Chop',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.7,
      hint: 'Short waves scored across the faces of the swells: 0 is glassy groundswell, 1 a wind-torn surface.',
    },
    {
      key: 'sharp',
      label: 'Crest shape',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.55,
      hint: 'Draws the crests to a point and broadens the flat troughs, the way real water stands up.',
    },
  ],
  directional: true,
  seeded: true,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const { repeatsX, repeatsY, seed } = ctx
    const [widthMm, heightMm] = ctx.periodMm
    const count = intAtLeast1(ctx.params.trains)
    const spread = ctx.params.spread
    const rnd = mulberry32(seed * 2654435761 + 17)
    const iv = new Int32Array(count)
    const jv = new Int32Array(count)
    // Wavenumbers, cycles per mm.
    const kx = new Float64Array(count)
    const ky = new Float64Array(count)
    const phase = new Float64Array(count)
    const amp = new Float64Array(count)
    const isChop = new Uint8Array(count)
    // Hold the dominant swell well off both tile axes: a swell running square to an edge reads as
    // banding, and it is the one direction the whole surface is organised around.
    const facing = rnd() < 0.5 ? 1 : -1
    const baseAngle = (facing * (20 + 50 * rnd()) * Math.PI) / 180
    let bendSlope = 0
    let chopSum = 0
    for (let k = 0; k < count; k++) {
      const band = count > 1 ? k / (count - 1) : 0
      const multiple = Math.pow(SPECTRUM_SPAN, band)
      // The long swells hold the dominant direction; only the short waves fan out around it.
      const fan = spread * (0.25 + 0.75 * band) * 0.55 * Math.PI
      // A golden-ratio sequence spreads a handful of directions evenly over the fan; drawn at
      // random, a few of them clump, and a clump of parallel trains is a stripe.
      const angle = baseAngle + fan * (2 * (((k + 1) * GOLDEN) % 1) - 1)
      // Integer wave vectors are what keep every train periodic over the tile.
      let i = Math.round(repeatsX * multiple * Math.cos(angle))
      let j = Math.round(repeatsY * multiple * Math.sin(angle))
      if (i === 0) i = 1
      if (j === 0) j = Math.sin(angle) >= 0 ? 1 : -1
      iv[k] = i
      jv[k] = j
      kx[k] = i / widthMm
      ky[k] = j / heightMm
      phase[k] = rnd()
      // Each train's weight, in the bends and in the chop alike: the longer the wave, the more it counts.
      amp[k] = (0.85 + 0.3 * rnd()) / multiple
      isChop[k] = multiple > 2 ? 1 : 0
      if (isChop[k]) chopSum += amp[k]
      else if (k > 0) bendSlope += amp[k] * Math.hypot(kx[k], ky[k])
    }
    const sharp = ctx.params.sharp
    const crown = mix(CREST_SOFT_MM, CREST_SHARP_MM, sharp)
    const faceSlope = mix(SWELL_SLOPE_SOFT, SWELL_SLOPE_SHARP, sharp)
    // Run of a face from crest to trough, mm: the swell keeps it wherever there is room.
    const faceMm = OCEAN_DEPTH / faceSlope
    // The first train is the swell whose crests the sea is built on. The other long trains do not add
    // height, which would put soft tops and bowls wherever they meet: they bend its crests instead
    // (phase, in cycles), crowding and spreading them the way crossing swells group real waves.
    const bend = new Float64Array(count)
    const bendScale = bendSlope > 0 ? (BEND * Math.hypot(kx[0], ky[0])) / bendSlope : 0
    // The short trains are the chop, cusped like the swell (a sharp crest, a broad trough). Chop sets
    // their height; their slope is then held under the face's own, so the chop scores a face without
    // levelling a patch of it into a tread or a little dish.
    const chopAmp = new Float64Array(count)
    const chopRound = new Float64Array(count)
    const chop = ctx.params.chop
    let chopSlope = 0
    for (let k = 1; k < count; k++) {
      const wavenumber = Math.hypot(kx[k], ky[k])
      if (isChop[k]) {
        chopAmp[k] = (chop * CHOP_HEIGHT * amp[k]) / chopSum
        // The cusp below is steepest at its crest: its amplitude times the wavenumber in radians.
        const slope = chopAmp[k] * TAU * wavenumber * OCEAN_DEPTH
        const most = chop * CHOP_TRAIN_MAX * faceSlope
        if (slope > most) chopAmp[k] *= most / slope
        chopSlope += Math.min(slope, most)
        const round = Math.PI * wavenumber * CHOP_ROUND_MM
        chopRound[k] = round * round
      } else bend[k] = (bendScale * amp[k]) / TAU
    }
    if (chopSlope > chop * CHOP_SHARE * faceSlope) {
      for (let k = 1; k < count; k++) chopAmp[k] *= (chop * CHOP_SHARE * faceSlope) / chopSlope
    }
    // A slow meander over the whole sea, far coarser than the swell, so the crests wander rather than crinkle.
    const warpX = Math.max(2, Math.round(repeatsX / 2))
    const warpY = Math.max(2, Math.round(repeatsY / 2))
    const ax = 0.15 / warpX
    const ay = 0.15 / warpY
    const meanderU = (u: number, v: number): number => value2(u * warpX, v * warpY, warpX, warpY, seed + 51) - 0.5
    const meanderV = (u: number, v: number): number => value2(u * warpX, v * warpY, warpX, warpY, seed + 97) - 0.5
    const step = 1e-3
    return (u, v) => {
      const mu = meanderU(u, v)
      const mv = meanderV(u, v)
      // Jacobian of the meander, so every length below is measured in real millimetres.
      const uu = 1 + (ax * (meanderU(u + step, v) - mu)) / step
      const uv = (ax * (meanderU(u, v + step) - mu)) / step
      const vu = (ay * (meanderV(u + step, v) - mv)) / step
      const vv = 1 + (ay * (meanderV(u, v + step) - mv)) / step
      const wu = u + ax * mu
      const wv = v + ay * mv
      let crestPhase = iv[0] * wu + jv[0] * wv + phase[0]
      let gx = kx[0]
      let gy = ky[0]
      let scored = 0
      for (let k = 1; k < count; k++) {
        const a = TAU * (iv[k] * wu + jv[k] * wv + phase[k])
        const c = Math.cos(a)
        // 1 - 2|sin(a / 2)| with its point rounded off, less its mean so the chop rides at zero.
        if (isChop[k]) scored += chopAmp[k] * (4 / Math.PI - 2 * Math.sqrt(0.5 * (1 - c) + chopRound[k]))
        else {
          crestPhase += bend[k] * Math.sin(a)
          gx += TAU * bend[k] * c * kx[k]
          gy += TAU * bend[k] * c * ky[k]
        }
      }
      const g = Math.max(
        Math.hypot(gx * uu + gy * vu * (heightMm / widthMm), gx * uv * (widthMm / heightMm) + gy * vv),
        1e-9,
      )
      // Distance from the nearest crest, mm.
      const d = Math.abs(fract(crestPhase + 0.5) - 0.5) / g
      // Where the bends crowd two crests together the swell shortens and steepens, so the trough
      // between them still reaches the floor: one that stopped short would print as a dish. A soft
      // minimum, since a hard one would crease every face where the crowding begins.
      const room = Math.max((CROWD * 0.5) / g - (crown + TROUGH_MM) / 2, 0.5)
      const reach = faceMm * Math.pow(1 + Math.pow(faceMm / room, 6), -1 / 6)
      const swell = ridge(d, 1 / reach, crown, TROUGH_MM)
      if (scored === 0 || swell <= 0 || swell >= 1) return swell
      // The chop rides only the straight part of each face: the crest stays one level line and the
      // trough one flat skin, and a face is steep enough that the chop never levels a patch of it.
      const c = Math.min(crown, reach)
      const t = (d - c) / Math.max(reach - (c + Math.min(TROUGH_MM, reach)) / 2, 1e-6)
      if (t <= 0 || t >= 1) return swell
      return clamp01(swell + Math.sin(Math.PI * t) * scored)
    }
  },
}

/** Rounding applied to the brink, in millimetres, so the nozzle can lay the crest down. */
const RIDGE_MM = 1
/** Wind ripples sit about this far apart on the windward slope. */
const RIPPLE_MM = 2.6

// Shown as Topographic map since real prints read that way. Its id stays 'dune-wave': saved designs and share
// links carry it.
export const duneWave: TextureDef = {
  id: 'dune-wave',
  mark: 'T-10',
  name: 'Topographic map',
  category: 'organic',
  blurb: 'Meandering crests with long rippled slopes and sharp brinks: printed in layers, every slope draws contour lines like a survey map.',
  defaults: { depth: 2.4, scale: 18 },
  scaleRange: [8, 60],
  depthRange: [0.8, 4],
  params: [
    {
      key: 'brink',
      label: 'Brink',
      min: 0.5,
      max: 0.85,
      step: 0.01,
      default: 0.72,
      hint: 'Where the crest sits between two troughs. Higher gives a longer windward slope and a shorter lee.',
    },
    {
      key: 'wander',
      label: 'Crest wander',
      min: 0,
      max: 2,
      step: 0.05,
      default: 0.9,
      hint: 'How far the crests meander, merge and die out instead of running straight across.',
    },
    {
      key: 'ripples',
      label: 'Wind ripples',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.5,
      hint: 'Fine ripples the wind leaves on the windward slope, parallel to the crests.',
    },
    {
      key: 'variation',
      label: 'Crest variation',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.5,
      hint: 'Lets some crests stand taller than others, the way a real dune field never repeats.',
    },
  ],
  directional: true,
  seeded: true,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const { repeatsX, repeatsY, seed } = ctx
    const brink = clamp(ctx.params.brink, 0.5, 0.9)
    const wander = ctx.params.wander
    const variation = ctx.params.variation
    const crestMm = ctx.periodMm[1] / repeatsY
    // Windward slope long and slightly dished, lee face short and steep: that asymmetry is the
    // whole read of a dune field, and the two exponents are what make the brink an edge.
    const windPow = 1.35
    const leePow = 1.7
    const slopeSum = windPow / brink + leePow / (1 - brink)
    const ridge = clamp((RIDGE_MM * slopeSum) / (2 * Math.max(crestMm, 1)), 0.03, 0.3)
    // The wander has to be far coarser than the crest spacing, or the crests crinkle into foil
    // instead of running the length of the wall. Every period here is an integer, so it wraps.
    const warpX = Math.max(2, Math.round(repeatsX / 4))
    const warpY = Math.max(2, Math.round(repeatsY / 4))
    const midX = Math.max(2, Math.round(repeatsX / 2))
    const midY = Math.max(2, Math.round(repeatsY / 2))
    const varX = Math.max(2, Math.round(repeatsX / 2))
    const varY = Math.max(2, repeatsY)
    // An integer multiple of the crest phase, so the ripples wrap wherever the crests do.
    const rippleCount = Math.max(2, Math.round(crestMm / RIPPLE_MM))
    const rippleAmp = ctx.params.ripples * 0.07
    return (u, v) => {
      let phase = v * repeatsY
      if (wander > 0) {
        // Two scales of meander: the coarse one moves whole crests, the mid one ends and splits them.
        const coarse = valueFbm2(u * warpX, v * warpY, warpX, warpY, 2, seed) - 0.5
        const mid = valueFbm2(u * midX, v * midY, midX, midY, 1, seed + 131) - 0.5
        phase += wander * (2.4 * coarse + 0.7 * mid)
      }
      const f = fract(phase)
      // Both ramps reach exactly 1 at the brink, so their smooth minimum is the dune profile and
      // the trough returns to a true zero the neighbouring tile can meet.
      const wind = Math.pow(f / brink, windPow)
      const lee = Math.pow((1 - f) / (1 - brink), leePow)
      let h = clamp01(smin(wind, lee, ridge))
      if (rippleAmp > 0) {
        // Only the windward slope carries ripples: the lee is a slip face, smooth by definition.
        const stoss = smoothstep(0, 0.22, f) * (1 - smoothstep(brink - 0.28, brink, f))
        if (stoss > 0) h -= rippleAmp * stoss * (0.5 + 0.5 * Math.cos(TAU * rippleCount * phase))
      }
      if (variation > 0) {
        const mod = valueFbm2(u * varX, v * varY, varX, varY, 2, seed + 404)
        h *= 1 - variation * 0.45 * (1 - mod)
      }
      return clamp01(h)
    }
  },
}
