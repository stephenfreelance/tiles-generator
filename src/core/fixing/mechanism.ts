// The wall clip's working section: the printed clip and the pocket in the back of a tile it sits in,
// designed together. The clip lies flat on the wall (printed flat on its back, wall side on the bed) and
// lives wholly inside a closed pocket, so nothing but the tape under the clips stands between the tile's back
// and the wall. Its spring is in the plane of the wall: four tines, two along each long edge, fold in towards
// a middle spine as their barbs pass the pocket's lip, and spring out under it. Pure maths: no DOM, no three.
//
// Coordinates. The clip's own frame: x along it (its long axis), y across it (across the catch), z up from
// its back (the face on the wall). The tile frame: the same x and y, z up from the tile's back. A clip clicked
// into its pocket has its back level with the tile's back, so the two frames meet at z = 0 (a drooping
// ceiling stands the clip proud of the tile's back by its droop, SAG_RANGE). The section is symmetric about
// y = 0 and about x = 0.
//
// The pocket, printed face up with the tile so it opens at the bed, from the tile's back up (y > 0 side):
//
//   z ^   ____________________  ceiling (flat, bridged), POCKET_DEPTH; the clip's stops bear on it
//     |                     /   flare: the void widens upward at FLARE_ANGLE from the pull axis
//     |          barb ->   /|     (a face looking up: always printable)
//     |   ________________/ |   ridge at POCKET_RIDGE, half-width POCKET_OPENING (the lip's top)
//     |                   | |   land: vertical, one layer
//     |   _______________/  |   mouth: 45 degree lead-in (it takes the first layers' elephant foot)
//  0 -+----------------------------> y   the tile's back
//
// Each barb's return face runs parallel to the flare, PRELOAD further out at zero clearance with the clip's
// back level with the tile's back, so a clicked-in barb bears on the flare and its tine pulls the clip deeper
// into the pocket, until the clip's two stops meet the ceiling: the clip is clamped between its barbs and its
// stops (clipChecks).
//
// Why stops, and why the tape is not in the checks. Inside a closed pocket only the ceiling looks towards the
// wall; the flare only ever pulls the clip deeper. Without stops a clicked-in clip would rest where its barbs
// stop folding, some tenths of a millimetre inside the tile's back, and the tape on it could never both reach
// the wall and let the tile's back come down to it. So the centre block carries two permanent stops,
// STOP_HEIGHT tall, that meet the ceiling when the clip's back is level with the tile's back. Clicked in, the
// tape on the clip's back stands proud of the tile by its own thickness, meets the wall first and is pressed on
// through the stops. That is also how the tile stays: its barbs pull it towards the wall, the stops and the
// tape hold it off by the tape's thickness. Clicked in is therefore the one seated state, on the wall or off
// it: the clip's place in its pocket is set by the stops whatever the tape, the checks run over the fit
// classes and the ceiling's droop, and the tape only sets the gap behind the tile (wallGap).
//
// Where the stops stand. The ceiling is a bridge across the pocket's short side, anchored on its long walls,
// and a bridge droops least next to its anchors. The stops run along the centre block's two long edges, as
// near those walls as a block that must pass the land can reach: 4.95 to 6.15 mm off the centre line
// (STOP_OFFSET, STOP_WIDTH) under a ceiling 8.01 mm to each wall (POCKET_HALF_SHORT). A flat stop meets a
// drooping ceiling first at its inner edge, over 60 % of the way out, where a bridge droops 0.4 to 0.6 of its
// middle's droop (a plate held along both walls, a sagging strand's parabola). On the block they also sit
// right under the press that puts the tape on, so it goes straight through the block to the tape, not
// through the spine. The checks take no credit for any of that: the stops' droop runs over the
// whole SAG_RANGE, and the middle of the span over the clip's body droops by the most of it. A droop where
// the stops bear stands the clip proud by that much, which adds to the preload and takes from the catch.
//
// How it behaves, qualitatively (no force figure is claimed anywhere; the fit test is the measurement):
// - Clicking in: the mouth chamfer and each barb's top chamfer fold the tines in; past the ridge the barbs
//   spring out under it and their return faces bear on the flare.
// - Pulling off: the return faces ride down the flare, folding the tines in until the barbs slip past the
//   ridge. The 40 degree face makes that a firm pull (Bayer's ramp factor about 1.5, PLA on PLA).
// - Pushing a tile back onto clips left on the wall folds the tines as clicking in does, their lift towards
//   the wall stopped a tape's thickness down, so the click-in check bounds it.
// - The tile's weight hangs on the clip's centre block, which alone reaches the pocket's lips (FLOAT, less
//   than the tines' PASS); the tines only hold the tile towards the wall.
// - The clip is printed flat, so a barb pushed by a sloped face also bends its tine out of the wall's plane
//   (the engineering report's "lift"). Both bendings peak at the same corner of the tine's root, so the checks
//   add the two strains.

