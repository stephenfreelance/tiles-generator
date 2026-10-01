// T-17 fish scale: offset rows of overlapping circles, each row lapping over the one below it. Offset
// rows repeat every two, so the registry forces an even row count per period.
//
// Shaped for a face-up print, which lays the relief down in flat layers: a domed scale comes out as a
// flat disc at its top ringed by wide steps. So every scale is an exactly flat face and all the relief
// sits at its edges. The free edge (the lower arc, lying on the row below) drops as a crisp lip and
// rolls back up to the face along one constant slope, which prints as even arcs parallel to the edge.
// Where a scale goes under the row above, it tucks down one short steep wall into a flat-floored
// groove. Every face sits at one height (the pattern is periodic, so it must): the asymmetry of the
// groove, a long roll on one side and a sheer tuck on the other, is what shows which scale lies on top.
//
// The topmost row that covers a point owns it, and the height is the owner's roll times the tuck under
// the rows above it. Both are 0 on every outline, so the surface stays continuous wherever the owner
// changes, including across a tile edge, and both are exactly 1 on the face.

import type { PatternSampler, TextureContext, TextureDef } from '../types'
import { clamp, smax, smin } from './common'

/**
 * Row pitch is normally half a scale width; holding it in this band keeps offset rows reading as
 * scales when the asked-for scale dwarfs the period. Any pitch stays seamless, because one period
 * is always a whole (even) number of rows.
 */
const PITCH_RANGE: [number, number] = [0.34, 0.62]

/** Run of the lip per unit of relief, mm: a quarter-depth lip at 2.4 mm is 0.6 mm tall over 0.3 mm. */
const LIP_RUN_MM = 1.2
/** Run of the tuck wall, mm: steep at every depth in the range, so it prints as one wall. */
const TUCK_MM = 0.8
/** Rounding of the lip's foot and knee and of the tuck's foot, mm (half the fillet). */
const KNEE_MM = 0.15
/** Rounding where the roll and the tuck meet the face, mm: narrow, so the crown prints as one short tread. */
const CROWN_MM = 0.5
/** Smooth union of one row's circles, mm: rounds the notch where two of them cross into a printable fillet. */
const UNION_MM = 0.8
/** The roll may take this share of the scale radius at most, so a small scale keeps a face. */
const ROLL_SHARE = 0.35
/**
 * Flattest the roll may lie, in relief per mm: about 20 degrees at the default depth and still under
 * 1 mm steps at 0.2 mm layers at the shallowest one offered. A wider roll or a taller lip would leave
 * it too gentle to print as a slope, so the roll stops short instead.
 */
const ROLL_SLOPE_MIN = 0.15

/** max(0, x - c) with its corner rounded over [c - b, c + b] by a parabola, so a sum of hinges is C1. */
function hinge(x: number, c: number, b: number): number {
  if (x <= c - b) return 0
  if (x >= c + b) return x - c
  const t = x - c + b
  return (t * t) / (4 * b)
}

