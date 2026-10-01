// T-13 coral wood: hand-gouged wood. Scoops on a staggered hexagonal lattice, each one a cut taken
// OUT of the face, so the surface is the lowest cut at every point.
//
// The whole look turns on how deep each cut is PLUNGED. One tool cuts every scoop, so every bowl has
// the same kind of flank; what differs is how far it was pushed in. A bowl plunged by `plunge` sits
// at (1 - plunge) at its centre and rises along its profile until it runs back out to the face, so a
// deep cut spreads wide and planes away its neighbour's rim while a light one stops short and leaves
// land standing around it. Joins therefore land at many different heights, which is the overlapping
// crescent rim of the reference.
//
// Scaling one bowl's depth instead (z = 1 - cut * (1 - dish)) looks equivalent and is not: it pins
// every bowl back to face height at its own rim, so the joins all sit at the top and the field is a
// honeycomb of equal cells no matter how much the depths vary. The centres stay on the lattice
// either way, because wandering centres give scattered craters rather than staggered rows.
//
// Printed face up, every scoop comes out as stairs one layer tall. The first version cut shallow
// paraboloid dishes (3 mm over 30 mm scoops) whose bottom lay so nearly level that the printer laid
// it as one wide disc ringed by wide treads, and its grain, finer than a layer, broke those treads
// into stripes: nothing like the smooth dish the render showed. So the cuts are now deep enough for
// their width, and every dish falls from a shallow cone at its very bottom instead of from a level
// floor, so even there each step is narrower than a millimetre and the lowest tread is a speck.

import { hashCell, valueFbm2, wrap } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { clamp01, MIN_SOFT_MM, smin, smoothstep, SQRT3 } from './common'

const HALF_SQRT3 = SQRT3 / 2
/**
 * How much of the plunge the hand varies away, at full variation. Small on purpose: a carver works
 * to a depth and wobbles around it. Take much more than a third off and the typical cut no longer
 * reaches its neighbour's, so the uncut face survives between the scoops as one continuous plateau
 * and the field reads as a machined honeycomb instead of overlapping cuts.
 */
const PLUNGE_SPREAD = 0.4
/**
 * How much the footprint of a cut varies, at full variation: the same gouge entering at a different
 * angle bites wider or narrower. It is what CURVES a join, because two dishes of equal curvature
 * meet along a straight line however differently they are plunged, and a field of straight joins is
 * a honeycomb rather than the reference's overlapping arcs: a cut wider than its neighbour planes
 * into it and leaves it as a crescent.
 */
const RADIUS_SPREAD = 0.95
/**
 * Cell height / width to aim the lattice at. A regular hexagonal lattice gives 1.155; the scoops in
 * the reference sit a little squatter than that, near enough as wide as they are tall.
 */
const TARGET_CELL_ASPECT = 1.09
/**
 * How wide the join between two cuts is rounded over at full ridge wear, mm. Rounding flattens the
 * crest the printer lays along a rim, and most of all the tops where three rims meet, so it stops
 * where the flat it leaves on such a top is still about 2 mm across: a speck, not a disc.
 */
const RIDGE_WEAR_MM = 1
/** The depth the shapes below are sized at, mm: the default, where the maker first prints it. */
const DESIGN_DEPTH_MM = 5
/**
 * Slope at the very bottom of every cut at that depth: 18 degrees, so the lowest tread, rounded tip
 * and all, is a speck under 1.6 mm across, and still 13 at the shallowest depth offered, so no step
 * there is as wide as a millimetre. A paraboloid's slope starts from nothing, so its bottom lies
 * level enough to print as a disc ringed by wide treads; a plain cone prints evenly but shades as a
 * funnel. So each cut falls as a shallow cone from its centre and turns into a dish once it is this
 * steep: the smaller the scoop, the sooner it turns.
 */
