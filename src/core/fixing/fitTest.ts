// The fit test: the small parts printed first, so the maker can pick the fit class before printing a
// wall of clips or keys, or a wall of tiles with a socket in each. Tile coupons cut by the real tile mesher
// (coupon A with a clip pocket; for keys, A and B butt together with a key slot each on the facing sides,
// like two tiles of the wall; for tabs, A carries the tab and one B per fit carries the socket it goes into),
// then the clips and the keys at the three fit classes, each marked 1, 2 or 3 by small notches (snug,
// standard, loose). A test clip is the wall's clip, stops and all, so it seats in the coupon as it will in a
// tile; the keys span the butted coupons' closed joint (keySpecForFit).
//
// The tabs are the one fixing whose clearance ends up in a tile: their socket is cut into the plate, so it is
// the SOCKET that comes in all three fits and the coupons that carry the marks, and the test is printed
// before the tiles rather than after them. A fit changed later means printing the tiles again, which the
// guide says in its own words (fitChosenText).
// Pure maths: no DOM, no three.

import { resolveJointEdge } from '../geometry/profiles'
import { buildPieceMesh } from '../geometry/tileMesh'
import { partPrintNote } from '../printSettings'
import { createHeightField } from '../textures/registry'
import type { DesignConfig, FitClass, MeshData, PieceSpec } from '../types'
import { clipsPossible, KEY_CLEAR, keysPossible, tabsPossible } from './capability'
import { keyGeometry, keyNotchAt, keySpecForFit, placeOnSide } from './joins'
import { POCKET_HALF_LONG, POCKET_HALF_SHORT } from './mechanism'
import { clipPocketAt, clipSpecForFit } from './mount'
import { SOCKET_CLEARANCE_RANGE, SOCKET_SIDE, socketAt, TAB_SIDE, tabAt, tabGeometry } from './tabs'
import type { AccessorySpec, BackFeature } from './types'

/** The fit classes in the order of their marks: one notch for snug, two for standard, three for loose. */
export const FIT_ORDER: readonly FitClass[] = ['snug', 'standard', 'loose']

/** Top grid of the coupon, mm: the standard export quality, fine enough for a test piece. */
const COUPON_CELL = 0.4
/** Least wall round the coupon's pocket and notch, mm. */
const COUPON_WALL = 3
/** The coupon is never smaller than this across, mm: room for a key notch's head and its margins. */
const COUPON_MIN = 20

/** A mark notch in a coupon's free side, mm: wide and deep enough to read and to count at a glance. */
const MARK_WIDTH = 1.2
const MARK_DEPTH = 1.2
const MARK_PITCH = 2.4
/** How high a mark notch stands off the coupon's back, mm: four layers, well under the plate a socket leaves. */
const MARK_HEIGHT = 0.8

/**
 * Which fasteners a wall really uses, so the fit test tests nothing it will not print. One flag per
 * fastener, every one answered: another fastener adds its flag here, its line in fitTestFor and its own
 * branch below, and nothing else moves (the marks are numbered in print order, whatever is printed).
 */
export interface FitTestUses {
  clips: boolean
  keys: boolean
  tabs: boolean
}

/** Which fixings the design tests: what it prints, and only when its plate can hold their slots and pockets. */
function tested(config: DesignConfig, uses: FitTestUses): FitTestUses {
  return {
    clips: uses.clips && clipsPossible(config),
    keys: uses.keys && keysPossible(config),
    tabs: uses.tabs && tabsPossible(config),
  }
}

/** Wall kept round a coupon's pocket and notch: clear of the joint edge's run, which lowers the top near the sides. */
const couponMargin = (config: DesignConfig) => Math.max(COUPON_WALL, resolveJointEdge(config).run + 1)

/**
 * Coupon A's size and where its features go: a clip pocket (its clip along x) at mid-height near the left, a
 * key notch or the tab opening onto the right side at mid-height, both clear of the joint edge's run and
 * KEY_CLEAR apart. A tab stands outside the coupon, so it asks only for room along that side.
 */
function couponLayout(config: DesignConfig, clips: boolean, keys: boolean, tabs: boolean) {
  const margin = couponMargin(config)
  const g = keys ? keyGeometry(config) : null
  const notchDeep = g ? g.reach + g.mouth : 0
  const notchWide = g ? g.headWidth + 2 * g.mouth + 2 * g.margin : 0
  const t = tabs ? tabGeometry(config) : null
  // The widest fit's socket, so coupon A and all three B coupons come out one height whatever the design's fit.
  const socketWide = t ? t.headWidth + 2 * (t.mouth + SOCKET_CLEARANCE_RANGE[1] + t.margin) : 0
  const height = Math.ceil(Math.max(COUPON_MIN, clips ? 2 * (POCKET_HALF_SHORT + margin) : 0, notchWide, socketWide))
  const clipX = margin + POCKET_HALF_LONG
  const left = clips ? clipX + POCKET_HALF_LONG + (g ? KEY_CLEAR : margin) : margin
  const width = Math.ceil(Math.max(COUPON_MIN, left + notchDeep))
  return { width, height, clipX, clipY: height / 2 }
}