import { ringFromRect } from '../geometry/polygon'
import type { FitClass } from '../types'
import type { BackFeatureLevel } from './types'

const DEG = Math.PI / 180

// ---------------------------------------------------------------------------------------------------
// Fit, droop, tape and limits

/**
 * Clearance of a clip for each fit class, mm: it moves the barbs (return face, tip and top chamfer) in by
 * this much and nothing else, so the tines' stiffness stays as designed. Pockets never depend on it, so a
 * wrong fit is fixed by reprinting clips, never a tile. Snug to loose span the printers the fit test sorts.
 */
export const CLIP_CLEARANCE: Record<FitClass, number> = { snug: 0.12, standard: 0.2, loose: 0.28 }
const CLEARANCES = Object.values(CLIP_CLEARANCE)
/** The clearance range the fit classes span: the snuggest and the loosest. */
export const CLEARANCE_RANGE: readonly [number, number] = [Math.min(...CLEARANCES), Math.max(...CLEARANCES)]

/** The least a barb may hold on by, mm, at every fit and droop: a smaller catch lets go by itself. */
export const MIN_CATCH = 0.5

/** PLA's strain limit for a tine that flexes every time a tile goes on or comes off: its fatigue-safe range. */
export const MAX_ARM_STRAIN = 0.02

/** PLA on PLA, dry: the friction in Bayer's ramp factor. */
export const FRICTION = 0.3

/**
 * How far the pocket's bridged ceiling may droop where the stops bear on it, mm: from a clean bridge to a
 * droopy one over the pocket's short span. The checks hold over the whole range, and the middle of the span,
 * which droops most, is taken to droop the most of it (ceilingGap).
 */
export const SAG_RANGE: readonly [number, number] = [0, 0.2]

/**
 * Thin double-sided tape (film or carpet tape, never foam) as makers buy it: 0.2 mm nominal, 0.1 to 0.3 mm
 * over the brands. It lies between the clip's centre block and the wall and sets nothing but the gap behind
 * the tile (wallGap), because the stops fix where the clip sits in its pocket. The fit test is read with the
 * maker's own tape all the same: it is what holds each clip on the wall while its tile is pulled off.
 */
export const TAPE_NOMINAL = 0.2
export const TAPE_RANGE: readonly [number, number] = [0.1, 0.3]

// ---------------------------------------------------------------------------------------------------
// Pocket (in the back of the tile, printed face up so it opens at the bed)

