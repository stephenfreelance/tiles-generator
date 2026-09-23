// Tabs between tiles (docs/architecture.md, "Fixings"): the one fixing with nothing to print. Each tile
// carries a rigid TAB standing out past its interior right side and the matching SOCKET cut into its
// interior left side, both wholly inside the back plate, so the top surface, the grid, the joint edge and
// the perimeter profile are untouched and the tile is unchanged from the front. Vertical joints only, one
// uniform hand (tab right, socket left), never on the boundary of the wall.
// Pure maths: this runs in the geometry worker and in vitest's node environment.
//
// The section is the printed key's, halved. The tab is the key's own outline with the joint bridged into its
// neck instead of a second head, fused to the plate; the socket is that outline grown by the fit clearance,
// which is the key notch itself. So one tested ring function (notchOutline) serves both, and because a grown
// outline is the nominal one's offset curve, the gap is the clearance at every point of the boundary, fillets
// included. The tab is nominal: a boss grows and a hole shrinks as a printer over-extrudes, so both errors
// eat the same clearance whichever part carries it, and the tab keeps its full loaded section.
//
// There is no click, and none is possible. The tab's cross-section is constant in z over the whole insertion
// path, so no locking face is ever passed; an arm thin enough to fold within MAX_ARM_STRAIN at these depths
// would be a finger standing out of every tile, and freeing one inside the plate would need a slot through to
// the front. The tab is rigid, and the joint is held shut by the head being wider than the throat: laterally
// the head cannot pass it. The pair is engaged by the motion the maker already makes, because the socket is
// open at the tile's back: the tile is brought square to the wall and pressed on, and its socket comes down
// over the neighbour's tab. It lifts that socket off again with nothing to press back first; its OWN tab, at z
// 0 to `thickness` under a socket ceiling at `depth`, can rise only KEY_RECESS before it meets that ceiling, so
// a tile comes off once the tile to its right is off and a row comes apart from its right-hand end (guide.ts's
// TAB_OFF). The tabs hold the joint shut in the plane of the wall; the glue, the tape or the clips carry the tiles.
//
// Coordinates, and where the numbers go. The socket in section, cut through its throat, printed face up so it
// opens at the bed (this is the tile on the RIGHT of the joint, seen from its own back):
//
//   z ^   _________________________  ceiling (flat, bridged) at `depth`: KEY_RECESS of air under it, so the
//     |  |                           tab can never bottom out on it and hold its neighbour off the wall
//     |  |        the tab  _______
//     |  |                |         `thickness` = depth - KEY_RECESS, whole 0.2 mm layers
//     |  |________________|_______  mouth: 45 degree lead-in, `mouth` high, over both parts' elephant foot
//  0 -+---------------------------> into the tile      the tile's back, on the bed
//
// The pair in plan, seen from the back of the wall: s along the two sides, t across the joint, the tab's own
// side line on the left. The socket's outline is the tab's, `clearance` further out on every face:
//
//     s ^          tab                          |         socket (the same outline, grown)
//       |    +-----------------+                |    + - - - - - - - - - -+
//       |    |     head        |  shoulder      |    |                    |   B = headWidth / 2
//       |    +-------+   +-----+----------------+----+  - - - +           |
//       |            |   |  neck, N = neckWidth / 2      throat           |   the head cannot pass it
//   0 --+- - - - - - + - + - - - - - - - - - - -+- - - - - - -+ - - - - - +-- centre line
//       |            |   |                      |                         |
//       |    +-------+   +-----+----------------+----+ - - - - +          |
//       |    |                 |                |    |                    |
//       |    +-----------------+                |    + - - - - - - - - - -+
//       |                                       |
//       +--- A's side line -- reach = joint + REACH --- B's side line ---------> t
//
// What the fixings layer owns and the mesher cannot: the mesher sees one piece, and what covers a tab is the
// NEIGHBOUR's plate, so it cannot judge a tab's height, its length, or whether the neighbour has the socket
// at all. Those rules are here and in capability.ts (tabDepth, tabsPossible) and in the layout, which is the
// only thing that sees a neighbour (PieceEdges.tabs).

