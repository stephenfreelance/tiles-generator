// T-15 honeycomb, T-20 tumbling blocks and T-22 dots: everything built on the pointy-top hex
// lattice, whose period is exactly (1, sqrt3) in pattern space, so integer repeats tile the tile.
//
// Printed face up, a relief comes out in flat layers, so every shape here is built from exact flats
// (one clean skin) and even slopes steep enough that their steps read as one ramp, joined by fillets
// sized in millimetres. A gentle curve standing in for a flat, like the top of a dome, prints as a flat
// disc ringed by steps, so none is used.

import { hashCell, wrap } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { cellMmX, cellMmY, clamp, clamp01, fract, mix, MIN_SOFT_MM, smin, smoothstep, SQRT3 } from './common'

const HALF_SQRT3 = SQRT3 / 2

interface HexLocal {
  /** Vector from the nearest hex centre, in pattern units (x: 1 per column, y: stretched). */
  gx: number
  gy: number
  /** Wrapped centre index plus the sub-lattice branch, enough to hash one hex. */
  ix: number
  iy: number
  branch: number
}

const makeHex = (): HexLocal => ({ gx: 0, gy: 0, ix: 0, iy: 0, branch: 0 })

/** Nearest hex centre of the two interleaved rectangular sub-lattices. */
function hexLocal(s: number, t: number, out: HexLocal): void {
  const py = t * SQRT3
  const ax = fract(s) - 0.5
  const ayCell = Math.floor(py / SQRT3)
  const ay = py - ayCell * SQRT3 - HALF_SQRT3
  const bxCell = Math.floor(s - 0.5)
  const bx = s - 0.5 - bxCell - 0.5
  const byCell = Math.floor((py - HALF_SQRT3) / SQRT3)
  const by = py - HALF_SQRT3 - byCell * SQRT3 - HALF_SQRT3
  if (ax * ax + ay * ay < bx * bx + by * by) {
    out.gx = ax
    out.gy = ay
    out.ix = Math.floor(s)
    out.iy = ayCell
    out.branch = 0
  } else {
    out.gx = bx
    out.gy = by
    out.ix = bxCell
    out.iy = byCell
    out.branch = 1
  }
}

/** 0 at the hex centre, 0.5 at the edge midpoints (the apothem is 0.5 pattern units). */
const hexDist = (gx: number, gy: number): number =>
  Math.max(Math.abs(gx), 0.5 * Math.abs(gx) + HALF_SQRT3 * Math.abs(gy))

/** Millimetres per pattern unit along y, where one unit is one lattice spacing (the lattice rows are sqrt3 / 2 apart). */
const cellMmLattice = (ctx: TextureContext): number => cellMmY(ctx) / SQRT3

/**
 * An even slope with rounded ends: 0 up to e = 0, 1 from e = run on, a straight flank between. The foot
 * and the shoulder are quadratic fillets of the given half-widths, so the slope eases from flat to the
 * flank's over a few tenths of a millimetre instead of rolling over a wide curve that would print as
 * rings. All lengths share one unit; the fillets are shrunk together when the run is too short for both.
 */
function roundedRamp(e: number, run: number, foot: number, shoulder: number): number {
  if (e <= 0) return 0
  if (e >= run) return 1
  const room = run / (2 * (foot + shoulder))
  const f = room < 1 ? foot * room : foot
  const s = room < 1 ? shoulder * room : shoulder
  const k = 1 / (run - f - s)
  if (e < 2 * f) return (k * e * e) / (4 * f)
  const q = run - e
  if (q < 2 * s) return 1 - (k * q * q) / (4 * s)
  return k * (e - f)
}

/** Fillet half-width at the foot and shoulder of a honeycomb flank, mm. */
const HONEY_FILLET_MM = 0.5
/**
 * Widest sloped edge (bevel, open-cell wall or dome shoulder), mm: about 17 degrees at the default depth. Much
 * wider and a print shows it as wide stripes, so a large bevel on large cells stops growing here.
 */
const HONEY_SLOPE_MM = 7
/** Widest pyramid that stays a plain pyramid, mm from foot to apex: about 11 degrees at the default depth. */
const PYRAMID_PLAIN_MM = 11
/** Tread width a stepped pyramid aims for, mm: wide enough to read as a designed terrace. */
const PYRAMID_TREAD_MM = 4.5
/** Most treads a stepped pyramid takes, so each riser stays two layers tall at the default depth. */
const PYRAMID_MAX_TREADS = 5
/** Width of a stepped pyramid's riser, mm: a short steep wall between two flat treads. */
const PYRAMID_RISER_MM = 0.8