/** Depth of the pocket's flat, bridged ceiling, mm: it leaves POCKET_COVER of plate at the 4 mm base, and never grows with a thicker plate, so one clip fits every design. */
export const POCKET_DEPTH = 2.8
/** Least plate over the pocket's ceiling, mm: a bridge plus solid layers under the relief's lowest valley. */
export const POCKET_COVER = 1.2
/** Thinnest base plate this pocket fits: its depth plus the cover, mm. */
export const MIN_BASE = POCKET_DEPTH + POCKET_COVER
/** Height of the 45 degree mouth chamfer, mm: the push-on lead-in, and room for the first layers' elephant foot. */
export const POCKET_MOUTH = 0.8
/** Height of the vertical land above the mouth, mm: one layer, so the ridge is not a knife edge. */
export const POCKET_LAND = 0.2
/** Height of the ridge the barbs catch under: the top of the lip, mm. */
export const POCKET_RIDGE = POCKET_MOUTH + POCKET_LAND
/**
 * Angle of the flare, and of each barb's return face, from the pull direction (the wall's normal),
 * degrees. 30 to 45 degrees releases under a firm pull (a flat 90 degree catch never would); 40 keeps the
 * tine's lift at release, which grows with the angle, well inside the corner strain limit, and the return
 * face, an overhang as the clip prints, within 45 degrees of the vertical with room to spare.
 */
export const FLARE_ANGLE = 40
/** Angle of the mouth chamfer and of the barbs' top chamfers from the push direction, degrees: 45 prints both ways. */
export const LEAD_ANGLE = 45
/** Half-width of the pocket's land across the catch, mm: the clip's centre block and tines pass through it. */
export const POCKET_OPENING = 6.5
/** Room at each end of the clip along its length, mm: print tolerance, and how far a tile on turned clips settles under its weight. */
export const END_FLOAT = 0.3

// ---------------------------------------------------------------------------------------------------
// Clip

/**
 * Thickness of the clip's body, mm: whole 0.2 mm layers; deep enough that each barb keeps a top chamfer for
 * the lead-in above a tip that sits CATCH - PRELOAD up the flare (2.2 leaves too little at the snug fit), and
 * shallow enough to leave the stops two layers, which clear the ceiling's droop over the body (ceilingGap).
 */
export const CLIP_THICKNESS = 2.4
/** Width of a tine across the catch, mm: three 0.4 mm lines. */
export const TINE_WIDTH = 1.2
/**
 * Free length of a tine, from the centre block to its barb, mm: long enough that the fold and the lift
 * together stay under MAX_ARM_STRAIN at the snug fit with margin (14 mm would leave under 0.1 % of it).
 */
export const TINE_LENGTH = 15
/** Length of a barb along the clip, mm. */
export const BARB_LENGTH = 4
/** Half-length of the centre block, mm: the screw hole's countersink and the stops fit on it with sound walls. */
export const BLOCK_HALF_LENGTH = 5
/**
 * How far the clip may sit off-centre across its pocket, mm: the centre block is this much narrower than
 * the land each side. The tile's weight takes it up (the block bears on the upper lip), and a clip screwed
 * after the tape shifts at most this far when its countersunk head centres it.
 */
export const FLOAT = 0.15
/** Clearance between a tine's outer face and the land, mm: more than FLOAT, so only the block bears the tile's weight. */
export const PASS = 0.2
/**
 * How far a barb reaches past the ridge at zero clearance, mm. A barb bearing on the flare holds by
 * CATCH - PRELOAD less what the ceiling's droop takes (SAG_RANGE[1] x tan FLARE_ANGLE), one the float lifts
 * off the flare by CATCH less the loosest clearance and FLOAT. 0.97 keeps both over MIN_CATCH with a little
 * to spare, and no more, since every bit of it is fold the tines take on the way in and out.
 */
export const CATCH = 0.97
/**
 * How far a return face stands outside the flare at zero clearance with the clip's back level with the tile's
 * back, mm: the loosest fit's clearance, so every fit bears on the flare with its stops on the ceiling. The
 * snug and standard fits clamp the clip against its stops (no rattle), the loose one just touches; a droop
 * adds to all three.
 */
export const PRELOAD = 0.28
/** Vertical flat at a barb's tip, mm: one layer, so the tip prints blunt instead of as a feather edge. */
export const BARB_TIP = 0.2
/** Room for a tine to fold in before it meets the spine, mm: more than any release fold, and the spine then stops it. */
export const SLOT = 1.3
/**
 * The hole through the centre block: a 5 mm drill and wall plug pass through it (so the clip is its own
 * drill guide), and a 3.5 mm countersunk screw's 90 degree head, about 7 mm across, seats in the
 * countersink below the clip's top, clear of the pocket's ceiling. Diameters, mm.
 */