import { perimeterDrop, resolveJointEdge } from '../geometry/profiles'
import { hasSide } from '../sides'
import type { DesignConfig, FitClass, LayoutPlan, PieceSpec, Side } from '../types'
import {
  clipBandOffset,
  KEY_CEILING_COVER,
  KEY_CLEAR,
  KEY_DEPTH_MIN,
  KEY_MOUTH,
  KEY_RECESS,
  tabDepth,
  tabsPossible,
} from './capability'
import {
  keyGeometry,
  notchOutline,
  notchSites,
  placeOnSide,
  SITE_TOLERANCE,
  type KeyGeometry,
  type NotchSite,
  type NotchSiteOptions,
  type PieceShape,
} from './joins'
import { POCKET_HALF_SHORT, SAG_RANGE } from './mechanism'
import type { BackFeature } from './types'

const round2 = (v: number) => Math.round(v * 100) / 100

// ---------------------------------------------------------------------------------------------------
// Fit, mismatch and the limits the checks hold

/**
 * Clearance cut into the socket for each fit class, mm on every face; the tab is nominal. Twice the loosest
 * printed key's (fitClearance('loose', 'key') = 0.15) at Standard, because a tab and its socket carry the
 * printer's dimensional error on BOTH halves where a printed key carries it on one. This is the one clearance
 * that lives in a tile, which is why geometryKey includes the fit for the tabs and for nothing else, and why
 * the fit test is printed before the tiles rather than after them.
 */
export const SOCKET_CLEARANCE: Record<FitClass, number> = { snug: 0.15, standard: 0.3, loose: 0.45 }

const CLEARANCES = Object.values(SOCKET_CLEARANCE)
/** The clearance range the fit classes span: the snuggest and the loosest. */
export const SOCKET_CLEARANCE_RANGE: readonly [number, number] = [Math.min(...CLEARANCES), Math.max(...CLEARANCES)]

/**
 * Least reentrant radius a grown outline keeps, mm. Every millimetre of grow shrinks the shoulder fillet, and
 * the socket's mouth is the body grown AGAIN by the chamfer, so at the loosest fit the nominal 0.4 mm chamfer
 * would take SHOULDER_FILLET past zero: the shoulder would lose its arc, the mouth ring would come out with
 * fewer vertices than the body's, and the two could not loft. A tenth of a millimetre is a quarter of a
 * nozzle, too small to print as a radius, and keeping the arc is all it has to do.
 */
const MIN_SHOULDER_FILLET = 0.1

/**
 * How far two neighbouring tiles' backs may sit apart along the wall's normal, mm: SAG_RANGE[1] reused. On
 * clips the maker uses one roll of tape, so TAPE_RANGE's spread is between brands and not between
 * neighbours, and only each pocket ceiling's droop differs from tile to tile.
 */
export const BACK_MISMATCH = SAG_RANGE[1]

/**
 * The least full-section overlap of tab and socket in z, mm: three 0.2 mm layers and one and a half nozzle
 * widths, the smallest bearing face the mesher and the slicer both reproduce, and the same family of numbers
 * as the clip's MIN_CATCH.
 */
export const MIN_ENGAGEMENT = 0.6

/**
 * The least the head may overlap each side of the socket's throat, mm: what stops the joint opening. Three
 * 0.4 mm lines, the reason TINE_WIDTH is 1.2 as well. The neck is always half the head, so the overlap is
 * headWidth / 4 less the clearance: 2.55 mm at the 12 mm head, 1.55 at the 8 mm one.
 */
export const MIN_SHOULDER = 1.2

/**
 * The depth a socket must find room for, mm, in the order it is spent going up from the tile's back: the
 * socket's mouth chamfer, one full engagement, how far the two backs may sit apart, and the recess left under
 * the ceiling. capability.ts carries the sum as TAB_MIN_DEPTH, because the layout reads it and may not import
 * this module; tabs.test.ts holds the two equal. It lands on the same number from a second direction: at
 * 1.6 mm the tab is 1.2 mm thick, which is KEY_DEPTH_MIN, this codebase's own floor for a part too thin to
 * print and handle.
 */
