// The shape of a piece's top near its sides: the joint edge between tiles and the perimeter profile
// along the edge of the whole surface. The top stays one heightfield,
//
//   z = jointZ(perimeterZ(z0, dp), dj)
//
// where z0 is the plate plus the relief, dp the mitred distance to the nearest profiled surface edge and
// dj the distance to the nearest joint side. The mesher, the normal-map baker and the chip renderer all
// read it through `topShaper`, so the preview and the chips show exactly what gets printed. Pure maths:
// this runs in the geometry worker and in vitest's node environment.

import { cutsRelief, LIMITS } from '../config'
import { hasSide, SIDE_NAMES, sidesMask } from '../sides'
import type { DesignConfig, JointEdgeProfile, PerimeterProfile, PieceEdges, Side, SideName } from '../types'

/** Lowest a perimeter rim may drop, mm above the bed: it is an exposed edge, so it keeps some body. */
export const PERIMETER_RIM_FLOOR = 1.2
/** A band has to leave this much of the surface untouched, mm. */
const BAND_MARGIN = 2
/** Narrowest a clamped profile gets, mm, so its maths never divides by zero. */
const MIN_PROFILE_WIDTH = 0.5
/** Tallest raised frame, mm above the relief peaks. */
const MAX_FRAME_HEIGHT = 4
/** Explicit fade range, mm; 0 in the settings means automatic. */
const FADE_RANGE: [number, number] = [1, LIMITS.fade.max]
/** Automatic fade: twice the relief depth, kept within these bounds, mm. */
const AUTO_FADE: [number, number] = [3, 16]
/** Outside the piece the samplers extrapolate each edge with its rim slope, never steeper than this. */
const SKIRT_SLOPE = 3
/** Grid breaks per quarter arc: joints are small, perimeters wide; both stay under 0.03 mm of chord error. */
const JOINT_ARC_STEPS = 6
const PERIMETER_ARC_STEPS = 8
/** A profiled side at this distance or less from the surface edge is the edge itself, mm. */
const EDGE_EPS = 1e-6

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const smooth = (s: number): number => (s <= 0 ? 0 : s >= 1 ? 1 : s * s * (3 - 2 * s))
/** Quarter circle: 1 at v = 0, 0 at v = 1. */
const arc = (v: number): number => Math.sqrt(Math.max(0, 1 - v * v))

/** Chamfer size actually applied: never more than half the base plate, so the bevel keeps a solid base. */
export function effectiveBevel(config: DesignConfig): number {
  return Math.max(0, Math.min(config.bevel, config.tile.thickness / 2))
}

/**
 * The 45° chamfer as it has always been written. `z` is the unbevelled top height, `d` the distance to
 * the nearest piece edge. The cut follows the local surface so the rim always drops by the full chamfer:
 * measured from the deepest possible relief instead, a flat or shallow texture would lose it entirely.
 */
export function applyBevel(z: number, d: number, thickness: number, bevel: number): number {
  if (bevel <= 0 || d >= bevel) return z
  const capped = z - (bevel - d)
  // Outside the piece (d < 0, central differences at the rim) the chamfer keeps its slope.
  return d >= 0 ? Math.max(capped, thickness - bevel) : capped
}

// ---------------------------------------------------------------------------------------------------
// Joint edge

export interface JointEdge {
  profile: JointEdgeProfile
  /** Drop at the rim, mm; 0 leaves the edge square. */
  size: number
  /** How far in from the side the edge reaches, mm. */
  run: number
}

/** The joint edge a design prints: its size within half the plate and 3 mm, its run within an eighth of the tile. */
export function resolveJointEdge(config: DesignConfig): JointEdge {
  const profile = config.jointEdge
  const s = Math.min(effectiveBevel(config), LIMITS.bevel.max)
  const cap = Math.min(config.tile.width, config.tile.height) / 8
  if (profile === 'square' || !(s > 0)) return { profile, size: 0, run: 0 }
  // The pillow is a round with a four times longer run; clamping that run only makes it steeper.
  if (profile === 'pillow') return { profile, size: s, run: Math.min(4 * s, cap) }
  const size = Math.min(s, cap)
  return { profile, size, run: size }
}