export const DRILL_HOLE = 5.3
export const COUNTERSINK = 7.5
/** Straight segments round the hole and its countersink. Fixed, so the solid is the same for every clip. */
export const HOLE_SEGMENTS = 24
/**
 * The two stops on the centre block (see the header): permanent ribs along the clip, one on each long edge of
 * the block, standing from the clip's top to the pocket's ceiling. Three 0.4 mm lines wide, so they print
 * solid and bear the press that puts the tape on; set in from the block's long faces by a hair so the top face
 * closes round them, and short of the block's ends so they never meet the tines' slots. Width, inset from the
 * block's long face and half-length along the clip, mm.
 */
export const STOP_WIDTH = 1.2
export const STOP_INSET = 0.2
export const STOP_HALF_LENGTH = 4.5
/** Fit-test marks: V notches this wide and deep in the spine's end, this far apart, mm. */
export const MARK_WIDTH = 0.8
export const MARK_DEPTH = 0.5
export const MARK_PITCH = 1.6

// ---------------------------------------------------------------------------------------------------
// Margins the checks hold

/** Least room between the clip's body and the ceiling where the ceiling droops most, mm: half a layer, for a bridge's rough underside. */
export const CEILING_ROOM = 0.1
/** Lead-in the mouth and top chamfers keep beyond the widest barb, mm: a barb must land on a slope, never on the flat back. */
export const LEAD_MARGIN = 0.1
/** Room between a sprung-out barb (floated, zero clearance) and the flare at the ceiling, mm. */
export const FLARE_ROOM = 0.3
/** Least wall round the countersink in the centre block, mm, and between it and each stop. */
export const MIN_BLOCK_WALL = 1

// ---------------------------------------------------------------------------------------------------
// Derived section

const TAN_FLARE = Math.tan(FLARE_ANGLE * DEG)
const TAN_LEAD = Math.tan(LEAD_ANGLE * DEG)

/** Outer face of a tine, across the catch. */
export const TINE_OUTER = POCKET_OPENING - PASS
/** Half-width of the centre block. */
export const BLOCK_HALF_WIDTH = POCKET_OPENING - FLOAT
/** Half-width of the spine the tines fold towards. */
export const SPINE_HALF = TINE_OUTER - TINE_WIDTH - SLOT
/** Half-length of the clip: block, tine, barb. */
export const CLIP_HALF_LENGTH = BLOCK_HALF_LENGTH + TINE_LENGTH + BARB_LENGTH
/** Where each barb starts along the clip, from its centre. */
export const BARB_START = BLOCK_HALF_LENGTH + TINE_LENGTH
/** How far the flare has widened at the ceiling, each side. */
export const FLARE_OUT = (POCKET_DEPTH - POCKET_RIDGE) * TAN_FLARE
/** Half-length of the pocket's land along the clip. */
export const POCKET_LAND_HALF_LENGTH = CLIP_HALF_LENGTH + END_FLOAT
/** Half-extents of the pocket's footprint over all its levels: along the clip, and across it (the ceiling's half-width). */
export const POCKET_HALF_LONG = POCKET_LAND_HALF_LENGTH + Math.max(POCKET_MOUTH, FLARE_OUT)
export const POCKET_HALF_SHORT = POCKET_OPENING + Math.max(POCKET_MOUTH, FLARE_OUT)
/** Heights of a barb's tip (clip frame): where the return face reaches it, and the tip flat's top. */
export const BARB_TIP_LOW = POCKET_RIDGE + (CATCH - PRELOAD) / TAN_FLARE
export const BARB_TIP_HIGH = BARB_TIP_LOW + BARB_TIP
/** Height of each barb's 45 degree top chamfer, the clip's half of the push-on lead-in. */
export const TOP_CHAMFER = CLIP_THICKNESS - BARB_TIP_HIGH
/** Height of the stops above the clip's top: they reach the ceiling with the clip's back level with the tile's back. */
export const STOP_HEIGHT = POCKET_DEPTH - CLIP_THICKNESS
/** Distance of each stop's middle from the clip's centre line, across the catch: as far out as the block allows. */
export const STOP_OFFSET = BLOCK_HALF_WIDTH - STOP_INSET - STOP_WIDTH / 2
/** Where the countersink meets the drill hole, from the clip's back. */
export const COUNTERSINK_START = CLIP_THICKNESS - (COUNTERSINK - DRILL_HOLE) / 2