export const TAB_DEPTH_STACK: readonly number[] = [KEY_MOUTH, MIN_ENGAGEMENT, BACK_MISMATCH, KEY_RECESS]

/**
 * How far the tab's top always stays below the rim of its joint edge, mm: the plate kept over a key notch's
 * ceiling plus the tab's own recess. Derived, and the same number whether keyNotchDepth is capped at 3 mm or
 * set by the plate, which is why it is also the widest joint a tab may cross (capability.ts's TAB_JOINT_MAX):
 * a joint no wider than the tab's own depth below the rim hides it from every view within 45 degrees of
 * straight on.
 */
export const TAB_BELOW_RIM = KEY_CEILING_COVER + KEY_RECESS

// ---------------------------------------------------------------------------------------------------
// The section

/** Every number of a design's tab and socket, mm. One pair of shapes per design and fit. */
export interface TabGeometry {
  /** Depth of the socket into the back of the tile: the key notch's own rule, gated at TAB_MIN_DEPTH. */
  depth: number
  /** Height of the tab: KEY_RECESS less than the socket is deep, so it never bottoms out on its ceiling. */
  thickness: number
  /** How far the tab stands out past its own side line: across the joint, then REACH into the socket. */
  reach: number
  /** How far out its shoulder sits, so the shoulder lands NECK inside the neighbour whatever the joint. */
  neck: number
  headWidth: number
  neckWidth: number
  /** The joint the tab crosses. */
  joint: number
  /** Clearance cut into the socket on every face at this design's fit; the tab is nominal. */
  clearance: number
  /** How far the socket cuts into its own tile, its mouth and its clearance included. */
  socketReach: number
  /** The same at the WIDEST fit: what a piece or a test coupon is sized by, so neither moves with Fit. */
  socketReachMax: number
  /** Least piece width that can hold a socket: the WIDEST fit's socket, so it never moves with Fit. */
  minWidth: number
  /**
   * The same on this wall: `minWidth`, or the socket clear of a border profile that drops to the rim when that
   * asks for more. A dropping profile takes the top away as far as its own reach in from the side it shapes,
   * and `notchSites` refuses a socket under it, so a narrow piece at a shaped edge takes none. The layout
   * weighs the tile beside a tab against this, so a tab is never cut facing a piece that has no socket.
   */
  socketWidth: number
  /** How far the tab's top sits below the rim of the joint edge over it. */
  rimOverTab: number
  /** Wall kept between a socket and the end of its side (the key notch's own margin). */
  margin: number
  /** How high the chamfer round the socket's mouth stands off the tile's back. */
  mouth: number
  /**
   * How far that chamfer grows the mouth out per face: its own height, capped at what the shoulder fillet can
   * give up (MIN_SHOULDER_FILLET). Only the loosest fit is capped, and only ever to lean the chamfer back from
   * 45 degrees, which is the gentler overhang of the two; the body ring that carries the fit is untouched.
   */
  mouthGrow: number
  headFillet: number
  shoulderFillet: number
  /** Where the pair sits along the left and right sides of a whole tile, tile-local mm: the key's own y lattice. */
  lattice: number[]
  /** Where the design's horizontal clip band sits in from a piece's bottom and top edge (clipBandOffset). */
  clipBand: number
}

/** How far the socket's mouth may grow per face at this clearance before its shoulder fillet would fold. */
function mouthGrowFor(key: KeyGeometry, clearance: number): number {
  return round2(Math.min(key.mouth, Math.max(0, key.shoulderFillet - MIN_SHOULDER_FILLET - clearance)))
}

/** How far a socket's mouth outline reaches into its own tile, read off the ring rather than added up. */
function socketReachOf(key: KeyGeometry, grow: number): number {
  const points = notchOutline(key, grow)
  let deep = 0
  for (let k = 1; k < points.length; k += 2) deep = Math.max(deep, points[k])
  return round2(deep)
}