const APEX_FALL = 0.32
/** Steepest a cut may start, against its mean slope: the dish above needs some fall left over. */
const APEX_MAX = 0.95
/** Radius the point of the cone is rounded over, mm: the softest edge that prints, and no wider. */
const TIP_MM = MIN_SOFT_MM / 2
/** Where two cuts typically meet, as a share of the reach: the slope there sizes the ridge wear. */
const JOIN_T = 0.8
/** Per-cut values the sampler reads, laid out flat: see `cutTable`. */
const STRIDE = 10

/** Densest grain, mm between lines: three or four lines across a scoop at the default size. */
const GRAIN_PITCH_MM = 5
/** Width of one grain line across its top, mm: a groove the nozzle opens cleanly. */
const GRAIN_WIDTH_MM = 1.4
/**
 * Depth of a grain line, share of the relief: 0.7 mm at the default depth and 0.5 mm at the
 * shallowest, so a line is never under two 0.2 mm layers. Shallower grain cannot print as grooves:
 * it comes out as stray islands and stripes, which is what the first version's did.
 */
const GRAIN_DEPTH = 0.14
/** How far a full-depth scoop drags a line sideways, mm: enough to bow it, never to fold it. */
const GRAIN_BOW_MM = 3
/** How far a line wanders on its own, mm, over the drift scale below. */
const GRAIN_WANDER_MM = 2.5
/** Scale grain drifts on, roughly a centimetre of board. */
const GRAIN_DRIFT_MM = 10
/** Lean of the grain across the rows, as a slope: a few degrees, so no line runs dead straight. */
const GRAIN_LEAN = 0.07

/**
 * Voronoi cell height / width for staggered rows `d` apart, d in units of the spacing along a row.
 * Above d = 0.5 that cell is the familiar six-sided one, 1.155 tall when the lattice is equilateral;
 * below it the second row up closes in overhead and the cell goes wide and flat instead.
 */
const cellAspectFor = (d: number): number => (d >= 0.5 ? (0.25 + d * d) / d : 2 * d)

/**
 * Rows of centres over one period. It has to be EVEN, or the last row and the first would meet at
 * the wrap in the same phase instead of staggered, and it is the only handle this pattern has on
 * cell shape: the registry rounds the repeats of each axis independently, so the period it hands
 * over is anywhere from 1.04 to 1.25 cells tall and the scoops come out as lozenges. Of the two even
 * counts either side of the equilateral ideal, take whichever lands nearer the reference shape.
 */
function rowsFor(totalPy: number): number {
  const ideal = totalPy / HALF_SQRT3
  const lo = Math.max(2, 2 * Math.floor(ideal / 2))
  const hi = lo + 2
  const miss = (rows: number): number => Math.abs(cellAspectFor(totalPy / rows) - TARGET_CELL_ASPECT)
  return miss(hi) < miss(lo) ? hi : lo
}

interface Carving {
  repeatsX: number
  rows: number
  seed: number
  reach: number
  variation: number
  /** Apex slope of the nominal cut, against its mean slope (its depth over its reach). */
  apex: number
  /** Rounding of the point of the cone, in units of the spacing along a row. */
  tip: number
}

/**
 * Every cut over one period, worked out once: the sampler then reads ten numbers per cut instead of
 * hashing and solving its profile at every sample, which is what keeps this once dearest texture cheap.
 * Hashed off the WRAPPED cell, which is what lets a scoop straddle a tile joint and still line up.
 *
 * Per cut: centre offset (x, y), 1 / r^2, floor height, apex slope, tip, tip^2, and the dish that
 * takes over from the cone (where it starts as t^2, half its curvature, and its offset).
 */