/** Where a return face meets its tine's outer face, from the clip's back, at a clearance. */
export function returnFaceLow(clearance: number): number {
  return POCKET_RIDGE - (PRELOAD - clearance + PASS) / TAN_FLARE
}

/** A barb's outer edge across the catch at height z of the clip (its back at 0), at a clearance. */
export function barbOuter(z: number, clearance: number): number {
  const tip = POCKET_OPENING + CATCH - clearance
  if (z <= returnFaceLow(clearance)) return TINE_OUTER
  if (z <= BARB_TIP_LOW) return POCKET_OPENING + PRELOAD - clearance + (z - POCKET_RIDGE) * TAN_FLARE
  if (z <= BARB_TIP_HIGH) return tip
  return tip - (z - BARB_TIP_HIGH) / TAN_LEAD
}

/**
 * The +y barb's outer edge from the clip's back to its top, (y, z) pairs at a clearance: the tine's face,
 * the return face, the tip and the top chamfer. For the drawings, and what the checks measure.
 */
export function barbProfile(clearance: number): number[] {
  const low = returnFaceLow(clearance)
  return [TINE_OUTER, 0, TINE_OUTER, low, barbOuter(BARB_TIP_LOW, clearance), BARB_TIP_LOW, barbOuter(BARB_TIP_HIGH, clearance), BARB_TIP_HIGH, barbOuter(CLIP_THICKNESS, clearance), CLIP_THICKNESS]
}

/** The pocket's +y wall from the tile's back to the ceiling, (y, z) pairs in the tile frame: mouth, land, flare. */
export function pocketProfile(): number[] {
  return [POCKET_OPENING + POCKET_MOUTH, 0, POCKET_OPENING, POCKET_MOUTH, POCKET_OPENING, POCKET_RIDGE, POCKET_OPENING + FLARE_OUT, POCKET_DEPTH]
}

/** The pocket's half-width across the catch at height z of the tile frame. */
export function pocketHalfWidth(z: number): number {
  if (z <= POCKET_MOUTH) return POCKET_OPENING + (POCKET_MOUTH - z) / TAN_LEAD
  if (z <= POCKET_RIDGE) return POCKET_OPENING
  return POCKET_OPENING + (z - POCKET_RIDGE) * TAN_FLARE
}

/**
 * How far the tile's back stands off the wall on its clips, mm: the tape under each clip, and any droop of the
 * ceiling where the stops bear (the clip then stands that much proud of the tile's back). The tape sets
 * nothing else: the clip's place in its pocket, and so every check, is the stops'.
 */
export function wallGap(tape: number, sag = 0): number {
  return tape + sag
}

// ---------------------------------------------------------------------------------------------------
// Strain and checks

/** Bayer's ramp factor: the push or pull along the wall's normal over the fold force a face at `angle` from it needs. */
export function rampFactor(angle: number, mu = FRICTION): number {
  const t = Math.tan(angle * DEG)
  return (mu + t) / (1 - mu * t)
}

/**
 * Length the tine's root strain is worked out over, mm: from the end of the slot's round root (the
 * fillet, SLOT / 2) to the barb's near end, the nearest a barb is ever pushed. Shorter than the tine's
 * middle-of-barb length, so the strains below are an upper bound.
 */