/**
 * The tab and socket numbers of a design, or null when its plate cannot hold the socket (tabDepth in
 * capability.ts has the rule). Independent of `config.lock` and of the joint cap: the fit test, the drawings
 * and the checks read it too.
 */
export function tabGeometry(config: DesignConfig): TabGeometry | null {
  const depth = tabDepth(config)
  const key = keyGeometry(config)
  if (depth === null || !key) return null
  const clearance = SOCKET_CLEARANCE[config.fit]
  const mouthGrow = mouthGrowFor(key, clearance)
  const loosest = SOCKET_CLEARANCE_RANGE[1]
  const deepest = socketReachOf(key, loosest + mouthGrowFor(key, loosest))
  return {
    depth,
    thickness: key.thickness,
    reach: round2(config.joint + key.reach),
    neck: round2(config.joint + key.neck),
    headWidth: key.headWidth,
    neckWidth: key.neckWidth,
    joint: config.joint,
    clearance,
    socketReach: socketReachOf(key, clearance + mouthGrow),
    socketReachMax: deepest,
    minWidth: round2(deepest + key.margin),
    socketWidth: round2(deepest + Math.max(key.margin, perimeterDrop(config))),
    rimOverTab: round2(config.tile.thickness - resolveJointEdge(config).size - key.thickness),
    margin: key.margin,
    mouth: key.mouth,
    mouthGrow,
    headFillet: key.headFillet,
    shoulderFillet: key.shoulderFillet,
    lattice: key.lattice.y,
    clipBand: clipBandOffset(config),
  }
}

// ---------------------------------------------------------------------------------------------------
// Outlines

/**
 * The tab's outline in the notch frame, t running OUT past the side line, with the joint bridged into its
 * neck. Mirroring the notch across its own side line reverses the ring, so it is walked back the other way:
 * counter-clockwise around the material it adds, with its root edge running the opposite way along the side
 * from a cavity's opening, which is the sign the mesher reads to tell a tab from a notch.
 */
export function tabOutline(key: KeyGeometry, joint: number): number[] {
  const points = notchOutline(key, 0, joint)
  const out: number[] = []
  for (let k = points.length - 2; k >= 0; k -= 2) out.push(points[k], -points[k + 1])
  return out
}

/** The tab standing out past one side of a piece: one level, vertical walls, from the tile's back to its top. */
function tabFeature(g: TabGeometry, key: KeyGeometry, side: Side, along: number, width: number, height: number): BackFeature {
  return {
    role: 'join-tab',
    side,
    outward: true,
    levels: [{ ring: placeOnSide(tabOutline(key, g.joint), side, along, width, height), z0: 0, z1: g.thickness }],
  }
}

/** The socket cut into one side of a piece: the key notch's own two levels, every face `clearance` further out. */
function socketFeature(g: TabGeometry, key: KeyGeometry, side: Side, along: number, width: number, height: number): BackFeature {
  const place = (grow: number) => placeOnSide(notchOutline(key, grow), side, along, width, height)
  const body = place(g.clearance)
  return {
    role: 'join-socket',
    side,
    levels: [
      { ring: place(g.clearance + g.mouthGrow), ringTop: body, z0: 0, z1: g.mouth },
      { ring: body, z0: g.mouth, z1: g.depth },
    ],
  }
}

// ---------------------------------------------------------------------------------------------------
// Which of the pair a piece carries

/**
 * The side a tab stands on: the right, on every tile of every wall. The hand is uniform and cannot be
 * anything else, because a checkerboard would not survive piece dedupe: a piece's parity on the wall is not
 * part of its id, so two placements of one id would want opposite hands and get whichever was meshed first.
 */
export const TAB_SIDE: Side = 1
/** The side the socket is cut into, which is the same joint seen from the tile on the other side of it. */
export const SOCKET_SIDE: Side = 3

