// T-09 ocean water and T-10 dune wave: the two "moving surface" textures. The sea is a directional
// wave spectrum (long swells carry the energy, chop rides over them); the dune field is a warped
// ridge phase with a long windward slope, a sharp brink and a soft lee face.

import { mulberry32, value2, valueFbm2 } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { clamp, clamp01, fract, intAtLeast1, smin, smoothstep, TAU } from './common'

/** Wavenumber span of the spectrum: the shortest train is this many times the dominant swell. */
const SPECTRUM_SPAN = 3.2
/** Golden ratio, used to spread a handful of wave directions evenly instead of at random. */
const GOLDEN = 0.6180339887498949

export const oceanWater: TextureDef = {
  id: 'ocean-water',
  mark: 'T-09',
  name: 'Ocean water',
  category: 'organic',
  blurb: 'Open sea: long swells running one way, with shorter waves and wind chop riding over them.',
  defaults: { depth: 2.6, scale: 30 },
  scaleRange: [12, 80],
  depthRange: [0.8, 3.5],
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
      hint: '0 runs every train down the same line; 1 is a confused sea with no clear direction.',
    },
    {
      key: 'chop',
      label: 'Chop',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.55,
      hint: 'Weight of the short waves over the swell: 0 is glassy groundswell, 1 a wind-torn surface.',
    },
    {
      key: 'sharp',
      label: 'Crest shape',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.55,
      hint: 'Draws the crests to a point and broadens the troughs, the way real water stands up.',
    },
  ],
  directional: true,
  seeded: true,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const { repeatsX, repeatsY, seed } = ctx
    const count = intAtLeast1(ctx.params.trains)
    const spread = ctx.params.spread
    const chop = ctx.params.chop
    const rnd = mulberry32(seed * 2654435761 + 17)
    const iv = new Int32Array(count)
    const jv = new Int32Array(count)
    const phase = new Float64Array(count)
    const amp = new Float64Array(count)
    const isChop = new Uint8Array(count)
    let ampSq = 0
    // Hold the dominant swell well off both tile axes: a swell running square to an edge reads as
    // banding, and it is the one direction the whole surface is organised around.
    const facing = rnd() < 0.5 ? 1 : -1
    const baseAngle = (facing * (20 + 50 * rnd()) * Math.PI) / 180
    // Under raking light the eye reads SLOPE, not height, and slope is amplitude times wavenumber.
    // Tune the trains by amplitude alone and the shortest waves carry the most slope, burying the
    // swell under an even mottle. So amplitude falls as 1/k, giving every wavelength a comparable
    // slope the way a real wind sea does, and chop tilts that balance short or long.
    const falloff = 1.35 - 0.5 * chop
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
      phase[k] = rnd() * TAU
      amp[k] = Math.pow(multiple, -falloff) * (0.85 + 0.3 * rnd())
      isChop[k] = multiple > 2 ? 1 : 0
      ampSq += amp[k] * amp[k]
    }
    // Random phases almost never line up, so normalising by the worst case would leave the relief
    // at a fraction of the depth asked for, and a shallow sea reads as a flat tile however well its
    // waves are shaped. Map about two sigma of the real sum onto the range instead.
    const norm = 1 / (2 * Math.sqrt(ampSq / 2))
    const stokes = ctx.params.sharp * 0.5
    // Dividing by the gain at the crest keeps the peak at full depth instead of clipping it flat.
    const stokesNorm = 1 / (1 + stokes * (1 - 0.34))
    // Cat's paws: patches where the chop stands up, and patches left glassy.
    const gustX = Math.max(2, Math.round(repeatsX / 2))
    const gustY = Math.max(2, Math.round(repeatsY / 2))
    return (u, v) => {
      let swell = 0
      let ripple = 0
      for (let k = 0; k < count; k++) {
        const w = amp[k] * Math.cos(TAU * (iv[k] * u + jv[k] * v) + phase[k])
        if (isChop[k]) ripple += w
        else swell += w
      }
      const gust = 0.45 + 1.15 * value2(u * gustX, v * gustY, gustX, gustY, seed + 811)
      const e = clamp((swell + ripple * gust) * norm, -1, 1)
      // Stokes: the crest draws to a point and the trough broadens out, which is what sells water.
      // Subtracting the mean square keeps the surface centred instead of sinking to the base plate.
      const z = (e + stokes * (e * e - 0.34)) * stokesNorm
      return clamp01(0.5 + 0.5 * z)
    }
  },
}

/** Rounding applied to the brink, in millimetres, so the nozzle can lay the crest down. */
const RIDGE_MM = 1
/** Wind ripples sit about this far apart on the windward slope. */
const RIPPLE_MM = 2.6

export const duneWave: TextureDef = {
  id: 'dune-wave',
  mark: 'T-10',
  name: 'Dune wave',
  category: 'organic',
  blurb: 'Long wind-blown dune crests: a slow rippled windward slope, a sharp brink, a soft lee face.',
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
