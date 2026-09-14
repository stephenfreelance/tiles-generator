// T-13 coral wood: hand-gouged wood. Shallow scoops on a staggered hexagonal lattice, each one a cut
// taken OUT of the face, so the surface is the lowest cut at every point.
//
// The whole look turns on how deep each cut is PLUNGED. One tool cuts every scoop, so every bowl has
// the same curvature; what differs is how far it was pushed in. A bowl plunged by `plunge` sits at
// (1 - plunge) at its centre and rises by the same dish profile until it runs back out to the face,
// so a deep cut spreads wide and planes away its neighbour's rim while a light one stops short and
// leaves land standing around it. Joins therefore land at many different heights, which is the
// overlapping crescent rim of the reference.
//
// Scaling one bowl's depth instead (z = 1 - cut * (1 - dish)) looks equivalent and is not: it pins
// every bowl back to face height at its own rim, so the joins all sit at the top and the field is a
// honeycomb of equal cells no matter how much the depths vary. The centres stay on the lattice
// either way, because wandering centres give scattered craters rather than staggered rows.

import { hashCell, valueFbm2, wrap } from '../noise'
import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { clamp01, intAtLeast1, MIN_SOFT_MM, smin, smoothstep, SQRT3, TAU } from './common'

const HALF_SQRT3 = SQRT3 / 2
/** Grain lines run this far apart along the board: about a dozen across a scoop, as the photos show. */
const GRAIN_PITCH_MM = 1.6
/** Scale the grain drifts and opens out on, roughly a centimetre of board. */
const GRAIN_DRIFT_MM = 10
/**
 * Grain cycles a full-depth dish drags the lines sideways: what bends a straight line into an arc
 * that follows the cut. The references bow the line and no more; past about one, with only a dozen
 * lines to a scoop, the arcs close into a bullseye centred on every scoop.
 */
const GRAIN_BOW = 0.8
/**
 * How much of the plunge the hand varies away, at full variation. Small on purpose: a carver works
 * to a depth and wobbles around it. Take much more than a third off and the typical cut no longer
 * reaches its neighbour's, so the uncut face survives between the scoops as one continuous plateau
 * and the field reads as a machined honeycomb instead of overlapping cuts.
 */
const PLUNGE_SPREAD = 0.4
/**
 * How much the footprint of a cut varies, at full variation: the same gouge entering at a different
 * angle bites wider or narrower. It is the only term here that can CURVE a join, because two bowls
 * of equal curvature meet along a straight line however differently they are plunged, and a field of
 * straight joins is a honeycomb rather than the reference's overlapping arcs.
 */
const RADIUS_SPREAD = 0.95
/**
 * Cell height / width to aim the lattice at. A regular hexagonal lattice gives 1.155; the scoops in
 * the reference sit a little squatter than that, near enough as wide as they are tall.
 */
const TARGET_CELL_ASPECT = 1.09
/** How wide the join between two cuts is rounded over, at full ridge wear. */
const RIDGE_WEAR_MM = 6

/**
 * Dish profile against squared radius, rising 0 at the centre to 1 at the rim: a plain paraboloid,
 * which is the shallow cut one gouge radius actually leaves. Its slope grows with the radius, so the
 * body of the scoop stays gentle and the steepness collects at the rim, where two cuts meet in the
 * crisp line that catches the light. Weighting the near field instead (t2 * (1.5 - 0.5 * t2)) spends
 * the fall in the middle of the facet and halves the rim slope: heavy shading, and no rim left.
 *
 * A facet that reads as flat is not this profile going wrong, it is the relief being too shallow for
 * its width: the steepest point of a cut tilts by about 2 * depth / radius, so the depth has to
 * track the scoop size to keep that angle. The references sit near depth = 0.1 * spacing.
 */
const dish = (t2: number): number => t2

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