/**
 * The lattice positions of the pair on one side of a piece. Both ends of a joint ask this same question, so a
 * tab lands exactly where the neighbour's socket is: the width rule is the socket's on both sides (the layout
 * only sets the tab bit where both pieces are wide enough), and the widest fit's clearance is used whatever
 * the design's own, so Fit reshapes a socket without ever moving it.
 */
function pairSites(config: DesignConfig, key: KeyGeometry, g: TabGeometry, piece: PieceShape, side: Side): NotchSite[] {
  const options: NotchSiteOptions = {
    sides: [side],
    minDepth: g.minWidth,
    minDepthBoth: g.minWidth,
    grow: SOCKET_CLEARANCE_RANGE[1],
  }
  return notchSites(config, key, piece, options)
}

/**
 * The tab standing out past a piece's interior right side, or none. Cut only where the layout has found the
 * tile beside it wide enough for the socket (`PieceEdges.tabs`): a tab with nothing to go into would press on
 * its neighbour's back plate and stand that tile off the wall, and a piece cannot see its neighbour. A pure
 * function of the design and the piece's crop, size and edges, so two placements of one piece id are the same.
 */
export function pieceTabs(config: DesignConfig, piece: PieceShape): BackFeature[] {
  if (!tabsPossible(config) || !hasSide(piece.edges?.tabs ?? 0, TAB_SIDE)) return []
  const key = keyGeometry(config)
  const g = tabGeometry(config)
  if (!key || !g) return []
  return pairSites(config, key, g, piece, TAB_SIDE).map((s) => tabFeature(g, key, TAB_SIDE, s.along, piece.width, piece.height))
}

/**
 * The sockets cut into a piece's interior left side, or none. Unlike the tab this looks at nothing but the
 * piece itself: a socket with no tab in it is harmless at the back of a tile, so it is cut wherever it fits.
 */
export function pieceSockets(config: DesignConfig, piece: PieceShape): BackFeature[] {
  if (!tabsPossible(config)) return []
  const key = keyGeometry(config)
  const g = tabGeometry(config)
  if (!key || !g) return []
  return pairSites(config, key, g, piece, SOCKET_SIDE).map((s) => socketFeature(g, key, SOCKET_SIDE, s.along, piece.width, piece.height))
}

/** Everything the tabs add to the back of one piece: its own tab, then the socket the tile to its left fills. */
export function tabFeatures(config: DesignConfig, piece: PieceShape): BackFeature[] {
  return [...pieceTabs(config, piece), ...pieceSockets(config, piece)]
}

/** The roles of the pair, for the readers that ask what a back feature is. */
export const TAB_ROLES: readonly BackFeature['role'][] = ['join-tab', 'join-socket']

/**
 * One tab at one place on one side of a slab, for the fit test's coupon: the pair on a shape that is not a
 * piece of the wall. Null when the plate cannot hold the pair.
 */
export function tabAt(config: DesignConfig, side: Side, along: number, size: { width: number; height: number }): BackFeature | null {
  const key = keyGeometry(config)
  const g = tabGeometry(config)
  return key && g ? tabFeature(g, key, side, along, size.width, size.height) : null
}

/**
 * One socket at one place on one side of a slab, cut at `fit` rather than at the design's own: the fit test
 * prints it at all three, because this is the one clearance that ends up inside a tile.
 */
export function socketAt(
  config: DesignConfig,
  side: Side,
  along: number,
  size: { width: number; height: number },
  fit: FitClass = config.fit,
): BackFeature | null {
  const key = keyGeometry(config)
  const g = tabGeometry({ ...config, fit })
  return key && g ? socketFeature(g, key, side, along, size.width, size.height) : null
}

// ---------------------------------------------------------------------------------------------------
// The wall's tabs

/** What the tabs really lock over a whole wall, and the pieces they leave to the glue. */
export interface TabPlan {
  /** Tabs standing in a socket, over every placed tile. 0 when nothing locks, whatever the design asks for. */
  tabs: number
  /** Joints within a row that at least one tab holds shut. */
  joints: number
  /**
   * Pieces no tab locks to either tile beside them: too narrow for a socket, or on a joint where the pair's
   * lattice positions do not meet. A piece with no tile beside it in its row is not among them: the design
   * locks nothing there and never claimed to.
   */
  unlockedPieceIds: string[]
}