/**
 * Coupon B, which butts against A's right side: A's height, so the two meet along a whole side, and the
 * facing half of the pair on its left side, a key notch or the socket. A key then presses in across a real
 * joint, closed at the back only as far as the first layer's bulge lets it, and a socket comes down over A's
 * tab exactly as the next tile of the wall will: a pair that goes together here goes together in the wall.
 */
function mateLayout(config: DesignConfig, height: number, tabs: boolean) {
  const g = keyGeometry(config)
  // The widest fit's socket, so the three socket coupons are one size and only the ring inside them moves.
  const deep = tabs ? (tabGeometry(config)?.socketReachMax ?? 0) : g ? g.reach + g.mouth : 0
  return { width: Math.ceil(Math.max(COUPON_MIN, deep + couponMargin(config))), height }
}

/** Prints like a tile: the coupons test the pockets and the joint the tiles' own layers make. */
const COUPON_NOTE = 'Print face up like a tile, with the settings of the tiles'
/** A coupon that butts another one: what its first layer does at the joint is half of what is being read. */
const PAIRED_COUPON_NOTE = 'Print face up like a tile, with the settings of the tiles, first layer included'

/**
 * One to three notches in the free side of a socket coupon, the way a test key and a test clip carry theirs:
 * what tells B1 from B3 once the three are printed. On the right side, away from the socket on the left, so
 * nothing the test reads is touched.
 */
function markNotches(marks: 1 | 2 | 3, size: { width: number; height: number }): BackFeature[] {
  const middle = size.height / 2
  return Array.from({ length: marks }, (_, m) => {
    const along = middle + (m - (marks - 1) / 2) * MARK_PITCH
    const half = MARK_WIDTH / 2
    const ring = placeOnSide([-half, 0, half, 0, half, MARK_DEPTH, -half, MARK_DEPTH], 1, along, size.width, size.height)
    return { role: 'fit-mark' as const, side: 1 as const, levels: [{ ring, z0: 0, z1: MARK_HEIGHT }] }
  })
}

/** What coupon A holds, in the words of its label. */
function couponHolds(clips: boolean, keys: boolean, tabs: boolean): string {
  const held = [clips ? 'a clip pocket' : '', keys ? 'a key slot' : '', tabs ? 'a tab' : ''].filter(Boolean)
  return held.length === 2 ? `${held[0]} and ${held[1]}` : held[0]
}

/**
 * The fit-test parts, in print order: the coupons, three clips, three keys (only the ones the design uses;
 * `uses` narrows that to what the wall's plans really place). Empty when no fixing is placed, or the plate
 * is too thin for its slots, sockets and pockets. Every part is its own spec in the 'fit-test' group,
 * marked F1, F2...
 */
export function fitTestParts(config: DesignConfig, uses: FitTestUses = { clips: true, keys: true, tabs: true }): AccessorySpec[] {
  const { clips, keys, tabs } = tested(config, uses)
  if (!clips && !keys && !tabs) return []
  const parts: Omit<AccessorySpec, 'mark'>[] = []
  const coupon = couponLayout(config, clips, keys, tabs)
  const z = Math.round((config.tile.thickness + config.texture.depth) * 100) / 100
  // Keys and tabs both butt a second coupon against A, so A is called A only when there is one.
  const paired = keys || tabs
  parts.push({
    id: `fit-coupon${clips ? '-c' : ''}${keys ? '-k' : ''}${tabs ? '-t' : ''}`,
    kind: 'fit-test',
    label: `Test coupon ${paired ? 'A ' : ''}with ${couponHolds(clips, keys, tabs)}`,
    count: 1,
    size: { x: coupon.width, y: coupon.height, z },
    printNote: partPrintNote('fit-test', paired ? PAIRED_COUPON_NOTE : COUPON_NOTE),
    group: 'fit-test',
    shape: { width: coupon.width, height: coupon.height, clip: clips ? 1 : 0, key: keys ? 1 : 0, tab: tabs ? 1 : 0 },
  })
  if (keys) {
    const mate = mateLayout(config, coupon.height, false)
    parts.push({
      id: `fit-coupon${clips ? '-c' : ''}-k-mate`,
      kind: 'fit-test',
      label: 'Test coupon B with the facing key slot',
      count: 1,
      size: { x: mate.width, y: mate.height, z },
      printNote: partPrintNote('fit-test', PAIRED_COUPON_NOTE),
      group: 'fit-test',
      // A's width is where B's relief starts; A's height is B's, whether or not A holds a clip pocket.
      shape: { width: mate.width, height: mate.height, clip: 0, key: 1, mate: 1, x0: coupon.width },
    })
  }
  if (tabs) {
    // The socket carries the fit, so it is the socket that comes in all three: the maker keeps one.
    const mate = mateLayout(config, coupon.height, true)
    FIT_ORDER.forEach((fit, i) => {
      const marks = (i + 1) as 1 | 2 | 3
      parts.push({
        id: `fit-coupon-t-socket-m${marks}`,
        kind: 'fit-test',
        label: `Test coupon B${marks} with the facing socket, ${fit}`,
        count: 1,
        size: { x: mate.width, y: mate.height, z },
        printNote: partPrintNote('fit-test', PAIRED_COUPON_NOTE),
        group: 'fit-test',
        shape: { width: mate.width, height: mate.height, clip: 0, key: 0, tab: 0, socket: 1, marks, x0: coupon.width },
      })
    })
  }
  if (clips) {
    FIT_ORDER.forEach((fit, i) => {
      parts.push(clipSpecForFit(fit, (i + 1) as 1 | 2 | 3))
    })
  }
  if (keys) {
    FIT_ORDER.forEach((fit, i) => {
      const key = keySpecForFit(config, fit, (i + 1) as 1 | 2 | 3)
      if (key) parts.push({ ...key, count: 1, group: 'fit-test' })
    })
  }
  return parts.map((part, i) => ({ ...part, mark: `F${i + 1}` }))
}