const STRAIN_LENGTH = TINE_LENGTH - SLOT / 2

/** Peak strain of a straight cantilever `h` thick whose end moves `deflection` across it: 1.5 h y / L^2. */
function bendStrain(h: number, deflection: number): number {
  return (1.5 * h * deflection) / (STRAIN_LENGTH * STRAIN_LENGTH)
}

/**
 * Out-of-plane lift of a barb while a face at `angle` folds it by `fold`, mm. The face pushes along the
 * wall's normal `rampFactor` times harder than across the catch; the tine is TINE_WIDTH wide across the
 * catch and CLIP_THICKNESS deep along the normal, so its two stiffnesses stand as (w / t)^2, and the lift
 * is the fold times the ramp factor times that ratio.
 */
function lift(fold: number, angle: number): number {
  return fold * rampFactor(angle) * (TINE_WIDTH / CLIP_THICKNESS) ** 2
}

/** Root strain of a tine folded by `fold` and lifted by `rise`: the two bendings peak at one corner, so they add. */
function cornerStrain(fold: number, rise: number): number {
  return bendStrain(TINE_WIDTH, fold) + bendStrain(CLIP_THICKNESS, rise)
}

/** Every engineering check of the clip at a clearance and a ceiling droop, as numbers the tests hold to their limits. */
export interface ClipChecks {
  /** Clicking a clip into its pocket: fold across the catch plus a free lift towards its back. Centred, and pushed in off-centre by FLOAT. */
  pushStrain: number
  pushStrainOffCentre: number
  /** Pulling a tile off: the fold plus the lift the return face adds (the release corner). */
  releaseStrain: number
  /** Clicked in: the strain held for as long as the clip sits in its tile (preload, plus FLOAT where the tile's weight shifts it). */
  heldStrain: number
  /** Clicked in, off-centre by FLOAT: how far the barbs still reach past the ridge, the least of the two sides. */
  catch: number
  /** A barb sprung fully out, off-centre by FLOAT: what holds a barb the float lifts off the flare. */
  freeCatch: number
  /** Clicked in, centred: how far each return face stands outside the flare (> 0: clamped against the stops, no rattle). */
  preload: number
  /** Clicked in: room between the clip's body and the ceiling in the middle of its span, drooped by the most of SAG_RANGE. */
  ceilingGap: number
  /** Clicked in: how far the clip's back stands out of the tile's back (never into it, so the tape meets the wall first). */
  backProud: number
  /** How far the two lead-ins together reach beyond the widest barb (snug, off-centre); at least LEAD_MARGIN. */
  leadIn: number
  /** Room at the ceiling beyond a sprung-out barb at zero clearance, off-centre; at least FLARE_ROOM. */
  flareRoom: number
  /** Clearances where parts pass or must not touch, mm; every one must be positive. */
  clearances: Record<string, number>
}

/**
 * The clip's checks at a clearance, its stops on a ceiling that droops by `sag` where they bear (the clip
 * then stands `sag` proud of the tile's back, its barbs that much lower on the flare). No tape: clicked in is
 * the seated state, wherever the clip is.
 */