export const fishScale: TextureDef = {
  id: 'fish-scale',
  mark: 'T-17',
  name: 'Fish scale',
  category: 'geometric',
  blurb: 'Flat-faced scallops in offset rows, each rolled edge lapping over the pair below it.',
  defaults: { depth: 2.4, scale: 36 },
  scaleRange: [12, 100],
  depthRange: [1.4, 4],
  params: [
    {
      key: 'overlap',
      label: 'Overlap',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.2,
      hint: 'How far each scale laps over its neighbours.',
    },
    {
      key: 'doming',
      label: 'Rolled edge',
      min: 1.5,
      max: 6,
      step: 0.5,
      default: 4.5,
      unit: 'mm',
      hint: 'How far the sloped free edge of each scale reaches in toward its flat face, as far as its slope still prints evenly.',
    },
    {
      key: 'groove',
      label: 'Rim groove',
      min: 0.4,
      max: 3,
      step: 0.1,
      default: 1.1,
      unit: 'mm',
      hint: 'Width of the flat channel along the free edge of every scale.',
    },
    {
      key: 'lift',
      label: 'Edge lift',
      min: 0,
      max: 0.4,
      step: 0.05,
      default: 0.25,
      hint: 'How much of the depth the free edge drops as a crisp lip; the rest is the rolled slope.',
    },
  ],
  directional: true,
  seeded: false,
  cellAspect: 0.5,
  create(ctx: TextureContext): PatternSampler {
    const nx = ctx.repeatsX
    const ny = ctx.repeatsY
    const [wMm, hMm] = ctx.periodMm
    const scaleMm = wMm / nx
    // Row pitch in scale widths, taken from the real geometry so the scales stay round in mm.
    const pitch = clamp(hMm / ny / scaleMm, PITCH_RANGE[0], PITCH_RANGE[1])
    // Offset rows at pitch p are already fully covered by radius 0.5, so anything much larger
    // buries every scale in its neighbours.
    const radius = 0.5 * (1 + ctx.params.overlap * 0.3)
    const lift = clamp(ctx.params.lift, 0, 0.9)
    const groove = Math.max(ctx.params.groove, 0)
    const roll = Math.max(
      Math.min(ctx.params.doming, ROLL_SHARE * radius * scaleMm, (1 - lift) / ROLL_SLOPE_MIN),
      0.5,
    )

    // Inside the owning row, e mm from its outline: 0 at the outline, a lip up to `lift` at a fixed
    // steep run, then one straight roll to the face. Every corner is a short fillet, and the face is
    // an exact 1 so it prints as one clean skin.
    const lipRun = lift * LIP_RUN_MM
    const lipSlope = lipRun > 0 ? lift / lipRun : 0
    const rollSlope = (1 - lift) / roll
    const lipKnee = KNEE_MM + lipRun
    const rollTop = lipKnee + roll
    const rollEnd = rollTop + CROWN_MM
    const rollAt = (e: number): number => {
      if (e >= rollEnd) return 1
      return (
        lipSlope * hinge(e, KNEE_MM, KNEE_MM) +
        (rollSlope - lipSlope) * hinge(e, lipKnee, KNEE_MM) -
        rollSlope * hinge(e, rollTop, CROWN_MM)
      )
    }
    // Outside the rows above, t mm from their outline: the flat groove floor, then the tuck wall.
    const tuckFoot = groove + KNEE_MM
    const tuckTop = tuckFoot + TUCK_MM
    const tuckEnd = tuckTop + CROWN_MM
    const tuckAt = (t: number): number => {
      if (t >= tuckEnd) return 1
      return (hinge(t, tuckFoot, KNEE_MM) - hinge(t, tuckTop, CROWN_MM)) / TUCK_MM
    }

    // A row further than this from the point (in scale widths) changes nothing: it neither owns the
    // point nor comes close enough to cut a groove there.
    const reach = radius + (Math.max(tuckEnd, UNION_MM) + UNION_MM) / scaleMm
    const span = Math.ceil(reach / pitch) + 1
    return (u, v) => {
      const x = u * nx
      const y = v * ny * pitch
      const row0 = Math.floor(v * ny)
      // Rows above the owner, as the nearest distance (mm) to any of their outlines.
      let above = Infinity
      for (let row = row0 + span; row >= row0 - span; row--) {
        const dy = y - row * pitch
        if (dy > reach || dy < -reach) continue
        const offset = (row & 1) * 0.5
        const base = Math.round(x - offset)
        // Signed distance into this row's circles (mm), their union rounded where two cross.
        let inside = -Infinity
        for (let k = -1; k <= 1; k++) {
          const dx = x - (base + k + offset)
          const e = (radius - Math.sqrt(dx * dx + dy * dy)) * scaleMm
          inside = inside === -Infinity ? e : smax(inside, e, UNION_MM)
        }
        // Rows are visited from the top down, so the first one that covers the point lies on top.
        if (inside > 0) return rollAt(inside) * (above === Infinity ? 1 : tuckAt(Math.max(above, 0)))
        above = above === Infinity ? -inside : smin(above, -inside, UNION_MM)
      }
      // In no circle at all: a gap between rows at the widest pitch, floored like the groove.
      return 0
    }
  },
}