const noTabs = (): TabPlan => ({ tabs: 0, joints: 0, unlockedPieceIds: [] })

/**
 * Every tab of the wall that really stands in a socket: within each row, the right side of one placement
 * against the left side of the next. Nothing between rows, ever: a tab wall is one rigid strip per row by
 * construction, which the guide states rather than reporting. Empty when the tabs place nothing at all.
 *
 * The layout has already decided which pieces carry a tab (`PieceEdges.tabs`), because only it can see a
 * neighbour; this walk pairs each tab with the socket it goes into, so a joint whose two pieces put their
 * pair at different heights counts as loose rather than locked.
 */
export function tabPlan(config: DesignConfig, plan: LayoutPlan): TabPlan {
  if (!tabsPossible(config)) return noTabs()
  const key = keyGeometry(config)
  const g = tabGeometry(config)
  if (!key || !g) return noTabs()
  const pieces = new Map(plan.pieces.map((p) => [p.id, p]))
  const cache = new Map<string, [Set<number>, Set<number>]>()
  /** Lattice indices of a piece's tab sites on its right, and of its socket sites on its left. */
  const sitesOf = (piece: PieceSpec): [Set<number>, Set<number>] => {
    let both = cache.get(piece.id)
    if (!both) {
      const index = (list: NotchSite[]) => new Set(list.map((s) => s.index))
      both = [
        hasSide(piece.edges.tabs, TAB_SIDE) ? index(pairSites(config, key, g, piece, TAB_SIDE)) : new Set<number>(),
        index(pairSites(config, key, g, piece, SOCKET_SIDE)),
      ]
      cache.set(piece.id, both)
    }
    return both
  }

  const rows = new Map<number, number[]>()
  plan.placements.forEach((p, i) => {
    const list = rows.get(p.row)
    if (list) list.push(i)
    else rows.set(p.row, [i])
  })
  for (const list of rows.values()) list.sort((a, b) => plan.placements[a].x - plan.placements[b].x)
  const pieceAt = (i: number): PieceSpec => {
    const piece = pieces.get(plan.placements[i].pieceId)
    if (!piece) throw new Error(`Placement refers to unknown piece "${plan.placements[i].pieceId}"`)
    return piece
  }

  const neighbours = new Uint32Array(plan.placements.length)
  const locked = new Uint32Array(plan.placements.length)
  let tabs = 0
  let joints = 0
  for (const list of rows.values()) {
    for (let k = 0; k + 1 < list.length; k++) {
      const a = plan.placements[list[k]]
      const b = plan.placements[list[k + 1]]
      const pa = pieceAt(list[k])
      const pb = pieceAt(list[k + 1])
      if (Math.abs(b.x - (a.x + pa.width + config.joint)) > SITE_TOLERANCE) continue
      neighbours[list[k]]++
      neighbours[list[k + 1]]++
      const sockets = sitesOf(pb)[1]
      let found = 0
      // Both pieces share the row, so their crops agree along y; check it rather than trust it.
      const aligned = Math.abs(a.y - pa.crop.y0 - (b.y - pb.crop.y0)) <= SITE_TOLERANCE
      if (aligned) for (const index of sitesOf(pa)[0]) if (sockets.has(index)) found++
      if (found === 0) continue
      tabs += found
      joints++
      locked[list[k]] += found
      locked[list[k + 1]] += found
    }
  }

  const unlocked = new Set<string>()
  plan.placements.forEach((p, i) => {
    if (neighbours[i] > 0 && locked[i] === 0) unlocked.add(p.pieceId)
  })
  return {
    tabs,
    joints,
    unlockedPieceIds: plan.pieces.filter((p) => unlocked.has(p.id)).map((p) => p.id),
  }
}

// ---------------------------------------------------------------------------------------------------
// Checks

