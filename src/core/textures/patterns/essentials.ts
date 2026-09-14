// T-01 plane, T-02 wavy, T-03 stripes: the three textures the studio opens with.

import { valueFbm2 } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { cellMmX, clamp01, fract, intAtLeast1, mix, smoothstep, softEdge, TAU, usefulOctaves } from './common'

export const plane: TextureDef = {
  id: 'plane',
  mark: 'T-01',
  name: 'Plane',
  category: 'essential',
  blurb: 'A flat tile: colour and joint pattern do the work, with an optional whisper of stone grain.',
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
      hint: 'Leave at 0 for a perfectly smooth face; a little grain hides layer lines.',
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

export const wavy: TextureDef = {
  id: 'wavy',
  mark: 'T-02',
  name: 'Wavy',
  category: 'essential',
  blurb: 'Undulating ridges that drift across the wall like a slow swell; the house default.',
  defaults: { depth: 2.6, scale: 22 },
  scaleRange: [8, 60],
  depthRange: [0.8, 6],
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
      hint: 'From soft dunes (0) to crisp ridges with wide flat valleys (1).',
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
    // Crest shaping is a power on the cosine; keep the exponent mild so slopes stay printable.
    const power = mix(1, 2.2, ctx.params.crest)
    return (u, v) => {
      const phase =
        v * ridges + sway * Math.sin(TAU * waves * u) + cross * Math.sin(TAU * (2 * waves * u + v))
      const c = 0.5 + 0.5 * Math.cos(TAU * phase)
      return power === 1 ? c : Math.pow(c, power)
    }
  },
}

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
      hint: 'Rounds the top of each band instead of leaving it flat.',
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
    const crown = ctx.params.crown
    // Centring the band in its pitch puts the tile joint in the middle of a flat valley, where the
    // physical gap between two tiles disappears into the groove instead of splitting a band.
    const half = duty * 0.5
    return (u, v) => {
      const d = Math.abs(fract(i * u + j * v) - 0.5)
      const band = smoothstep(half, half - edge, d)
      if (crown <= 0 || band <= 0) return band
      // The crown is a quarter cosine over the band, so the top rounds without lifting the valleys.
      const inside = clamp01((half - d) / Math.max(half - edge, 1e-6))
      return band * mix(1, 0.72 + 0.28 * Math.sin((Math.PI / 2) * inside), crown)
    }
  },
}