/** A synthetic piece of the design's relief for a coupon: `x0` is where it starts along the pattern. */
function couponPiece(spec: AccessorySpec, x0: number, width: number, height: number): PieceSpec {
  return {
    id: spec.id,
    mark: spec.mark,
    kind: 'corner',
    label: spec.label,
    crop: { x0, y0: 0, x1: x0 + width, y1: height },
    width,
    height,
    count: 1,
    // A coupon is nobody's neighbour: what it carries is named by its own spec, never read off a wall.
    edges: { boundary: 0, tabs: 0, profiled: {} },
  }
}

/** A number a coupon's spec must carry to be buildable at all. */
function couponNumber(spec: AccessorySpec, key: string): number {
  const value = spec.shape[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${spec.id}: shape.${key} is missing`)
  return value
}

/**
 * A coupon's solid: a synthetic piece of the design's own relief and plate, cut by the real tile mesher
 * with the design's clip pocket, key notch, tab or socket. Every coupon B continues A's relief from where A
 * ends, so the pair butts like two neighbouring tiles. The height field is built here, in the mesher's call
 * path.
 */
export function buildCouponMesh(config: DesignConfig, spec: AccessorySpec): MeshData {
  const features: BackFeature[] = []
  let piece: PieceSpec
  if (spec.shape.socket === 1) {
    const height = couponNumber(spec, 'height')
    const x0 = couponNumber(spec, 'x0')
    const marks = couponNumber(spec, 'marks')
    if (marks !== 1 && marks !== 2 && marks !== 3) throw new Error(`${spec.id}: shape.marks is not 1, 2 or 3`)
    const b = mateLayout(config, height, true)
    piece = couponPiece(spec, x0, b.width, b.height)
    const socket = socketAt(config, SOCKET_SIDE, b.height / 2, b, FIT_ORDER[marks - 1])
    if (socket) features.push(socket)
    features.push(...markNotches(marks, b))
  } else if (spec.shape.mate === 1) {
    const b = mateLayout(config, couponNumber(spec, 'height'), false)
    piece = couponPiece(spec, couponNumber(spec, 'x0'), b.width, b.height)
    const notch = keyNotchAt(config, 3, b.height / 2, b)
    if (notch) features.push(notch)
  } else {
    const clips = spec.shape.clip === 1
    const keys = spec.shape.key === 1
    const tabs = spec.shape.tab === 1
    const a = couponLayout(config, clips, keys, tabs)
    piece = couponPiece(spec, 0, a.width, a.height)
    if (clips) features.push(clipPocketAt(a.clipX, a.clipY, 'h'))
    if (keys) {
      const notch = keyNotchAt(config, 1, a.height / 2, a)
      if (notch) features.push(notch)
    }
    if (tabs) {
      const tab = tabAt(config, TAB_SIDE, a.height / 2, a)
      if (tab) features.push(tab)
    }
  }
  const mesh = buildPieceMesh(config, createHeightField(config), piece, { cellMm: COUPON_CELL }, features)
  // An accessory has no textured top range (the contract of buildAccessoryMesh), even when it has a relief.
  return { ...mesh, topIndexCount: 0 }
}