export function clipChecks(clearance: number, sag = 0): ClipChecks {
  const c = clearance
  // The return faces' overlap with the flare, centred: lowered down the narrowing flare by the droop.
  const preload = PRELOAD - c + sag * TAN_FLARE
  // The most a tine ever folds: clicked in off-centre, or pulled off from the side the float pushed in.
  const fold = CATCH - c + FLOAT
  return {
    pushStrain: cornerStrain(CATCH - c, lift(CATCH - c, LEAD_ANGLE)),
    pushStrainOffCentre: cornerStrain(fold, lift(fold, LEAD_ANGLE)),
    releaseStrain: cornerStrain(fold, lift(fold, FLARE_ANGLE)),
    heldStrain: bendStrain(TINE_WIDTH, Math.max(0, preload) + FLOAT),
    // A barb on the flare holds by its tip's height up it, CATCH - c - preload, however far the float folds
    // it; the float lifts the other side's barb off the flare once it outruns the preload.
    catch: CATCH - c - Math.max(preload, FLOAT),
    freeCatch: CATCH - c - FLOAT,
    preload,
    ceilingGap: POCKET_DEPTH - SAG_RANGE[1] - (CLIP_THICKNESS - sag),
    // The stops' tops on the drooped ceiling set the clip's back: level with the tile's back, or proud by the droop.
    backProud: CLIP_THICKNESS + STOP_HEIGHT - (POCKET_DEPTH - sag),
    leadIn: POCKET_MOUTH + TOP_CHAMFER - (CATCH - c + FLOAT),
    flareRoom: FLARE_OUT - (CATCH + FLOAT),
    clearances: {
      // The block and the tines pass the land; the block alone bears on it.
      blockThroughLand: POCKET_OPENING - BLOCK_HALF_WIDTH,
      tineThroughLand: POCKET_OPENING - TINE_OUTER,
      blockBearsFirst: PASS - FLOAT,
      // The clip's ends pass the land's ends.
      endFloat: POCKET_LAND_HALF_LENGTH - CLIP_HALF_LENGTH,
      // A releasing tine folds short of the spine.
      foldRoom: SLOT - fold,
      // The return face starts on the tine above the clip's back, and the tip ends below its top.
      returnFaceAboveBack: returnFaceLow(c),
      tipBelowTop: CLIP_THICKNESS - BARB_TIP_HIGH,
      // The barbs' tips stay up in the flare, past the ridge, with the clip standing proud by the droop.
      tipAboveRidge: BARB_TIP_LOW - sag - POCKET_RIDGE,
      // Sound walls round the countersink, and between it and each stop.
      countersinkWallAcross: BLOCK_HALF_WIDTH - COUNTERSINK / 2 - MIN_BLOCK_WALL,
      countersinkWallAlong: BLOCK_HALF_LENGTH - COUNTERSINK / 2 - MIN_BLOCK_WALL,
      stopBesideCountersink: STOP_OFFSET - STOP_WIDTH / 2 - COUNTERSINK / 2 - MIN_BLOCK_WALL,
      // The stops stand on the block: inside its long faces, short of its ends.
      stopInsideBlock: BLOCK_HALF_WIDTH - (STOP_OFFSET + STOP_WIDTH / 2),
      stopAlongBlock: BLOCK_HALF_LENGTH - STOP_HALF_LENGTH,
      // The screw's head, about 7 mm across, ends below the clip's top.
      headBelowTop: (COUNTERSINK - 7) / 2,
    },
  }
}

// ---------------------------------------------------------------------------------------------------
// Outlines

/** Straight segments round the slot's round root: enough to read as round at a 0.4 mm nozzle. */
const ROOT_SEGMENTS = 4
/** Length of the short taper from a tine's face out to the block's (FLOAT is narrower than PASS), mm: no sharp step at the root. */
const ROOT_TAPER = 0.5

/**
 * The clip's outline in plan at height z of the clip (0 to CLIP_THICKNESS), counter-clockwise, centred on
 * the origin, x along the clip. Every height has the same vertex count: only the four barbs' outer
 * vertices move with z (barbOuter), and below the return face they lie on the tine's face, where the
 * barb's inner end then has no length (two vertices at one point; the clip's mesher skips that edge).
 * `marks` (0 to 3) cuts that many V notches in the spine's +x end, how the fit test's clips are told apart.
 */