/**
 * Top z at distance `dj` from the nearest joint side. Subtracted from the continuous surface, so both
 * neighbours lose the same groove and the relief still lines up across the joint. `t` is the plate.
 */
export function jointZ(z: number, dj: number, edge: JointEdge, t: number): number {
  const { size: s, run } = edge
  if (!(s > 0) || dj >= run) return z
  // The floor keeps the old chamfer's guard on a relief sitting on the plate, and never lifts a
  // profile that already dropped below it.
  const floor = Math.min(z, t) - s
  if (edge.profile === 'round' || edge.profile === 'pillow') {
    // Vertical at the rim: outside the piece the skirt leans out at the capped slope.
    if (dj < 0) return z - s + SKIRT_SLOPE * dj
    return Math.max(z - s * (1 - arc(1 - dj / run)), floor)
  }
  // Written exactly as applyBevel (s / run is 1 for a 45° chamfer), so a default design is bit-identical.
  const capped = z - (s - dj * (s / run))
  return dj >= 0 ? Math.max(capped, floor) : capped
}

/** Distances from a joint side where the joint edge creases: the mesher puts a grid line on each. */
export function jointBreaks(edge: JointEdge): number[] {
  if (!(edge.size > 0)) return []
  if (edge.profile === 'round' || edge.profile === 'pillow') {
    return arcSines(JOINT_ARC_STEPS)
      .map((sin) => edge.run * (1 - sin))
      .filter((b) => b > 0)
  }
  return [edge.run]
}

/** sin θk for θk = kπ/(2n), k = 0..n: grid breaks spaced evenly in angle along a quarter arc. */
function arcSines(n: number): number[] {
  return Array.from({ length: n + 1 }, (_, k) => Math.sin((k * Math.PI) / (2 * n)))
}

// ---------------------------------------------------------------------------------------------------
// Perimeter profile

/**
 * What narrowed a perimeter profile: 'plate' when its drop would have dug the rim under
 * PERIMETER_RIM_FLOOR (a thicker base, or the land at the peaks, gives it room), 'surface' when its
 * band had to shrink to fit the surface.
 */
export type PerimeterClampReason = 'plate' | 'surface'

export interface ResolvedPerimeter {
  profile: Exclude<PerimeterProfile, 'none'>
  /** Profiled surface sides as a Side mask. */
  sides: number
  /** Width of the profile, mm (for the frame: its flat top). */
  w: number
  /** Drop to the rim (chamfer, bullnose, ogee) or the frame's height above the peaks, mm; 0 for the margin. */
  h: number
  /** Band over which the relief fades into the land, mm; 0 on a design without relief, and 0 when it cuts. */
  F: number
  /**
   * Height of that flat land above the bed: the plate, plus the relief depth at 'peaks'. A cut has no
   * land, and its profile starts from the peaks, so L is the plate plus the relief depth there too.
   */
  L: number
  /** The profile trims the relief rather than flattening it: the top is the lower of the two. */
  cut: boolean
  /** Top of the raised frame above the bed (the land for every other profile). */
  Zf: number
  /** Width of the shaped part, before the fade starts: w, plus the frame's 45° inner slope. */
  shape: number
  /** How far in from the surface edge the profile reaches: shape + F. */
  band: number
  /** The profile came out narrower or lower than asked. */
  clamped: boolean
  /** What limited it; 'plate' wins when both did, since it has a fix (the Sturdy base). */
  reason: PerimeterClampReason | null
}

/** Widest band a surface side can take: half the surface when the opposite side is profiled too. */
function bandLimit(config: DesignConfig, sides: number): number {
  let limit = Infinity
  const axis = (extent: number, a: Side, b: Side) => {
    const count = Number(hasSide(sides, a)) + Number(hasSide(sides, b))
    if (count === 2) limit = Math.min(limit, extent / 2 - BAND_MARGIN)
    else if (count === 1) limit = Math.min(limit, extent - BAND_MARGIN)
  }
  axis(config.surface.width, 3, 1)
  axis(config.surface.height, 0, 2)
  return Math.max(0, limit)
}