function cutTable({ repeatsX, rows, seed, reach, variation, apex, tip }: Carving): Float64Array {
  // A hand wanders, but only just: past an eighth of the spacing the staggered rows dissolve and
  // the field reads as scattered craters, which is the one thing the reference is not.
  const jitter = variation * 0.12
  const cuts = new Float64Array(repeatsX * rows * STRIDE)
  for (let jw = 0; jw < rows; jw++) {
    for (let iw = 0; iw < repeatsX; iw++) {
      const bits = hashCell(iw, jw, seed)
      // Centred on the nominal reach, not shrinking from it: a cut wider than its neighbour planes
      // into that neighbour and leaves it as a crescent, which only happens if some cuts come out
      // over size as well as under.
      const r = reach * (1 + variation * RADIUS_SPREAD * (((bits >>> 16) & 0xff) / 255 - 0.5))
      // How far this cut was pushed in. Two things vary it, and both are needed. Pressure that
      // drifts ACROSS the board takes a whole patch deep together, which survives the minimum the
      // sampler takes: independent variation largely does not, because the deepest of the three
      // cuts meeting at a junction comes out much the same wherever you look. But the crescents ARE
      // the independent part: a light cut left standing beside a deep one keeps only the arc of its
      // rim, and with drift alone every neighbour matches and the field is one honeycomb. The patch
      // is indexed off the wrapped cell too, so the drift stays periodic and the tile meets itself.
      const region = hashCell(iw >> 1, jw >> 1, seed ^ 0x2545f491)
      const plunge =
        1 -
        variation *
          PLUNGE_SPREAD *
          (0.45 * (((region >>> 8) & 0xff) / 255) + 0.55 * (((bits >>> 24) & 0xff) / 255))
      // The profile runs in units of this cut's own radius, so scaling the apex slope with the
      // radius gives every cut the same fall at its bottom in millimetres: a wider cut no longer
      // flattens out there, it only opens into a gentler dish.
      const a = Math.min(APEX_MAX, (apex * r) / reach)
      // The dish z = c t^2 / 2 + offset takes over where its slope c t has grown to the cone's a,
      // with c chosen so the whole profile still climbs exactly 1 by t = 1: c^2 - 2c + a^2 = 0.
      const c = 1 + Math.sqrt(1 - a * a)
      const t0 = a / c
      const tipR = tip / r
      const coneAtT0 = a * (Math.sqrt(t0 * t0 + tipR * tipR) - tipR)
      const at = (jw * repeatsX + iw) * STRIDE
      cuts[at] = ((bits & 0xff) / 255 - 0.5) * jitter
      cuts[at + 1] = (((bits >>> 8) & 0xff) / 255 - 0.5) * jitter
      cuts[at + 2] = 1 / (r * r)
      cuts[at + 3] = 1 - plunge
      cuts[at + 4] = a
      cuts[at + 5] = tipR
      cuts[at + 6] = tipR * tipR
      cuts[at + 7] = t0 * t0
      cuts[at + 8] = 0.5 * c
      // Offset so the dish meets the rounded cone exactly at t0: no seam, however small the tip.
      cuts[at + 9] = coneAtT0 - 0.5 * c * t0 * t0
    }
  }
  return cuts
}

