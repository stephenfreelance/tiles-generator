// T-05 herringbone and chevron: the two parquet rhythms. Both are built on integer lattices, which
// is what lets a zigzag cross a tile joint without a visible break.

import { hashCell, wrap } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { clamp01, fract, intAtLeast1, MIN_SOFT_MM, shoulder, SHOULDER_SLOPE, shoulderRunLimit, tri } from './common'

const SQRT2 = Math.SQRT2
/** The lowest a herringbone brick sits, as a share of the relief. */
const LOWEST_BRICK = 0.86

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
      hint: 'Rolls the edges of each brick down into the joint like a worn, hand-laid floor; the face stays flat.',
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
    const jointHalfMm = Math.min(ctx.params.joint / 2, 0.25 * brickMm)
    // Pillowing widens the edge and rounds it: a sine crown across a flat brick was a tenth of a millimetre,
    // under one layer, and printed as a stray line along the brick. The face now stays exactly flat.
    const pillow = ctx.params.pillow
    const ratio = 1 + pillow
    const fillet = 0.5
    const rollCap = shoulderRunLimit(herringbone.defaults.depth * LOWEST_BRICK, SHOULDER_SLOPE, fillet, ratio)
    const rollMm = Math.max(Math.min((0.06 + 0.14 * pillow) * brickMm, rollCap, 0.3 * brickMm), MIN_SOFT_MM)
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
      const edgeMm = Math.min(Math.min(along, k - along), Math.min(cross, 1 - cross)) * brickMm
      const base = shoulder(edgeMm - jointHalfMm, rollMm, fillet, ratio)
      if (base <= 0) return 0
      const hashed = diagonal
        ? hashCell(wrap(idX + idY, modA), wrap(idX - idY, modB), seed)
        : hashCell(wrap(idX, modA), wrap(idY, modB), seed)
      // Each brick sits at its own height, a flat face for the printer however far it stands proud.
      const shade = LOWEST_BRICK + (1 - LOWEST_BRICK) * (hashed / 4294967296)
      return clamp01(base * shade)
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
      hint: 'Rolls the long edges of each slat down into the joint so light runs along the zigzag; the face stays flat.',
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
    const angle = (ctx.params.angle * Math.PI) / 180
    // Phase shift over one half column, in slats: this is what sets the real cut angle.
    const shift = (halfColumnMm * Math.tan(angle)) / slatMm
    // The slats lie tilted by the cut angle, so a step in phase is cos(angle) as wide at right angles to them:
    // measured straight up, a 0.6 mm joint at 60 degrees was a 0.3 mm slot no nozzle can cut.
    const widthMm = slatMm * Math.cos(angle)
    const jointHalf = Math.min(ctx.params.joint / 2, 0.25 * widthMm)
    const bevelMm = 0.35
    // The crown widens and rounds the long edges: a sine across a flat slat was a tenth of a millimetre, under a
    // layer, and printed as a stray line down the slat.
    const crown = ctx.params.crown
    const ratio = 1 + crown
    const fillet = 0.5
    const rollCap = shoulderRunLimit(chevron.defaults.depth, SHOULDER_SLOPE, fillet, ratio)
    const rollMm = Math.max(Math.min(bevelMm + crown * 0.25 * widthMm, rollCap), bevelMm)
    return (u, v) => {
      const phase = ny * v + shift * tri(columns * u)
      const f = fract(phase)
      const alongMm = Math.min(f, 1 - f) * widthMm
      const ffx = fract(2 * columns * u)
      const acrossMm = Math.min(ffx, 1 - ffx) * halfColumnMm
      const side = shoulder(alongMm - jointHalf, rollMm, Math.min(fillet, rollMm / 3), ratio)
      if (side <= 0) return 0
      return Math.min(side, shoulder(acrossMm - jointHalf, bevelMm, 0))
    }
  },
}
