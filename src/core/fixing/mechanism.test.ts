import { describe, expect, it } from 'vitest'
import { MIN_FIXING_THICKNESS } from '../config'
import { checkMesh, componentCount, downwardArea, pinchedVertices } from '../geometry/meshChecks'
import { ringSelfIntersects, signedArea } from '../geometry/polygon'
import {
  BARB_TIP_HIGH,
  BARB_TIP_LOW,
  barbOuter,
  barbProfile,
  BLOCK_HALF_WIDTH,
  CATCH,
  CEILING_ROOM,
  CLEARANCE_RANGE,
  CLIP_CLEARANCE,
  CLIP_HALF_LENGTH,
  CLIP_THICKNESS,
  clipChecks,
  clipOutlineAt,
  clipPlan,
  clipPocketLevels,
  COUNTERSINK,
  DRILL_HOLE,
  FLARE_ANGLE,
  FLARE_OUT,
  FLARE_ROOM,
  FLOAT,
  holeRadius,
  LEAD_ANGLE,
  LEAD_MARGIN,
  MAX_ARM_STRAIN,
  MIN_BASE,
  MIN_CATCH,
  POCKET_DEPTH,
  POCKET_HALF_LONG,
  POCKET_HALF_SHORT,
  POCKET_LAND_HALF_LENGTH,
  POCKET_MOUTH,
  POCKET_OPENING,
  POCKET_RIDGE,
  pocketHalfWidth,
  pocketProfile,
  PRELOAD,
  rampFactor,
  returnFaceLow,
  SAG_RANGE,
  STOP_HALF_LENGTH,
  STOP_HEIGHT,
  STOP_OFFSET,
  STOP_WIDTH,
  stopRects,
  TAPE_NOMINAL,
  TAPE_RANGE,
  TINE_OUTER,
  wallGap,
} from './mechanism'
import { buildClipMesh, clipSpec } from './mount'

const FITS = Object.entries(CLIP_CLEARANCE) as [keyof typeof CLIP_CLEARANCE, number][]
/** The ceiling's droop where the stops bear, from none to the most, every fit class: the grid every check holds over. */
const SAGS = [SAG_RANGE[0], (SAG_RANGE[0] + SAG_RANGE[1]) / 2, SAG_RANGE[1]]
const GRID = FITS.flatMap(([fit, c]) => SAGS.map((sag) => [fit, c, sag] as const))
const TAN = Math.tan(FLARE_ANGLE * (Math.PI / 180))

function bounds(positions: Float32Array) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], positions[i])
    max[i % 3] = Math.max(max[i % 3], positions[i])
  }
  return { min, max }
}

describe('clip: strain', () => {
  it.each(GRID)('keeps every tine under 2 percent, clicked in and pulled off (%s fit, %s mm clearance, %s mm droop)', (_fit, c, sag) => {
    const k = clipChecks(c, sag)
    // Clicked in at the table, centred and off-centre by the float: nothing stops the tine's lift. Pushing a
    // tile back onto a clip on the wall folds as much, its lift stopped a tape's thickness down: no more strain.
    expect(k.pushStrain).toBeLessThanOrEqual(MAX_ARM_STRAIN)
    expect(k.pushStrainOffCentre).toBeLessThanOrEqual(MAX_ARM_STRAIN)
    // Pulled off: the fold and the lift the return face adds peak at one corner of the root.
    expect(k.releaseStrain).toBeLessThanOrEqual(MAX_ARM_STRAIN)
    // Held for as long as the clip sits in its tile, on the wall or off it: well under the limit.
    expect(k.heldStrain).toBeLessThan(MAX_ARM_STRAIN / 3)
  })

  it('counts the lift: fold alone would understate the release corner, and a steeper face lifts more', () => {
    const c = CLEARANCE_RANGE[0]
    const k = clipChecks(c)
    // The lift adds more than half again to the fold's strain.
    const fold = CATCH - c + FLOAT
    const foldOnly = (1.5 * 1.2 * fold) / (14.35 * 14.35)
    expect(k.releaseStrain).toBeGreaterThan(1.5 * foldOnly)
    expect(k.releaseStrain).toBeCloseTo(foldOnly * (1 + rampFactor(FLARE_ANGLE) * (1.2 / CLIP_THICKNESS)), 12)
    // Clicking in at 45 degrees lifts more than pulling off at 40, and still keeps a margin under the limit.
    expect(rampFactor(45)).toBeGreaterThan(rampFactor(FLARE_ANGLE))
    expect(k.pushStrainOffCentre).toBeGreaterThan(k.releaseStrain)
    expect(MAX_ARM_STRAIN - k.pushStrainOffCentre).toBeGreaterThan(0.002)
  })

  it('folds as far whatever the droop: the barb must still get back inside the lips to come off', () => {
    for (const [, c] of FITS) {
      const [flat, drooped] = [clipChecks(c, SAG_RANGE[0]), clipChecks(c, SAG_RANGE[1])]
      expect(drooped.pushStrainOffCentre).toBe(flat.pushStrainOffCentre)
      expect(drooped.releaseStrain).toBe(flat.releaseStrain)
      expect(drooped.heldStrain).toBeGreaterThan(flat.heldStrain)
    }
  })

  it('releases under a firm pull: a return face between 30 and 45 degrees, never a flat catch', () => {
    expect(FLARE_ANGLE).toBeGreaterThanOrEqual(30)
    expect(FLARE_ANGLE).toBeLessThanOrEqual(45)
    // Along the wall's normal, a pull must beat the fold force times the ramp factor: more than 1 on this face.
    expect(rampFactor(FLARE_ANGLE)).toBeGreaterThan(1)
    expect(LEAD_ANGLE).toBeLessThanOrEqual(45)
  })
})