export const honeycomb: TextureDef = {
  id: 'honeycomb',
  mark: 'T-15',
  name: 'Honeycomb',
  category: 'geometric',
  blurb: 'Hexagons: bevelled faces, pyramids, flat-crowned domes, or open cells with standing walls.',
  defaults: { depth: 2.2, scale: 40 },
  scaleRange: [10, 120],
  // Shallower than this, at its default feature size, a quarter or more of it prints as stair steps wider than 1 mm.
  depthRange: [1, 5],
  params: [
    {
      key: 'mode',
      label: 'Cell shape',
      min: 0,
      max: 3,
      step: 1,
      default: 0,
      hint: '0 bevelled face, 1 pyramid (stepped when large), 2 dome with a flat crown, 3 open cell with walls.',
    },
    {
      key: 'gap',
      label: 'Gap width',
      min: 0.6,
      max: 5,
      step: 0.1,
      default: 1.4,
      unit: 'mm',
      hint: 'Groove between hexagons, or the wall thickness in open-cell mode.',
    },
    {
      key: 'bevel',
      label: 'Bevel',
      min: 0.02,
      max: 0.35,
      step: 0.01,
      default: 0.14,
      hint: 'Width of the sloped edge of a bevelled face or an open cell, as a share of the hexagon, up to 7 mm.',
    },
    {
      key: 'variation',
      label: 'Height variation',
      min: 0,
      max: 0.4,
      step: 0.02,
      default: 0,
      hint: 'Lets individual hexagons sit lower, like hand-set mosaic.',
    },
  ],
  directional: false,
  seeded: true,
  cellAspect: SQRT3,
  create(ctx: TextureContext): PatternSampler {
    const { repeatsX, repeatsY, seed } = ctx
    const mode = Math.round(ctx.params.mode)
    const mmPerCell = cellMmX(ctx)
    const gap = Math.min(ctx.params.gap / 2 / mmPerCell, 0.3)
    const bevel = Math.min(Math.max(ctx.params.bevel, MIN_SOFT_MM / mmPerCell), HONEY_SLOPE_MM / mmPerCell)
    const variation = ctx.params.variation
    const wall = Math.min(ctx.params.gap / mmPerCell, 0.35)
    const fillet = HONEY_FILLET_MM / mmPerCell
    // Run from the groove to the centre, in mm; the pyramid and the dome are sized against it.
    const runMm = (0.5 - gap) * mmPerCell
    // A wider pyramid would be too shallow to print smooth at the usual depths, so it climbs in terraces
    // instead: flat treads (clean skins) and short steep risers, three at the least so it reads as a pyramid,
    // and few enough that no riser shrinks to a single layer, which would print as an uneven line.
    const treads =
      runMm <= PYRAMID_PLAIN_MM ? 1 : clamp(Math.round(runMm / PYRAMID_TREAD_MM), 3, PYRAMID_MAX_TREADS)
    const riser = Math.min(PYRAMID_RISER_MM, (runMm / treads) * 0.4) / mmPerCell
    const treadUnits = (0.5 - gap) / treads
    // The dome's shoulder: a convex roll from the groove up to an exactly flat crown.
    const shoulder = Math.min(runMm * 0.6, HONEY_SLOPE_MM) / mmPerCell
    const hex = makeHex()
    return (u, v) => {
      hexLocal(u * repeatsX, v * repeatsY, hex)
      const edge = 0.5 - hexDist(hex.gx, hex.gy)
      let h: number
      if (mode === 3) {
        h = 1 - roundedRamp(edge - wall, bevel, fillet, fillet)
      } else if (mode === 1) {
        const x = edge - gap
        if (treads <= 1) {
          h = roundedRamp(x, 0.5 - gap, fillet, 0)
        } else {
          const step = Math.min(Math.floor(x / treadUnits), treads - 1)
          h = x <= 0 ? 0 : (step + roundedRamp(x - step * treadUnits, riser, riser / 4, riser / 4)) / treads
        }
      } else if (mode === 2) {
        const x = edge - gap
        // A 1.5 power roll: steep at the foot, level exactly at the crown's edge, with the part too shallow
        // to print kept to about a millimetre next to the crown.
        const w = clamp01(1 - x / shoulder)
        h = x <= 0 ? 0 : (1 - w * Math.sqrt(w)) * smoothstep(0, 2 * fillet, x)
      } else {
        h = roundedRamp(edge - gap, bevel, fillet, fillet)
      }
      if (variation > 0 && mode !== 3) {
        const r = hashCell(wrap(hex.ix, repeatsX), wrap(hex.iy, repeatsY) * 2 + hex.branch, seed) / 4294967296
        h *= 1 - variation * r
      }
      return clamp01(h)
    }
  },
}

