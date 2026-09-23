// Whether a design's fixings can be cut at all, from the design alone. The layout, the fixings, the
// studio and the download page all ask the same question, so they ask it here. It imports nothing from
// the layout or the other fixing modules but mechanism.ts (a leaf: only polygon helpers and types), which
// lets layout.ts use it without an import cycle.
// Pure maths: this runs in the geometry worker and in vitest's node environment.

import { MIN_FIXING_THICKNESS } from '../config'
import { perimeterDrop, resolveJointEdge } from '../geometry/profiles'
import type { DesignConfig } from '../types'
import { POCKET_HALF_SHORT } from './mechanism'

/** Plate left over a key notch's ceiling, under the joint edge's rim: a bridge plus solid layers, mm. */
export const KEY_CEILING_COVER = 1.6
/** A key notch is never deeper than this, mm: deep enough to locate a key, and every layer more is plate lost over it. */
const KEY_DEPTH_MAX = 3
/** Below this a key or a tab, 0.4 mm thinner than its notch or socket, gets too thin to print and handle, mm. */
export const KEY_DEPTH_MIN = 1.2
/** Notch depths snap down to whole 0.2 mm layers. */
const LAYER = 0.2

/** Rounds up to the next 0.1 mm, ignoring float noise, so a derived clearance never comes out short. */
const ceil1 = (v: number) => Math.ceil(v * 10 - 1e-6) / 10

/** Wall a clip pocket keeps to any key notch, mm: the notch and the pocket are both cut into the same plate. */
export const KEY_CLEAR = 3
/**
 * The key is thinner than its notch by this, mm: bridge sag, and a recess so it never stands proud of the
 * back. A tab takes the same number against its socket, so it can never bottom out on the socket's ceiling
 * and hold its neighbour off the wall.
 */
export const KEY_RECESS = 0.4
/** 45 degree chamfer round a notch's mouth, mm: the first layers' elephant foot fills it instead of the notch. */
export const KEY_MOUTH = 0.4
/**
 * How far a key notch reaches into its tile from the joint, its mouth chamfer included, mm: joins.ts cuts
 * it REACH + KEY_MOUTH deep, and capability.test.ts holds the two equal.
 */
export const KEY_NOTCH_REACH = 8.4
/** Least wall between a clip pocket and a side of its piece, mm: two perimeters and then some (the mesher's floor is 0.8). */
export const CLIP_SIDE_WALL = 2

/**
 * The numbers of the tab and its socket that the LAYOUT needs, mm. Each is derived in tabs.ts, which
 * this module may not import (it would put layout.ts in the fixings' own cycle), so each is written out here
 * and capability.test.ts holds it equal to tabs.ts's own derivation, exactly as it does for KEY_NOTCH_REACH.
 */
/** How far a tab reaches into the socket of the tile beside it: the key notch's own REACH. */
export const TAB_REACH = 8
/**
 * Least piece width that can hold a socket on a wall with no dropping border profile, mm: the widest fit's
 * socket ring (its clearance and the mouth chamfer that clearance leaves room for), plus the notch margin
 * beyond it. `socketWidth` is the number a design is really held to.
 */
export const TAB_MIN_WIDTH = 11.7
/** Wall kept between a socket and the end of its side, mm: the key notch's own MARGIN. */
export const TAB_MARGIN = 3
/** Least socket depth that can hold a tab: the tab's recess, the socket's mouth, the backs' mismatch, one engagement. */
export const TAB_MIN_DEPTH = 1.6
/** Widest joint a tab may cross: how far its top always stays below the rim, so the joint hides it. */
export const TAB_JOINT_MAX = 2

/** The plate is thick enough for any pocket in its back. */
const fixingPlate = (config: DesignConfig) => config.tile.thickness >= MIN_FIXING_THICKNESS - 1e-9

/**
 * Depth of a key notch into the back of the tile, mm, or null when the plate cannot hold one: under
 * MIN_FIXING_THICKNESS, or so thin under its joint edge that the notch would be shallower than 1.2 mm.
 * d = min(3, t - s - 1.6) rounded down to a whole layer, s the joint edge's drop at the rim, so the plate
 * keeps 1.6 mm over the notch right under the rim. Ignores `config.lock`: the fit test and the drawings
 * read it too.
 */