/** Every engineering check of the pair, as numbers the tests hold to their limits. */
export interface TabChecks {
  /** Full-section overlap of tab and socket in z, mm: the tab's height, less the socket's mouth and the backs' mismatch. */
  engagement: number
  /** Room left under the socket's ceiling at the worst mismatch, mm. Positive, or a tab holds its neighbour off the wall. */
  ceilingRoom: number
  /** How far the head overlaps each side of the socket's throat, mm: what stops the joint opening. */
  shoulder: number
  /** How far the joint can open, mm: the socket's own clearance, the tab being nominal. */
  jointPlay: number
  /** Plate the thinnest piece that carries a socket keeps beyond it, mm: at least the notch margin. */
  socketWall: number
  /** Plate a socket keeps between its mouth and the end of its side, mm. The tab's own is the full margin. */
  cornerClear: number
  /**
   * Plate between a socket and the horizontal clip band's pocket on a whole tile, beyond KEY_CLEAR, mm.
   * Positive: the clips sit exactly where a glued design puts them and the socket costs no clip room. It goes
   * negative under about a 150 mm tile, where the socket reaches into the band's own row and the clip has to
   * move along it instead, which is clipSites' search (mount.ts), not this section's business.
   */
  clipBandClear: number
  /** How far the tab's top stays below the rim of the joint edge, mm: what hides it in the joint. */
  rimOverTab: number
  /** The tab itself, mm: at least KEY_DEPTH_MIN, or it is too thin to print and handle. */
  tabThickness: number
  /** Clearances where the outline must not fold back on itself; every one positive. */
  clearances: Record<string, number>
}

/**
 * The pair's checks for one design and fit. No force, hold or load figure is claimed anywhere: nothing has
 * been printed, and the fit test is the measurement. The one strain statement a rigid section owes is that
 * the joint cannot be opened by bending the tab instead: the head would have to fold `shoulder` sideways
 * about the neck's own width, which is more than ten times the fold that takes the root to MAX_ARM_STRAIN,
 * so the shoulder is the limit and not the plastic.
 */
export function tabChecks(g: TabGeometry): TabChecks {
  const halfAlong = g.headWidth / 2 + g.mouthGrow + g.clearance
  // Every margin is a sum of tenths of a millimetre, so rounding to hundredths only drops float noise.
  return {
    engagement: round2(g.thickness - g.mouth - BACK_MISMATCH),
    ceilingRoom: round2(KEY_RECESS - BACK_MISMATCH),
    shoulder: round2(g.headWidth / 4 - g.clearance),
    jointPlay: g.clearance,
    socketWall: round2(g.minWidth - g.socketReach),
    // notchSites keeps the WIDEST fit's footprint a margin from each end of the side, so what a socket's own
    // mouth and clearance then leave is the margin less the mouth, whatever the fit.
    cornerClear: round2(g.margin + SOCKET_CLEARANCE_RANGE[1] - g.mouthGrow - g.clearance),
    clipBandClear: round2(g.lattice[0] - halfAlong - (g.clipBand + POCKET_HALF_SHORT) - KEY_CLEAR),
    rimOverTab: g.rimOverTab,
    tabThickness: g.thickness,
    clearances: {
      // The reentrant shoulder radius shrinks as the socket grows: at 0 the ring would fold back on itself.
      filletNotInverted: round2(g.shoulderFillet - g.clearance),
      // The mouth grows it again, which is what MIN_SHOULDER_FILLET caps: the two rings must still loft.
      mouthFilletNotInverted: round2(g.shoulderFillet - g.clearance - g.mouthGrow - MIN_SHOULDER_FILLET),
      // The step from the neck out to the head takes both fillets. The two grows cancel, so it is fit-independent.
      throatStep: round2(g.headWidth / 4 - g.shoulderFillet - g.headFillet),
      // The tab must reach past the socket's mouth chamfer before any of it bears.
      tabPastMouth: round2(g.thickness - g.mouth),
      // The tab is thick enough to print and handle: the floor a printed key is held to as well.
      tabAboveFloor: round2(g.thickness - KEY_DEPTH_MIN),
    },
  }
}