/** Width of the wall where a block's flat top stands over the sides of the blocks behind it, mm. */
const BLOCK_WALL_MM = 0.5
/** Inradius of the flat a triangular pyramid's apex is cut to, mm: large enough to print as a clean skin. */
const APEX_INRADIUS_MM = 0.9

export const tumblingBlocks: TextureDef = {
  id: 'tumbling-blocks',
  mark: 'T-20',
  name: 'Tumbling blocks',
  category: 'geometric',
  blurb: 'Stacked cubes in real relief: a flat top and two sloping sides, three tones, one optical illusion.',
  defaults: { depth: 3.6, scale: 24 },
  // A cube's sides are planes falling the full depth across half a block, so their slope is twice the depth over
  // the block: past 32 mm at the default depth, or under 2.4 mm at the default size, they print as wide stripes.
  scaleRange: [12, 32],
  depthRange: [2.4, 6],
  params: [
    {
      key: 'mode',
      label: 'Solid',
      min: 0,
      max: 1,
      step: 1,
      default: 0,
      hint: '0 stacked cubes, 1 a field of triangular pyramids with flat tips.',
    },
    {
      key: 'groove',
      label: 'Outline groove',
      min: 0,
      max: 3,
      step: 0.1,
      default: 0,
      unit: 'mm',
      hint: 'Cuts a groove around each block so the stack reads even in flat light.',
    },
    {
      key: 'chamfer',
      label: 'Edge softening',
      min: 0,
      max: 0.5,
      step: 0.02,
      default: 0.1,
      hint: 'Rounds the ridges between facets so the nozzle can follow them.',
    },
  ],
  directional: true,
  seeded: false,
  cellAspect: SQRT3,
  create(ctx: TextureContext): PatternSampler {
    const { repeatsX, repeatsY } = ctx
    const triangles = ctx.params.mode >= 0.5
    const mmPerCell = cellMmX(ctx)
    const groove = ctx.params.groove / 2 / mmPerCell
    const grooveSoft = Math.max(MIN_SOFT_MM / mmPerCell, 0.04)
    // Fillet width on the ridges, mm, turned into the smooth-min blend of two faces whose heights part at
    // 2 per pattern unit (the cube's faces, and the pyramids' facets measured in lattice lines).
    const filletMm = MIN_SOFT_MM + ctx.params.chamfer * 3
    const ridge = (2 * filletMm) / mmPerCell
    // Measured on the shorter axis: a tile rarely fits whole hexagons, and the wall runs mostly across the rows.
    const wallUnits = BLOCK_WALL_MM / Math.min(mmPerCell, cellMmLattice(ctx))
    // The pyramids' apex is cut to an exact flat, so it prints as one clean triangle and not a ringed cap.
    // It is measured down from the rounded apex the fillets leave, and widens with them, so softer ridges
    // never leave a dome at the top.
    const roundedApex = 3 * smin(smin(1 / 3, 1 / 3, ridge), 1 / 3, ridge)
    const flatMm = Math.min(APEX_INRADIUS_MM + filletMm, 0.08 * mmPerCell)
    const apex = roundedApex - (6 * flatMm) / (SQRT3 * mmPerCell)
    const hex = makeHex()
    return (u, v) => {
      const s = u * repeatsX
      const t = v * repeatsY
      if (triangles) {
        const qy = t * SQRT3
        const l1 = 2 * t
        const l2 = s + qy / SQRT3
        const l3 = -s + qy / SQRT3
        const d1 = 0.5 - Math.abs(fract(l1) - 0.5)
        const d2 = 0.5 - Math.abs(fract(l2) - 0.5)
        const d3 = 0.5 - Math.abs(fract(l3) - 0.5)
        const m = smin(smin(d1, d2, ridge), d3, ridge)
        return clamp01((3 * m) / apex)
      }
      hexLocal(s, t, hex)
      const { gx, gy } = hex
      // The hexagon's three rhombi are a cube's three visible faces. The top one is exactly flat; the
      // two below it fall away from its edges, towards the lower left and the lower right, at the
      // steepest slope a plane across the rhombus can take (the full depth over half a spacing).
      const toLeft = -0.5 * gx - HALF_SQRT3 * gy
      const toRight = 0.5 * gx - HALF_SQRT3 * gy
      const sides = smin(1 - 2 * toLeft, 1 - 2 * toRight, ridge)
      let h = smin(1, sides, ridge)
      // The top face's two upper edges stand over the foot of the blocks behind: a wall the full depth
      // tall, falling to 0 right on the joint, where the sides of the block behind start from 0 too.
      const toBack = 0.5 - Math.max(0.5 * gx + HALF_SQRT3 * gy, -0.5 * gx + HALF_SQRT3 * gy)
      h = smin(h, toBack / wallUnits, 0.5)
      if (groove > 0) {
        const edge = 0.5 - hexDist(gx, gy)
        h *= smoothstep(groove, groove + grooveSoft, edge)
      }
      return clamp01(h)
    }
  },
}