describe('clip: catch and preload on its stops, over the ceiling droop', () => {
  it.each(GRID)('holds at least MIN_CATCH, bearing on the flare or lifted off it by the float (%s fit, %s mm clearance, %s mm droop)', (_fit, c, sag) => {
    const k = clipChecks(c, sag)
    expect(k.catch).toBeGreaterThanOrEqual(MIN_CATCH - 1e-9)
    expect(k.freeCatch).toBeGreaterThanOrEqual(MIN_CATCH - 1e-9)
    // A bearing barb holds by its tip's height up the flare, which the droop lowers.
    expect(k.catch).toBeLessThanOrEqual(CATCH - c - k.preload + 1e-12)
  })

  it('clamps the clip against its stops at the snug and standard fits whatever the droop, and never lets the loose one rattle', () => {
    for (const sag of SAGS) {
      expect(clipChecks(CLIP_CLEARANCE.snug, sag).preload).toBeGreaterThan(0)
      expect(clipChecks(CLIP_CLEARANCE.standard, sag).preload).toBeGreaterThan(0)
      // The loose fit's barbs just touch the flare on a true ceiling, and bear on it once the ceiling droops.
      expect(clipChecks(CLIP_CLEARANCE.loose, sag).preload).toBeGreaterThanOrEqual(0)
    }
    expect(clipChecks(CLIP_CLEARANCE.loose, SAG_RANGE[1]).preload).toBeGreaterThan(0)
    // PRELOAD is the loosest clearance: every fit bears on the flare with its stops on a true ceiling.
    expect(PRELOAD).toBe(CLEARANCE_RANGE[1])
  })

  it('takes the droop along the flare: more preload, as much less catch, never a lost barb', () => {
    const [c] = CLEARANCE_RANGE
    const [flat, drooped] = [clipChecks(c, SAG_RANGE[0]), clipChecks(c, SAG_RANGE[1])]
    expect(drooped.preload - flat.preload).toBeCloseTo((SAG_RANGE[1] - SAG_RANGE[0]) * TAN, 12)
    expect(drooped.catch - flat.catch).toBeCloseTo(-(SAG_RANGE[1] - SAG_RANGE[0]) * TAN, 12)
    // The float lifts no barb off the flare once the preload outruns it: both sides then hold alike.
    expect(drooped.preload).toBeGreaterThan(FLOAT)
    expect(drooped.catch).toBeCloseTo(CATCH - c - drooped.preload, 12)
  })

  it('seats a clicked-in clip on its stops, its back level with the tile back or proud by the droop, never inside it', () => {
    // The stops reach the ceiling exactly when the clip's back is in the tile's back plane.
    expect(CLIP_THICKNESS + STOP_HEIGHT).toBeCloseTo(POCKET_DEPTH, 12)
    for (const [, c] of FITS) {
      for (const sag of SAGS) {
        const k = clipChecks(c, sag)
        expect(k.backProud).toBeCloseTo(sag, 12)
        expect(k.backProud).toBeGreaterThanOrEqual(-1e-12)
      }
    }
    // Why stops: without them, the barbs would draw a clip deeper until they stop bearing, this far inside the
    // tile's back at the snug and standard fits, and a clip left free could float on up to the ceiling. Its seat,
    // and with it where the tape stands, would change with the fit and the print; on its stops it cannot.
    for (const fit of ['snug', 'standard'] as const) expect((PRELOAD - CLIP_CLEARANCE[fit]) / TAN).toBeGreaterThan(0.05)
  })

  it('leaves the tape nothing to set but the gap behind the tile', () => {
    // The checks take no tape: the stops fix where the clip sits in its pocket, on the wall or off it.
    expect(clipChecks(CLIP_CLEARANCE.standard, 0)).toEqual(clipChecks(CLIP_CLEARANCE.standard))
    // On the wall, the tile's back stands off it by the tape under the clips, and the ceiling's droop.
    expect(wallGap(TAPE_NOMINAL)).toBeCloseTo(TAPE_NOMINAL, 12)
    for (const tape of TAPE_RANGE) {
      for (const sag of SAGS) expect(wallGap(tape, sag)).toBeCloseTo(tape + clipChecks(CLIP_CLEARANCE.standard, sag).backProud, 12)
    }
    expect(TAPE_RANGE[0]).toBeLessThan(TAPE_NOMINAL)
    expect(TAPE_RANGE[1]).toBeGreaterThan(TAPE_NOMINAL)
  })
})