/** The perimeter profile a design prints, clamped to the plate and the surface; null when it has none. */
export function resolvePerimeter(config: DesignConfig): ResolvedPerimeter | null {
  const p = config.perimeter
  if (p.profile === 'none') return null
  const sides = sidesMask(p.sides)
  if (sides === 0) return null
  const t = config.tile.thickness
  const D = Math.max(0, config.texture.depth)
  // Only a profile that drops to the rim can trim the relief; a 'cut' anywhere else reads as the valleys.
  const cut = p.land === 'cut' && cutsRelief(p.profile)
  // Written apart from the cut so the 'peaks' and 'valleys' sums stay what they were, bit for bit.
  const L = t + (p.land === 'peaks' || cut ? D : 0)
  let reason: PerimeterClampReason | null = null

  let h = 0
  let Zf = L
  if (p.profile === 'frame') {
    h = clamp(p.drop, 0, MAX_FRAME_HEIGHT)
    Zf = t + D + h
  } else if (p.profile !== 'margin') {
    // The joint groove still crosses the rim where a tile joint meets the edge, so it counts too.
    const room = Math.max(0, L - PERIMETER_RIM_FLOOR - resolveJointEdge(config).size)
    h = Math.max(0, p.drop)
    // The tolerance lets a drop the studio offered back (floored to 0.1 mm) count as fitting, where
    // floating point leaves the room a hair under it (6.6 - 1.2 - 0.5 is 4.8999999999999995).
    if (h > room + 1e-6) {
      h = room
      reason = 'plate'
    }
  }

  let w = Math.max(MIN_PROFILE_WIDTH, p.width)
  // Without relief there is nothing to fade, and a cut never fades: it trims the relief as it stands.
  let F = cut ? 0 : D > 0 ? (p.fade > 0 ? clamp(p.fade, FADE_RANGE[0], FADE_RANGE[1]) : clamp(2 * D, AUTO_FADE[0], AUTO_FADE[1])) : 0
  const rise = p.profile === 'frame' ? Zf - L : 0
  const limit = bandLimit(config, sides)
  if (w + rise + F > limit) {
    // The fade goes first: it is the least visible part of the profile.
    F = Math.max(0, limit - w - rise)
    if (w + rise > limit) w = Math.max(MIN_PROFILE_WIDTH, limit - rise)
    reason ??= 'surface'
  }
  const shape = w + rise
  return { profile: p.profile, sides, w, h, F, L, Zf, shape, band: shape + F, cut, clamped: reason !== null, reason }
}

/**
 * Width of the perimeter band, mm: the shaped part plus the relief fade. A piece side closer than this to a
 * profiled surface edge is shaped by the profile, so the layout tells such pieces apart. 0 without a profile.
 */
export function perimeterBand(config: DesignConfig): number {
  return resolvePerimeter(config)?.band ?? 0
}

/**
 * How far a border profile that drops to the rim takes the top away, measured in from the side it shapes,
 * mm, or 0 when the profile keeps the top at full height ('margin', 'frame') and when there is none. Nothing
 * cut into the back may sit under that band, since the plate over it has gone, so the fixings read it both to
 * refuse a recess there and to judge how wide a piece at a shaped edge has to be to hold one.
 */
export function perimeterDrop(config: DesignConfig): number {
  const p = resolvePerimeter(config)
  return !p || p.profile === 'margin' || p.profile === 'frame' ? 0 : p.shape
}

/**
 * Top z at mitred distance `dp` from the profiled surface edge. Across the fade the relief eases (a
 * smoothstep, flat at both ends) into a flat land at L; the profile then runs from L to the rim.
 * Negative `dp` lies outside the piece: the profile goes on at its rim slope, for the normals there.
 * A cut has no fade and no land: the top is the lower of the relief and the profile, so it only ever
 * takes material away and every dip in the relief stays open to the rim. topShaper then adds the joint
 * edge along the rim, so a cut piece never stands above the same piece printed with no profile.
 */