/** Jitter of a bubble's centre off its lattice point, as a share of the spacing. */
const BUBBLE_JITTER = 0.8
/** Fillet half-width at the foot of a dot, mm. */
const DOT_FOOT_MM = 0.3

/** The flank of a dot: its run and its two fillets, in mm, for one profile setting and dot radius. */
function dotFlank(softness: number, radiusMm: number): { run: number; foot: number; shoulder: number } {
  // Crisp: a millimetre of steep edge round a wide face. Soft: a longer even flank round a smaller face,
  // never longer than 3.5 mm, since a longer one would be too shallow to print smooth at the usual depths.
  // The shoulder stays narrow at both ends, so the face never grows a ring of wide steps round it.
  const run = Math.min(mix(0.9, 3.5, softness), dotRun(radiusMm, softness))
  return { run, foot: DOT_FOOT_MM, shoulder: mix(0.3, 0.6, softness) }
}

/**
 * Longest flank a dot of this radius takes, mm: a share of the radius, so even a small dot keeps a flat face
 * at least 40 % as wide, but never under the softest printable edge unless the dot is smaller still.
 */
const dotRun = (radiusMm: number, softness: number): number =>
  Math.min(radiusMm, Math.max(MIN_SOFT_MM, radiusMm * mix(0.3, 0.6, softness)))

/**
 * Nearest-neighbour distance of the dot lattice, mm. A tile rarely holds a whole number of perfect hexagons,
 * so the lattice is stretched a little on one axis, and any of its three neighbour directions may be the
 * shortest: the third is two rows up, which wins once the rows are squashed far enough.
 */
const dotSpacingMm = (mx: number, my: number): number =>
  Math.min(mx, Math.hypot(0.5 * mx, HALF_SQRT3 * my), SQRT3 * my)

