// T-05 herringbone and chevron: the two parquet rhythms. Both are built on integer lattices, which
// is what lets a zigzag cross a tile joint without a visible break.

import { hashCell, wrap } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { clamp01, fract, intAtLeast1, mix, smoothstep, tri } from './common'

const SQRT2 = Math.SQRT2

export const herringbone: TextureDef = {
  id: 'herringbone',
  mark: 'T-05',
  name: 'Herringbone',
  category: 'essential',
  blurb: 'Interlocking bricks that zigzag across the wall, the classic parquet move.',
  defaults: { depth: 1.6, scale: 34 },
  scaleRange: [12, 90],
  depthRange: [0.8, 3.5],
  params: [
    {
      key: 'ratio',
      label: 'Brick length',
      min: 2,
      max: 5,
      step: 1,
      default: 3,
      hint: 'Length of each brick in brick widths. 2 is stocky, 4 is elegant.',
    },
    {
      key: 'diagonal',
      label: 'Diagonal lay',
      min: 0,
      max: 1,
      step: 1,
      default: 1,
      hint: 'On: the classic 45° zigzag. Off: bricks square to the tile edges.',
    },
    {
      key: 'joint',
      label: 'Joint width',
      min: 0.6,
      max: 3,
      step: 0.1,
      default: 1.2,
      unit: 'mm',
      hint: 'Groove between bricks; 0.6 mm is the narrowest a 0.4 mm nozzle prints cleanly.',
    },
    {
      key: 'pillow',
      label: 'Pillowing',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.35,
      hint: 'Crowns each brick like a worn, hand-laid floor.',
    },
  ],
  directional: true,
  seeded: true,
  cellAspect: 3,
  create(ctx: TextureContext): PatternSampler {
    const k = intAtLeast1(ctx.params.ratio)
    const diagonal = ctx.params.diagonal >= 0.5
    const [w, h] = ctx.periodMm
    // The brick map is a similarity only when nx / w equals k * ny / h (diagonal) or ny / h
    // (straight): deriving ny from the wanted brick width and snapping nx to it keeps bricks
    // rectangular and k long, instead of shearing them by whatever the two roundings disagree by.
    const targetMm = w / ctx.repeatsX
    const ny = Math.max(1, Math.round(h / ((diagonal ? SQRT2 : 2) * k * targetMm)))
    const nx = Math.max(1, Math.round(((diagonal ? k : 1) * ny * w) / h))
    // One brick width in mm, which is what the joint and bevel widths are measured against.
    const brickMm = diagonal ? w / (SQRT2 * nx) : w / (2 * k * nx)
    const jointHalf = Math.min(ctx.params.joint / 2 / brickMm, 0.25)
    const bevel = Math.min(Math.max(0.3 / brickMm, 0.06), 0.3)
    const pillow = ctx.params.pillow
    const seed = ctx.seed
    // Wrapping moduli for the brick id: along the lattice generators (1,1) and (-k,k) in diagonal
    // mode, along the plain 2k square in straight mode.
    const modA = diagonal ? 2 * nx : 2 * k * nx
    const modB = diagonal ? 2 * k * ny : 2 * k * ny
    const twoK = 2 * k

    return (u, v) => {
      let x: number
      let y: number
      if (diagonal) {
        const a = nx * u
        const b = k * ny * v
        x = a - b
        y = a + b
      } else {
        x = twoK * nx * u
        y = twoK * ny * v
      }
      let along: number
      let cross: number
      let idX: number
      let idY: number
      const q = Math.floor(y)
      const av = wrap(x - q, twoK)
      if (av < k) {
        along = av
        cross = y - q
        idX = Math.round(x - av)
        idY = q
      } else {
        const c = Math.floor(x)
        const bv = wrap(y - c - 1, twoK)
        along = bv
        cross = x - c
        idX = c
        idY = Math.round(y - bv)
      }
      const edge = Math.min(Math.min(along, k - along), Math.min(cross, 1 - cross))
      const base = smoothstep(jointHalf, jointHalf + bevel, edge)
      if (base <= 0) return 0
      const hashed = diagonal
        ? hashCell(wrap(idX + idY, modA), wrap(idX - idY, modB), seed)
        : hashCell(wrap(idX, modA), wrap(idY, modB), seed)
      const shade = 0.86 + 0.14 * (hashed / 4294967296)
      const crown = 0.82 + 0.18 * Math.sin(Math.PI * clamp01(cross))
      return clamp01(base * shade * mix(1, crown, pillow))
    }
  },
}

export const chevron: TextureDef = {
  id: 'chevron',
  mark: 'T-14',
  name: 'Chevron',
  category: 'geometric',
  blurb: 'Slats cut on the angle and meeting point to point, a continuous arrow up the wall.',
  defaults: { depth: 1.6, scale: 18 },
  scaleRange: [6, 50],
  depthRange: [0.8, 3],
  params: [
    {
      key: 'vWidth',
      label: 'V width',
      min: 2,
      max: 8,
      step: 1,
      default: 4,
      hint: 'Width of each V in slat pitches: small is busy, large is architectural.',
    },
    {
      key: 'angle',
      label: 'Cut angle',
      min: 30,
      max: 60,
      step: 1,
      default: 45,
      unit: '°',
      hint: 'Angle of the slat ends; 45° is the classic chevron.',
    },
    {
      key: 'joint',
      label: 'Joint width',
      min: 0.6,
      max: 3,
      step: 0.1,
      default: 1,
      unit: 'mm',
      hint: 'Groove between slats, cut to the base plate.',
    },
    {
      key: 'crown',
      label: 'Crown',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.3,
      hint: 'Rounds each slat across its width so light rolls along the zigzag.',
    },
  ],
  directional: true,
  seeded: false,
  cellAspect: 1,
  create(ctx: TextureContext): PatternSampler {
    const ny = ctx.repeatsY
    const columns = intAtLeast1(ctx.repeatsX / intAtLeast1(ctx.params.vWidth))
    const [w, h] = ctx.periodMm
    const slatMm = h / ny
    const halfColumnMm = w / (2 * columns)
    // Phase shift over one half column, in slats: this is what sets the real cut angle.
    const shift = (halfColumnMm * Math.tan((ctx.params.angle * Math.PI) / 180)) / slatMm
    const jointHalf = ctx.params.joint / 2
    const bevelMm = 0.35
    const crown = ctx.params.crown
    return (u, v) => {
      const phase = ny * v + shift * tri(columns * u)
      const f = fract(phase)
      const alongMm = Math.min(f, 1 - f) * slatMm
      const ffx = fract(2 * columns * u)
      const acrossMm = Math.min(ffx, 1 - ffx) * halfColumnMm
      const edge = Math.min(alongMm, acrossMm)
      const base = smoothstep(jointHalf, jointHalf + bevelMm, edge)
      if (base <= 0 || crown <= 0) return base
      return base * mix(1, 0.8 + 0.2 * Math.sin(Math.PI * f), crown)
    }
  },
}