export function perimeterZ(z0: number, dp: number, e: ResolvedPerimeter): number {
  const { profile, w, h, F, L, Zf, shape } = e
  // A frame never cuts (resolvePerimeter); testing it only narrows the type.
  if (e.cut && profile !== 'frame') return dp >= shape ? z0 : Math.min(z0, profileCurve(profile, dp, w, h, L))
  if (dp >= shape + F) return z0
  if (dp >= shape) return F > 0 ? L + smooth((dp - shape) / F) * (z0 - L) : z0
  if (profile === 'frame') return dp <= w ? Zf : Zf - (dp - w) // 45° inner slope down to the land
  return profileCurve(profile, dp, w, h, L)
}

/** The profile from its land L down to the rim at `dp` (below `w`), and past the rim its skirt. */
function profileCurve(profile: Exclude<PerimeterProfile, 'none' | 'frame'>, dp: number, w: number, h: number, L: number): number {
  if (dp < 0) {
    // Rim slopes: the margin and the ogee's lip are flat, the chamfer keeps its own, the bullnose is vertical.
    const slope = profile === 'chamfer' ? Math.min(h / w, SKIRT_SLOPE) : profile === 'bullnose' ? SKIRT_SLOPE : 0
    return (profile === 'margin' ? L : L - h) + slope * dp
  }
  const u = dp / w
  switch (profile) {
    case 'margin':
      return L
    case 'chamfer':
      return L - h * (1 - u)
    case 'bullnose':
      // Vertical at the rim, so the edge rolls over into the side wall.
      return L - h * (1 - arc(1 - u))
    case 'ogee':
      // A convex roll from the land, then a concave sweep into a flat lip; the halves meet vertically at u = 0.5.
      return u >= 0.5 ? L - 0.5 * h * (1 - arc(2 - 2 * u)) : L - 0.5 * h - 0.5 * h * arc(2 * u)
  }
}

/** Distances from the surface edge where a profile creases, fade included: grid lines go on each. */
export function perimeterBreaks(e: ResolvedPerimeter, joint: JointEdge): number[] {
  const { profile, w, F, shape } = e
  const out: number[] = []
  if (profile === 'margin' || profile === 'chamfer') out.push(w)
  else if (profile === 'bullnose') out.push(...arcSines(PERIMETER_ARC_STEPS).map((sin) => w * (1 - sin)))
  else if (profile === 'ogee') {
    const sines = arcSines(PERIMETER_ARC_STEPS)
    out.push(...sines.map((sin) => w * (1 - sin / 2)), ...sines.map((sin) => (w / 2) * sin))
  } else out.push(w, shape)
  out.push(shape + F)
  // The flat profiles and a cut keep the joint edge along the surface edge too (topShaper's `outer`).
  if (profile === 'margin' || profile === 'frame' || e.cut) out.push(...jointBreaks(joint))
  return [...new Set(out.filter((b) => b > 0))].sort((a, b) => a - b)
}

// ---------------------------------------------------------------------------------------------------
// One piece

/**
 * Top z at one point of a piece from its unshaped height `z0` and its distances to the piece's four sides,
 * in Side order (bottom, right, top, left). A negative distance lies outside the piece: the skirt that
 * central-difference normals and the chips' one-pixel border read.
 */
export type TopShaper = (z0: number, bottom: number, right: number, top: number, left: number) => number

/**
 * Offset of each side to a profiled surface edge, in Side order; undefined for a side the profile leaves
 * alone. A piece side faces the surface side of the same name, so a side switched off since the layout
 * was computed is left alone too.
 */
function profiledOffsets(perimeter: ResolvedPerimeter | null, edges: PieceEdges | undefined): (number | undefined)[] {
  return SIDE_NAMES.map((name, side) =>
    perimeter && edges && hasSide(perimeter.sides, side as Side) ? edges.profiled[name] : undefined,
  )
}