export function keyNotchDepth(config: DesignConfig): number | null {
  if (!fixingPlate(config)) return null
  const room = Math.min(KEY_DEPTH_MAX, config.tile.thickness - resolveJointEdge(config).size - KEY_CEILING_COVER)
  const depth = Math.round(Math.floor(room / LAYER + 1e-9) * LAYER * 10) / 10
  return depth < KEY_DEPTH_MIN - 1e-9 ? null : depth
}

/**
 * Keys are asked for and every tile's plate can hold their notches. It says nothing about whether a
 * joint of this wall is long enough for one: joinPlan counts that.
 */
export function keysPossible(config: DesignConfig): boolean {
  return config.lock === 'keys' && keyNotchDepth(config) !== null
}

/**
 * Depth of a tab's socket, mm, or null when the plate cannot hold one. A socket is a key notch cut on one
 * side of a tile, with the same bridged ceiling under the same rim, so the rule is the key's own; it needs
 * TAB_MIN_DEPTH rather than the key's 1.2 mm because the tab must clear the socket's mouth and its ceiling
 * as well as bear on it. Ignores `config.lock`: the drawings and the checks read it too.
 */
export function tabDepth(config: DesignConfig): number | null {
  const depth = keyNotchDepth(config)
  return depth !== null && depth >= TAB_MIN_DEPTH - 1e-9 ? depth : null
}

/**
 * Tabs are asked for, the joint is narrow enough to hide one, and every tile's plate can hold their
 * sockets. It says nothing about whether a joint of this wall takes one: the layout answers that, piece by
 * piece, because only it can see whether the tile beside this one is wide enough for the socket.
 */
export function tabsPossible(config: DesignConfig): boolean {
  return config.lock === 'tabs' && config.joint <= TAB_JOINT_MAX + 1e-9 && tabDepth(config) !== null
}

/**
 * Least piece width that can hold a socket in this design, mm. A border profile that drops to the rim takes
 * the top away as far as `perimeterDrop` in from the side it shapes, and nothing may be cut under that, so a
 * narrow piece at a shaped edge of the wall needs the drop beyond its socket where an ordinary one needs only
 * the margin. The layout weighs the tile beside a tab against this before it cuts the tab, so a tab is never
 * left facing a piece whose socket the drop refused: an unmated tab bears on that tile's back plate and
 * stands it off the wall, which is the one failure that would ruin the pair.
 */
export function socketWidth(config: DesignConfig): number {
  return Math.round((TAB_MIN_WIDTH + Math.max(0, perimeterDrop(config) - TAB_MARGIN)) * 100) / 100
}

/**
 * What the layout needs of the tabs, or null when none are cut: the least piece width that can hold a
 * socket, and how far a tab stands out past its side (the printed box is that much wider than the tile, so
 * the bed check and the plate count read it). The width is the widest fit's, so which piece carries a socket
 * never moves with Fit: only the ring inside it does.
 */
export function tabLimits(config: DesignConfig): { minWidth: number; projection: number } | null {
  if (!tabsPossible(config)) return null
  return { minWidth: socketWidth(config), projection: Math.round((config.joint + TAB_REACH) * 10) / 10 }
}

/**
 * Wall clips are asked for and the plate can hold a clip pocket (MIN_FIXING_THICKNESS: the pocket keeps
 * its 1.2 mm of plate at the 4 mm base). No tile size rule: whether a piece takes a clip is mountPlan's
 * answer, piece by piece.
 */
export function clipsPossible(config: DesignConfig): boolean {
  return config.mount === 'clips' && fixingPlate(config)
}

/**
 * Where a design's horizontal clips sit from a piece's bottom and top edges, mm: the centre of the pocket.
 * With keys cut, far enough in that the pocket keeps KEY_CLEAR of plate to every key notch across a row
 * joint, wherever the key lattice puts them; without, the pocket's half height and a side wall, clear of
 * the joint edge's run (it lowers the top there, which would leave no roof over the pocket). Tabs leave the
 * bands where a glued design has them: nothing of theirs crosses a row joint, so the band never has to move
 * out for them. A socket near a vertical side can still reach into a band's row on a tile under about
 * 150 mm, and then it is the clip that moves along its band, which is clipSites' own search.
 */
export function clipBandOffset(config: DesignConfig): number {
  if (keysPossible(config)) return ceil1(KEY_NOTCH_REACH + KEY_CLEAR + POCKET_HALF_SHORT)
  return ceil1(POCKET_HALF_SHORT + Math.max(CLIP_SIDE_WALL, resolveJointEdge(config).run))
}