export function clipOutlineAt(z: number, clearance: number, marks = 0): number[] {
  const y = barbOuter(z, clearance)
  const r = SLOT / 2
  const root = BLOCK_HALF_LENGTH + r
  // The upper half, from the +x end of the spine to the -x end, walking left along the top.
  const half: number[] = [CLIP_HALF_LENGTH, SPINE_HALF, root, SPINE_HALF]
  // The slot's round root, clockwise round the slot (the solid on the left).
  for (let i = 1; i < ROOT_SEGMENTS; i++) {
    const a = -Math.PI / 2 - (i / ROOT_SEGMENTS) * Math.PI
    half.push(root + r * Math.cos(a), SPINE_HALF + r + r * Math.sin(a))
  }
  const inner = SPINE_HALF + SLOT
  // Out along the tine's inner face, up the barb's end, back along its outer face, down its inner end, and
  // along the tine's outer face to the block.
  half.push(root, inner, CLIP_HALF_LENGTH, inner, CLIP_HALF_LENGTH, y, BARB_START, y, BARB_START, TINE_OUTER)
  half.push(BLOCK_HALF_LENGTH + ROOT_TAPER, TINE_OUTER, BLOCK_HALF_LENGTH, BLOCK_HALF_WIDTH)
  // The -x half of the top is the mirror of the +x half, walked the other way.
  const upper = [...half]
  for (let k = half.length - 2; k >= 0; k -= 2) upper.push(-half[k], half[k + 1])
  // The +x end of the spine, bottom to top, with the fit marks; then the top; then the bottom, its mirror.
  const out: number[] = []
  const count = Math.max(0, Math.min(3, Math.round(marks)))
  for (let m = 0; m < count; m++) {
    const v = (m - (count - 1) / 2) * MARK_PITCH
    out.push(CLIP_HALF_LENGTH, v - MARK_WIDTH / 2, CLIP_HALF_LENGTH - MARK_DEPTH, v, CLIP_HALF_LENGTH, v + MARK_WIDTH / 2)
  }
  out.push(...upper)
  for (let k = upper.length - 2; k >= 0; k -= 2) out.push(upper[k], -upper[k + 1])
  return out
}

/** The clip's outline in plan at its widest (the barbs' tips), for the drawings. */
export function clipPlan(clearance: number, marks = 0): number[] {
  return clipOutlineAt(BARB_TIP_LOW, clearance, marks)
}

/** The two stops in plan, [x0, y0, x1, y1] each, -y first: on the centre block's long edges, centred along it. */
export function stopRects(): [number, number, number, number][] {
  return [-1, 1].map((side) => {
    const y0 = side * STOP_OFFSET - STOP_WIDTH / 2
    return [-STOP_HALF_LENGTH, y0, STOP_HALF_LENGTH, y0 + STOP_WIDTH]
  })
}

/** Radius of the screw hole at height z of the clip: the drill hole, then the 90 degree countersink. */
export function holeRadius(z: number): number {
  return z <= COUNTERSINK_START ? DRILL_HOLE / 2 : DRILL_HOLE / 2 + (z - COUNTERSINK_START)
}

/**
 * The pocket's levels at a centre, piece-local mm: the 45 degree mouth narrowing to the land, the land,
 * then the flare widening to the flat ceiling. `axis` 'h' lays the clip along x, 'v' along y. The flare
 * is a void that widens upward, so its walls look up as the tile prints face up; the ceiling is the only
 * face that looks down, a bridge across the pocket's short side.
 */
export function clipPocketLevels(x: number, y: number, axis: 'h' | 'v'): BackFeatureLevel[] {
  const [hx, hy] = axis === 'h' ? [POCKET_LAND_HALF_LENGTH, POCKET_OPENING] : [POCKET_OPENING, POCKET_LAND_HALF_LENGTH]
  const rect = (grow: number) => ringFromRect(x - hx - grow, y - hy - grow, x + hx + grow, y + hy + grow)
  const land = rect(0)
  return [
    { ring: rect(POCKET_MOUTH), ringTop: land, z0: 0, z1: POCKET_MOUTH },
    { ring: land, z0: POCKET_MOUTH, z1: POCKET_RIDGE },
    { ring: land, ringTop: rect(FLARE_OUT), z0: POCKET_RIDGE, z1: POCKET_DEPTH },
  ]
}