export const coralWood: TextureDef = {
  id: 'coral-wood',
  mark: 'T-13',
  name: 'Coral wood',
  category: 'organic',
  blurb: 'Hand-gouged wood: deep scoops in staggered rows with crisp overlapping rims, and grain lines that bow through each cut if you want them.',
  defaults: { depth: DESIGN_DEPTH_MM, scale: 20 },
  // Bigger scoops need deeper cuts to stay steep: inside these two ranges every pairing prints as fine rings,
  // where a 28 mm scoop only 3.6 mm deep printed over half its area as wide treads.
  scaleRange: [12, 26],
  depthRange: [4.4, 7],
  params: [
    {
      key: 'size',
      label: 'Scoop size',
      min: 0.5,
      max: 0.78,
      step: 0.01,
      default: 0.62,
      hint: 'How wide one cut spreads, as a share of the spacing. Low leaves flats between the scoops and steepens them, high planes the flats away.',
    },
    {
      key: 'variation',
      label: 'Hand variation',
      min: 0,
      max: 0.7,
      step: 0.05,
      default: 0.65,
      hint: 'How unevenly the cuts are plunged. At 0 they are identical and the rims form one honeycomb; raising it breaks them into overlapping scoops.',
    },
    {
      key: 'ridge',
      label: 'Ridge wear',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0,
      hint: 'How far the line where two scoops meet is rounded off, the way sanding softens a gouged edge. 0 prints the crispest rims; at 1 the tops where three rims meet print as small flats.',
    },
    {
      key: 'grain',
      label: 'Grain',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0,
      hint: 'Grooves along the board that bow wherever a scoop dips through them, two print layers deep or more across the depth range. 0 leaves the scoops plain; raising it adds more lines.',
    },
  ],
  directional: true,
  seeded: true,
  cellAspect: SQRT3,
  create(ctx: TextureContext): PatternSampler {
    const { repeatsX, seed } = ctx
    const reach = ctx.params.size
    const variation = ctx.params.variation
    const grain = ctx.params.grain
    // Both axes are measured in units of the spacing along a row, so a scoop is round in
    // MILLIMETRES whatever aspect the period happens to have, and the lattice is the only thing
    // that stretches. Sampling in cell units instead (v * repeatsY * sqrt3) assumes the two
    // roundings agreed, and when they do not the cuts themselves come out oval.
    const pitchMm = ctx.periodMm[0] / repeatsX
    const totalPy = ctx.periodMm[1] / pitchMm
    const rows = rowsFor(totalPy)
    const rowStep = totalPy / rows
    const tip = TIP_MM / pitchMm
    // The cone's slope in units of the nominal cut's mean slope, which is DESIGN_DEPTH_MM over the
    // reach in millimetres: wide scoops need nearly all cone to keep their bottom that steep.
    const apex = Math.min(APEX_MAX, (APEX_FALL * reach * pitchMm) / DESIGN_DEPTH_MM)
    const cuts = cutTable({ repeatsX, rows, seed, reach, variation, apex, tip })
    // The join between two cuts is rounded by a smooth minimum, whose k is a HEIGHT, but what has to
    // stay printable, and what the eye reads as a sanded edge, is the width the rounding covers.
    // Convert through the flank's slope where cuts meet, so the rim keeps the same real width
    // whatever the scale: never sharper than the nozzle lays down, never wider than a narrow crown.
    const joinSlopePerMm = ((1 + Math.sqrt(1 - apex * apex)) * JOIN_T) / (reach * pitchMm)
    const ridge = (MIN_SOFT_MM + ctx.params.ridge * (RIDGE_WEAR_MM - MIN_SOFT_MM)) * joinSlopePerMm
    const jitter = variation * 0.12
    // Out past its rim a cut stays above the face until the blend band is spent (its dish climbs
    // at least as fast as 1 per radius there); measured off the WIDEST a cut can come out, or the
    // over-size cuts are the very ones clipped at the search edge.
    const rMin = reach * (1 - 0.5 * variation * RADIUS_SPREAD)
    const reachMax = reach * (1 + 0.5 * variation * RADIUS_SPREAD) * (1 + ridge + tip / rMin)
    const jSpan = Math.max(1, Math.ceil((reachMax + jitter) / rowStep))
    const iSpan = Math.max(1, Math.ceil(reachMax + 0.5 + jitter) - 1)
    const skipT2 = (1 + ridge + tip / rMin) ** 2
    // Grain: more of it means more lines, never shallower ones, so every line stays deep enough to
    // print. Counts are whole, so the lines meet themselves at the tile edge.
    const grainDepth = grain > 0 ? GRAIN_DEPTH : 0
    const grainPitchMm = grain > 0 ? GRAIN_PITCH_MM / grain : 1
    const grainX = Math.max(1, Math.round(ctx.periodMm[0] / grainPitchMm))
    const grainY = Math.round((GRAIN_LEAN * ctx.periodMm[1]) / grainPitchMm)
    const linePitchMm = ctx.periodMm[0] / grainX
    const bow = GRAIN_BOW_MM / linePitchMm
    const wander = GRAIN_WANDER_MM / linePitchMm
    const halfWidth = (0.5 * GRAIN_WIDTH_MM) / linePitchMm
    // Grain drifts on a scale of its own, a centimetre of board, and not on the scoop lattice:
    // keyed to the cell frequency instead, every scoop shows its neighbour's figure again and the
    // lines read as one machined comb. Value noise needs a period of 2 or more, because at period 1
    // every lattice corner carries the same hash.
    const wobbleX = Math.max(2, Math.round(ctx.periodMm[0] / GRAIN_DRIFT_MM))
    const wobbleY = Math.max(2, Math.round(ctx.periodMm[1] / GRAIN_DRIFT_MM))
    return (u, v) => {
      const s = u * repeatsX
      const py = v * totalPy
      const j0 = Math.round(py / rowStep)
      // Above the face to start with, and clipped to it after: the uncut board stays EXACTLY flat
      // (it prints as one clean skin) and meets each cut along a crisp line instead of a blend.
      let h = 2
      let nearT2 = 4
      for (let dj = -jSpan; dj <= jSpan; dj++) {
        const j = j0 + dj
        const jw = wrap(j, rows)
        const rowOffset = (jw & 1) * 0.5
        const i0 = Math.round(s - rowOffset)
        // Off the UNWRAPPED row, so the lattice runs on across the wrap instead of folding back.
        const cy = j * rowStep
        const rowAt = jw * repeatsX
        for (let di = -iSpan; di <= iSpan; di++) {
          const i = i0 + di
          const at = (rowAt + wrap(i, repeatsX)) * STRIDE
          const dx = s - (i + rowOffset + cuts[at])
          const dy = py - (cy + cuts[at + 1])
          const t2 = (dx * dx + dy * dy) * cuts[at + 2]
          if (t2 < nearT2) nearT2 = t2
          if (t2 >= skipT2) continue
          // A cone rounded over the tip near the centre, the dish beyond it.
          const z =
            cuts[at + 3] +
            (t2 < cuts[at + 7]
              ? cuts[at + 4] * (Math.sqrt(t2 + cuts[at + 6]) - cuts[at + 5])
              : cuts[at + 8] * t2 + cuts[at + 9])
          // Past the blend band this cut is above the face and has nothing to say here.
          if (z >= 1 + ridge) continue
          h = smin(h, z, ridge)
        }
      }
      h = clamp01(h)
      if (grainDepth > 0) {
        // Cut straight into the scoops rather than lifting the field to make room: a lift squeezes
        // every flank by the grain's depth, and at the shallowest depth that tips the bottom of each
        // scoop back under the slope that prints fine steps. A line meeting the base floors out
        // there, exactly flat.
        const wobble = valueFbm2(u * wobbleX, v * wobbleY, wobbleX, wobbleY, 2, seed + 57) - 0.5
        // Lines of the board, bent by the cut: the carved height itself displaces the grain, so a
        // line runs straight over the land and bows as it crosses a dish. Reading the displacement
        // off the global height (not off the owning scoop) is what keeps a line continuous over a
        // rim instead of stepping at every scoop edge.
        const g = grainX * u + grainY * v + h * bow + wander * wobble
        const f = g - Math.floor(g)
        // A groove of one fixed depth and width, whatever the amount: finer or shallower, a line is
        // under two layers and prints as stray islands rather than as grain.
        const line = smoothstep(halfWidth, 0, f < 0.5 ? f : 1 - f)
        // The grain is what the cut EXPOSES, so it belongs in the body of a scoop and runs out
        // before the rims, which a plane and a sanding block have been over.
        const taper = smoothstep(1.05, 0.8, Math.sqrt(nearT2))
        h -= grainDepth * line * taper
      }
      return clamp01(h)
    }
  },
}