export const dotsBubbles: TextureDef = {
  id: 'dots-bubbles',
  mark: 'T-22',
  name: 'Dots and bubbles',
  category: 'geometric',
  blurb: 'Flat-faced rounds with a smooth sloped edge, from a crisp penny-round grid to a drift of bubbles.',
  defaults: { depth: 2, scale: 14 },
  scaleRange: [4, 50],
  depthRange: [0.8, 4],
  params: [
    {
      key: 'radius',
      label: 'Dot size',
      min: 0.2,
      max: 0.5,
      step: 0.01,
      default: 0.44,
      hint: 'Radius as a share of the spacing; 0.5 has the dots touching.',
    },
    {
      key: 'profile',
      label: 'Profile',
      min: 0.3,
      max: 2,
      step: 0.05,
      default: 1,
      hint: 'Low is a crisp penny with a short steep edge, high a softer button with a smaller face and a long even slope.',
    },
    {
      key: 'random',
      label: 'Scatter',
      min: 0,
      max: 1,
      step: 1,
      default: 0,
      hint: 'On: bubbles of mixed sizes at random. Off: an even hex grid.',
    },
    {
      key: 'variation',
      label: 'Size variation',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.5,
      hint: 'Spread of bubble sizes when scatter is on; the smaller ones sit lower.',
    },
  ],
  directional: false,
  seeded: true,
  cellAspect: SQRT3,
  create(ctx: TextureContext): PatternSampler {
    const { repeatsX, repeatsY, seed } = ctx
    const radius = ctx.params.radius
    const softness = clamp01((ctx.params.profile - 0.3) / 1.7)
    const scatter = ctx.params.random >= 0.5
    const variation = ctx.params.variation
    // Distances are measured in mm, so every dot is a true circle and its flank the same slope all round.
    const mx = cellMmX(ctx)
    const my = cellMmLattice(ctx)
    const radiusMm = radius * dotSpacingMm(mx, my)
    const flank = dotFlank(softness, radiusMm)
    if (!scatter) {
      const { run, foot, shoulder } = flank
      // The nearest centre in mm, not in pattern units: on a stretched lattice the two part near a cell's
      // edge, and a dot measured from the wrong one would end in a cliff there. No dot reaches further than
      // half a spacing, so the three nearest rows of three hold every centre that can reach a sample.
      return (u, v) => {
        const s = u * repeatsX
        const py = v * repeatsY * SQRT3
        const m0 = Math.round(py / HALF_SQRT3)
        let near = Infinity
        for (let m = m0 - 1; m <= m0 + 1; m++) {
          const off = m & 1 ? 0.5 : 0
          const dy = (m * HALF_SQRT3 - py) * my
          const i0 = Math.round(s - off)
          for (let i = i0 - 1; i <= i0 + 1; i++) {
            const dx = (i + off - s) * mx
            const d2 = dx * dx + dy * dy
            if (d2 < near) near = d2
          }
        }
        return roundedRamp(radiusMm - Math.sqrt(near), run, foot, shoulder)
      }
    }
    // Bubbles: one per lattice point, jittered, of mixed sizes. Where two overlap they part along their
    // radical axis (the line through the two crossing points), each falling to a groove there at least as
    // steep as its rim, so a cluster reads as pressed bubbles. Every bubble whose disc or groove can reach a
    // sample is gathered first: one further off can neither cover it nor cut a groove through it.
    const reachMm = radiusMm * mix(1, 1.55, variation) + Math.max(flank.run, MIN_SOFT_MM)
    const reachS = reachMm / mx + BUBBLE_JITTER / 2
    const reachPy = reachMm / my + BUBBLE_JITTER / 2
    // Room for every lattice point in that reach, plus one per axis for rounding at its ends.
    const most = (Math.floor(2 * reachS) + 2) * (Math.floor((2 * reachPy) / HALF_SQRT3) + 2)
    const rows = 2 * repeatsY
    const cx = new Float64Array(most)
    const cy = new Float64Array(most)
    const cr = new Float64Array(most)
    const ctop = new Float64Array(most)
    const cpow = new Float64Array(most)
    return (u, v) => {
      const s = u * repeatsX
      const py = v * repeatsY * SQRT3
      const mHi = Math.floor((py + reachPy) / HALF_SQRT3)
      let n = 0
      let best = -1
      let bestPow = Infinity
      for (let m = Math.ceil((py - reachPy) / HALF_SQRT3); m <= mHi; m++) {
        const off = m & 1 ? 0.5 : 0
        const row = wrap(m, rows)
        const iHi = Math.floor(s - off + reachS)
        for (let i = Math.ceil(s - off - reachS); i <= iHi; i++) {
          const col = wrap(i, repeatsX)
          const h = hashCell(col, row, seed)
          const id = hashCell(col, row, seed ^ 0x1b873593) / 4294967296
          const dx = (i + off + ((h & 0xffff) / 65536 - 0.5) * BUBBLE_JITTER - s) * mx
          const dy = (m * HALF_SQRT3 + ((h >>> 16) / 65536 - 0.5) * BUBBLE_JITTER - py) * my
          const r = radiusMm * mix(1, 0.45 + 1.1 * id, variation)
          const pow = dx * dx + dy * dy - r * r
          cx[n] = dx
          cy[n] = dy
          cr[n] = r
          ctop[n] = mix(1, 0.4 + 0.6 * id, variation)
          cpow[n] = pow
          if (pow < bestPow) {
            bestPow = pow
            best = n
          }
          n++
        }
      }
      if (bestPow >= 0) return 0
      const bx = cx[best]
      const by = cy[best]
      let toAxis = Infinity
      for (let j = 0; j < n; j++) {
        if (j === best) continue
        const apart = Math.hypot(cx[j] - bx, cy[j] - by)
        if (apart < 1e-9) continue
        const d = (cpow[j] - bestPow) / (2 * apart)
        if (d < toAxis) toAxis = d
      }
      // A smaller bubble sits lower, with a flank as steep as the tallest one's and a face as wide for its size.
      // The groove where two bubbles press together is cut twice as steep as the rim, so a bubble squeezed
      // to a sliver still keeps a flat face on top.
      const top = ctop[best]
      const r = cr[best]
      const run = Math.min(dotRun(r, softness), Math.max(flank.run * top, MIN_SOFT_MM))
      const rim = roundedRamp(r - Math.hypot(bx, by), run, flank.foot, flank.shoulder)
      return top * Math.min(rim, roundedRamp(toAxis, Math.max(run / 2, MIN_SOFT_MM), flank.foot, flank.shoulder))
    }
  },
}