export const coralWood: TextureDef = {
  id: 'coral-wood',
  mark: 'T-13',
  name: 'Coral wood',
  category: 'organic',
  blurb: 'Hand-gouged wood: broad shallow scoops in staggered rows, crisp overlapping rims, fine grain arcing across every cut.',
  defaults: { depth: 3, scale: 30 },
  scaleRange: [12, 40],
  depthRange: [0.8, 3.6],
  params: [
    {
      key: 'size',
      label: 'Scoop size',
      min: 0.5,
      max: 0.78,
      step: 0.01,
      default: 0.66,
      hint: 'How wide one cut spreads, as a share of the spacing. Low leaves flats between the scoops, high planes them away.',
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
      default: 0.3,
      hint: 'How far the line where two scoops meet is rounded off, the way sanding softens a gouged edge.',
    },
    {
      key: 'grain',
      label: 'Grain',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.45,
      hint: 'Growth rings the cut exposes: fine lines that bow into arcs wherever a scoop dips through them.',
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
    // The join between two cuts is rounded by a smooth minimum, whose k is a HEIGHT, but what has to
    // stay printable, and what the eye reads as a sanded edge, is the width the rounding covers. At
    // the rim the dish climbs 2 / reach per unit of spacing, so convert through that slope and the
    // rim keeps the same real width whatever the scale, never sharper than the nozzle can lay down.
    const rimSlopePerMm = 2 / (reach * pitchMm)
    const ridge = 0.5 * Math.max(MIN_SOFT_MM, ctx.params.ridge * RIDGE_WEAR_MM) * rimSlopePerMm
    const grainDepth = grain * 0.045
    // A hand wanders, but only just: past an eighth of the spacing the staggered rows dissolve and
    // the field reads as scattered craters, which is the one thing the reference is not.
    const jitter = variation * 0.12
    // Rows near enough together, or cuts wide enough, and a scoop two rows away still reaches here.
    // Measured off the WIDEST a cut can come out, not the nominal reach, or the over-size cuts are
    // the very ones clipped away at the edge of the search.
    const reachMax = reach * (1 + 0.5 * variation * RADIUS_SPREAD)
    const jSpan = Math.max(1, Math.ceil((reachMax + jitter) / rowStep))
    // Many fine lines per scoop, so neighbouring scoops sit at unrelated points in the grain. Tying
    // this near the lattice frequency instead makes every scoop show the same figure.
    const grainX = intAtLeast1(ctx.periodMm[0] / GRAIN_PITCH_MM)
    // A slow skew, so the grain crosses the rows at a few degrees rather than running dead straight.
    const grainY = intAtLeast1(ctx.periodMm[1] / (GRAIN_PITCH_MM * 20))
    // A dish drags the grain by bow/pitch; once that gradient outruns the line spacing the lines
    // fold back through each other, so cap the bow by what the spacing can actually carry.
    const bow = Math.min(GRAIN_BOW, (0.7 * grainX) / (2 * repeatsX))
    // Grain drifts on a scale of its own, a centimetre of board, and not on the scoop lattice:
    // keyed to the cell frequency instead, every scoop shows its neighbour's figure again and the
    // lines read as one machined comb. Value noise needs a period of 2 or more, because at period 1
    // every lattice corner carries the same hash.
    const wobbleX = Math.max(2, intAtLeast1(ctx.periodMm[0] / GRAIN_DRIFT_MM))
    const wobbleY = Math.max(2, intAtLeast1(ctx.periodMm[1] / GRAIN_DRIFT_MM))
    return (u, v) => {
      const s = u * repeatsX
      const py = v * totalPy
      const j0 = Math.round(py / rowStep)
      // The uncut board. Every cut competes against it, so a light cut simply leaves land behind.
      let h = 1
      let nearT2 = 4
      for (let dj = -jSpan; dj <= jSpan; dj++) {
        const j = j0 + dj
        const jw = wrap(j, rows)
        const rowOffset = (jw & 1) * 0.5
        const i0 = Math.round(s - rowOffset)
        // Off the UNWRAPPED row, so the lattice runs on across the wrap instead of folding back.
        const cy = j * rowStep
        for (let di = -1; di <= 1; di++) {
          const i = i0 + di
          // Hashing the WRAPPED cell is what lets a scoop straddle a tile joint and still line up.
          const iw = wrap(i, repeatsX)
          const bits = hashCell(iw, jw, seed)
          const dx = s - (i + rowOffset + ((bits & 0xff) / 255 - 0.5) * jitter)
          const dy = py - (cy + (((bits >>> 8) & 0xff) / 255 - 0.5) * jitter)
          // Centred on the nominal reach, not shrinking from it: a cut wider than its neighbour
          // planes into that neighbour and leaves it as a crescent, which only happens if some cuts
          // come out over size as well as under.
          const r = reach * (1 + variation * RADIUS_SPREAD * ((((bits >>> 16) & 0xff) / 255) - 0.5))
          const t2 = (dx * dx + dy * dy) / (r * r)
          if (t2 < nearT2) nearT2 = t2
          if (t2 >= 1) continue
          // How far this cut was pushed in. Two things vary it, and both are needed. Pressure that
          // drifts ACROSS the board takes a whole patch deep together, which survives the minimum
          // below: independent variation largely does not, because the deepest of the three cuts
          // meeting at a junction comes out much the same wherever you look. But the crescents ARE
          // the independent part: a light cut left standing beside a deep one keeps only the arc of
          // its rim, and with drift alone every neighbour matches and the field is one honeycomb.
          // The patch is indexed off the WRAPPED cell, so the drift stays periodic and the tile
          // still meets itself.
          const region = hashCell(iw >> 1, jw >> 1, seed ^ 0x2545f491)
          const plunge =
            1 -
            variation *
              PLUNGE_SPREAD *
              (0.45 * (((region >>> 8) & 0xff) / 255) + 0.55 * (((bits >>> 24) & 0xff) / 255))
          const z = 1 - plunge + dish(t2)
          // Past the blend band this cut is above the face and has nothing to say here.
          if (z >= 1 + ridge) continue
          h = smin(h, z, ridge)
        }
      }
      h = clamp01(h)
      if (grainDepth > 0) {
        // Lift the field by the grain's own depth so the carve has a floor to cut into.
        h = h * (1 - grainDepth) + grainDepth
        const wobble = valueFbm2(u * wobbleX, v * wobbleY, wobbleX, wobbleY, 2, seed + 57) - 0.5
        // Lines of the board, bent by the cut: the carved height itself displaces the grain, so a
        // line runs straight over the land and bows as it crosses a dish. Reading the displacement
        // off the global height (not off the owning scoop) is what keeps a line continuous over a
        // rim instead of stepping at every scoop edge.
        const g = grainX * u + grainY * v + h * bow + 0.7 * wobble
        // A plain raised cosine: the grain is the finish on top of the carving, so it may not carry
        // a slope to rival the dish. Peaking the profile (a power above 1) narrows these into cords
        // and the field reads as knitted rather than gouged.
        const line = 0.5 + 0.5 * Math.cos(TAU * g)
        // The grain is what the cut EXPOSES, so it belongs in the body of a scoop and dies away at
        // the rims, which a plane and a sanding block have been over. Carrying it at full strength
        // across the rims too is what lays one continuous comb over the whole panel.
        const taper = 1 - 0.55 * smoothstep(0.45, 1.05, Math.sqrt(nearT2))
        // Some bands of a board run open and others almost closed; the same slow noise does both.
        h -= grainDepth * (0.3 + 0.7 * (wobble + 0.5)) * line * taper
      }
      return clamp01(h)
    }
  },
}