/**
 * The shaper of one piece. A side on a profiled surface edge carries the perimeter profile; every other
 * side, a switched-off surface side included, carries the joint edge. A side a short distance from a
 * profiled edge (a narrow cut lies between) is a joint that the profile also spills onto.
 */
export function topShaper(config: DesignConfig, edges?: PieceEdges): TopShaper {
  const t = config.tile.thickness
  const joint = resolveJointEdge(config)
  const perimeter = resolvePerimeter(config)
  const offsets = profiledOffsets(perimeter, edges)
  if (!perimeter || offsets.every((o) => o === undefined)) {
    return (z0, bottom, right, top, left) => jointZ(z0, Math.min(left, right, bottom, top), joint, t)
  }
  // Infinity takes a side out of a minimum without a branch per sample.
  const [pB, pR, pT, pL] = offsets.map((o) => (o === undefined ? Infinity : o))
  const [jB, jR, jT, jL] = offsets.map((o) => (o === undefined || o > EDGE_EPS ? 0 : Infinity))
  // The flat profiles and a cut keep the joint edge on their outer edge, so a cut never stands above the
  // tile printed with no profile; a dropping profile over a flat land replaces it with its own.
  const outer = perimeter.profile === 'margin' || perimeter.profile === 'frame' || perimeter.cut
  const band = perimeter.band
  return (z0, bottom, right, top, left) => {
    // The mitre: the nearest profiled side wins, so two sides meet on the 45° diagonal.
    const dp = Math.min(bottom + pB, right + pR, top + pT, left + pL)
    const dj = Math.min(bottom + jB, right + jR, top + jT, left + jL)
    const z = dp < band ? perimeterZ(z0, dp, perimeter) : z0
    return jointZ(z, outer ? Math.min(dj, dp) : dj, joint, t)
  }
}

/** Grid breaks along one axis of a piece, measured in from each end. */
export interface AxisBreaks {
  low: number[]
  high: number[]
  /** A profile crosses this axis: where the two ends' bands overlap, keep every break rather than a plain grid. */
  union: boolean
}

/** Breaks measured in from one side of a piece. */
function sideBreaks(offset: number | undefined, joint: number[], profile: number[]): number[] {
  if (offset === undefined) return joint
  const shifted = profile.map((b) => b - offset).filter((b) => b > 0)
  return offset > EDGE_EPS ? [...joint, ...shifted].sort((a, b) => a - b) : shifted
}

/**
 * Where the top of a piece creases, per axis: x from its left and right sides, y from its bottom and top.
 * The x lists depend only on the column (width, left, right) and the y lists only on the row, so two
 * neighbours across a joint keep the same lines along it and their rim samples stay identical.
 */
export function pieceAxisBreaks(config: DesignConfig, edges?: PieceEdges): { x: AxisBreaks; y: AxisBreaks } {
  const joint = resolveJointEdge(config)
  const perimeter = resolvePerimeter(config)
  const own = jointBreaks(joint)
  const profile = perimeter ? perimeterBreaks(perimeter, joint) : []
  const [bottom, right, top, left] = profiledOffsets(perimeter, edges)
  const breaks = (offset: number | undefined) => sideBreaks(offset, own, profile)
  return {
    x: { low: breaks(left), high: breaks(right), union: left !== undefined || right !== undefined },
    y: { low: breaks(bottom), high: breaks(top), union: bottom !== undefined || top !== undefined },
  }
}

/** The profiled offsets that actually shape a piece, by side name; empty for a piece the profile leaves alone. */
export function shapingEdges(config: DesignConfig, edges?: PieceEdges): Partial<Record<SideName, number>> {
  const out: Partial<Record<SideName, number>> = {}
  profiledOffsets(resolvePerimeter(config), edges).forEach((offset, side) => {
    if (offset !== undefined) out[SIDE_NAMES[side]] = offset
  })
  return out
}