describe('clip: the section in its pocket', () => {
  it('keeps the pocket within t - 1.2 of the Standard base, whatever the plate', () => {
    expect(MIN_BASE).toBeLessThanOrEqual(MIN_FIXING_THICKNESS + 1e-9)
    expect(POCKET_DEPTH).toBeLessThanOrEqual(MIN_FIXING_THICKNESS - 1.2 + 1e-9)
    const levels = clipPocketLevels(40, 30, 'h')
    expect(levels[levels.length - 1].z1).toBe(POCKET_DEPTH)
  })

  it.each(GRID)('leaves the ceiling gap, the lead-in and the flare room (%s fit, %s mm clearance, %s mm droop)', (_fit, c, sag) => {
    const k = clipChecks(c, sag)
    expect(k.ceilingGap).toBeGreaterThanOrEqual(CEILING_ROOM - 1e-9)
    expect(k.leadIn).toBeGreaterThanOrEqual(LEAD_MARGIN - 1e-9)
    expect(k.flareRoom).toBeGreaterThanOrEqual(FLARE_ROOM - 1e-9)
    for (const [name, gap] of Object.entries(k.clearances)) expect(gap, name).toBeGreaterThan(0)
  })

  it.each(GRID)('fits the clip in its pocket with its float, on its stops (%s fit, %s mm clearance, %s mm droop)', (_fit, c, sag) => {
    const k = clipChecks(c, sag)
    const held = Math.max(0, k.preload)
    for (let i = 0; i <= 220; i++) {
      const z = (i / 220) * CLIP_THICKNESS
      // The clip's back stands proud of the tile's back by the droop, so its height z is z - sag in the tile.
      const room = pocketHalfWidth(z - sag)
      // The block, off-centre by its float, stays inside the pocket at every height.
      expect(BLOCK_HALF_WIDTH + FLOAT, `block at ${z}`).toBeLessThanOrEqual(room + 1e-9)
      // A barb, folded in by the preload it bears, touches the flare at most: the preload, not an overlap.
      expect(barbOuter(z, c) - held, `barb at ${z}`).toBeLessThanOrEqual(room + 1e-9)
    }
    // Along the clip: its ends pass the land with END_FLOAT to spare.
    expect(POCKET_LAND_HALF_LENGTH - CLIP_HALF_LENGTH).toBeGreaterThan(0)
    // The body never reaches the ceiling, drooped in the middle by the most of the range: only the stops bear on it.
    expect(CLIP_THICKNESS - sag).toBeLessThanOrEqual(POCKET_DEPTH - SAG_RANGE[1] - CEILING_ROOM + 1e-9)
  })

  it('stands the stops on the centre block, as near the ceiling\'s long walls as the land lets them, clear of the countersink', () => {
    const rects = stopRects()
    expect(rects).toHaveLength(2)
    // Symmetric about the centre line, along the block's long edges.
    expect(rects[0][1]).toBeCloseTo(-rects[1][3], 12)
    expect(rects[0][3]).toBeCloseTo(-rects[1][1], 12)
    for (const [x0, y0, x1, y1] of rects) {
      expect(x1 - x0).toBeCloseTo(2 * STOP_HALF_LENGTH, 12)
      expect(y1 - y0).toBeCloseTo(STOP_WIDTH, 12)
      expect((Math.abs(y0) + Math.abs(y1)) / 2).toBeCloseTo(STOP_OFFSET, 12)
      // Within the block, so they pass the land as the clip goes in.
      expect(Math.max(Math.abs(y0), Math.abs(y1))).toBeLessThan(BLOCK_HALF_WIDTH)
      expect(Math.max(Math.abs(y0), Math.abs(y1))).toBeLessThan(POCKET_OPENING)
      // Clear of the countersink's rim at the clip's top.
      expect(Math.min(Math.abs(y0), Math.abs(y1)) - COUNTERSINK / 2).toBeGreaterThanOrEqual(1)
    }
    // Their inner edges, where a drooping ceiling meets them first, stand over 60 % of the way to the ceiling's walls.
    expect((STOP_OFFSET - STOP_WIDTH / 2) / POCKET_HALF_SHORT).toBeGreaterThan(0.6)
    // Two layers tall, so they print as ribs and not as a skin.
    expect(STOP_HEIGHT).toBeGreaterThanOrEqual(0.4 - 1e-9)
  })

  it('measures on the drawn profiles what the checks claim', () => {
    for (const [, c] of FITS) {
      const barb = barbProfile(c)
      // Tine face, return face, tip, top chamfer: the tip reaches CATCH - c past the ridge.
      expect(Math.max(...barb.filter((_, k) => k % 2 === 0)) - POCKET_OPENING).toBeCloseTo(CATCH - c, 12)
      expect(barb[1]).toBe(0)
      expect(barb[barb.length - 1]).toBe(CLIP_THICKNESS)
      // The return face is parallel to the flare, PRELOAD - c outside it with the clip's back at the tile's.
      const [y0, z0, y1, z1] = barb.slice(2, 6)
      expect((y1 - y0) / (z1 - z0)).toBeCloseTo(TAN, 9)
      expect(y1 - pocketHalfWidth(z1)).toBeCloseTo(PRELOAD - c, 9)
      expect(returnFaceLow(c)).toBeGreaterThan(0)
      expect(BARB_TIP_HIGH).toBeLessThan(CLIP_THICKNESS)
    }
    const wall = pocketProfile()
    expect(wall).toEqual([POCKET_OPENING + POCKET_MOUTH, 0, POCKET_OPENING, POCKET_MOUTH, POCKET_OPENING, POCKET_RIDGE, POCKET_OPENING + FLARE_OUT, POCKET_DEPTH])
    expect(POCKET_HALF_SHORT).toBeCloseTo(POCKET_OPENING + FLARE_OUT, 12)
    expect(POCKET_HALF_LONG).toBeCloseTo(POCKET_LAND_HALF_LENGTH + FLARE_OUT, 12)
  })

  it('stacks the pocket: mouth lead-in, land, widening flare, flat ceiling; turned for a vertical clip', () => {
    const h = clipPocketLevels(40, 30, 'h')
    expect(h.map((l) => [l.z0, l.z1])).toEqual([
      [0, POCKET_MOUTH],
      [POCKET_MOUTH, POCKET_RIDGE],
      [POCKET_RIDGE, POCKET_DEPTH],
    ])
    const span = (ring: Float64Array, axis: 0 | 1) => {
      const values = Array.from(ring).filter((_, k) => k % 2 === axis)
      return Math.max(...values) - Math.min(...values)
    }
    const [mouth, land, flare] = h
    expect(mouth.ringTop).toEqual(land.ring)
    expect(flare.ring).toEqual(land.ring)
    expect(span(mouth.ring, 1) - span(land.ring, 1)).toBeCloseTo(2 * POCKET_MOUTH, 9)
    expect(span(flare.ringTop as Float64Array, 1) - span(land.ring, 1)).toBeCloseTo(2 * FLARE_OUT, 9)
    expect(span(land.ring, 0)).toBeCloseTo(2 * POCKET_LAND_HALF_LENGTH, 9)
    const v = clipPocketLevels(40, 30, 'v')
    expect(span(v[1].ring, 1)).toBeCloseTo(2 * POCKET_LAND_HALF_LENGTH, 9)
    expect(span(v[1].ring, 0)).toBeCloseTo(2 * POCKET_OPENING, 9)
  })
})

describe('clip: outline and mesh', () => {
  it.each([0, 1, 2, 3])('draws a simple, counter-clockwise plan with %i fit marks, symmetric across the catch', (marks) => {
    for (const c of CLEARANCE_RANGE) {
      const ring = clipPlan(c, marks)
      expect(signedArea(ring)).toBeGreaterThan(0)
      expect(ringSelfIntersects(ring)).toBe(false)
      const pts: [number, number][] = []
      for (let k = 0; k < ring.length; k += 2) pts.push([ring[k], ring[k + 1]])
      for (const [x, y] of pts) expect(pts.some(([x2, y2]) => Math.abs(x2 - x) < 1e-9 && Math.abs(y2 + y) < 1e-9)).toBe(true)
      // Every height has the same vertex count, so the clip lofts vertex to vertex.
      for (const z of [0, returnFaceLow(c), BARB_TIP_LOW, CLIP_THICKNESS]) expect(clipOutlineAt(z, c, marks)).toHaveLength(ring.length)
    }
  })

  it.each(FITS)('builds a closed solid that prints flat on its back with nothing steeper than 45 degrees looking down (%s)', (fit) => {
    for (const marks of [0, 1, 2, 3] as const) {
      const spec = clipSpec(fit, marks)
      const mesh = buildClipMesh(spec)
      const check = checkMesh(mesh)
      expect(check.closed && check.manifold && check.oriented, spec.id).toBe(true)
      expect(check.volume).toBeGreaterThan(0)
      expect(componentCount(mesh)).toBe(1)
      expect(pinchedVertices(mesh)).toBe(0)
      // The return faces look down at 40 degrees from the vertical; nothing else looks down above the bed.
      expect(downwardArea(mesh, 1e-3)).toBeGreaterThan(0)
      expect(downwardArea(mesh, 1e-3, Math.cos(45.01 * (Math.PI / 180)))).toBe(0)
      // On the bed, the size its spec says, the stops as tall as the pocket is deep.
      const { min, max } = bounds(mesh.positions)
      expect(min).toEqual([0, 0, 0])
      expect(max[0]).toBeCloseTo(spec.size.x, 4)
      expect(max[1]).toBeCloseTo(spec.size.y, 4)
      expect(max[2]).toBeCloseTo(POCKET_DEPTH, 4)
    }
  })

  it('cuts the drill hole through the centre block and widens it into a 90 degree countersink under the top', () => {
    const spec = clipSpec('standard')
    const mesh = buildClipMesh(spec)
    const cx = spec.size.x / 2
    const cy = spec.size.y / 2
    // Vertices round the hole: the drill hole's radius on the bed, the countersink's at the top.
    const radiiAt = (z: number) => {
      const out: number[] = []
      for (let i = 0; i < mesh.positions.length; i += 3) {
        if (Math.abs(mesh.positions[i + 2] - z) > 1e-4) continue
        const r = Math.hypot(mesh.positions[i] - cx, mesh.positions[i + 1] - cy)
        if (r < COUNTERSINK / 2 + 0.1) out.push(r)
      }
      return out
    }
    for (const r of radiiAt(0)) expect(r).toBeCloseTo(DRILL_HOLE / 2, 3)
    for (const r of radiiAt(CLIP_THICKNESS)) expect(r).toBeCloseTo(COUNTERSINK / 2, 3)
    // 90 degrees: the radius grows as fast as the height.
    expect(holeRadius(CLIP_THICKNESS) - holeRadius(CLIP_THICKNESS - 0.5)).toBeCloseTo(0.5, 12)
    // The tine faces pass the land with PASS; the block alone is FLOAT from it.
    expect(POCKET_OPENING - TINE_OUTER).toBeGreaterThan(POCKET_OPENING - BLOCK_HALF_WIDTH)
  })
})
