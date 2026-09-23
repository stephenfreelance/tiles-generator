// Where TileBackFigure draws everything: one piece's back at scale, seen from the back (mirrored in x),
// its pockets, and a detail circle beside it that magnifies one pocket with its printed part seated, tied
// to it by a leader line. Pure, so vitest can hold the drawing to the geometry it shows without a DOM.
//
// Units: the figure's own, about CSS px at its natural size (the piece's long side is FIGURE.size).
import type { BackFeature, Ring } from '@/core/fixing/types'
import type { Side } from '@/core/types'
import { circlePath, clipPlan } from './diagramGeometry'

/**
 * The figure's proportions: the piece's long side, the gap between the piece and the detail circle, the
 * circle's radius, a margin round the whole, the room between a pocket and the small ring drawn round it
 * (and that ring's least radius), and how much of the circle the magnified pocket fills.
 */
export const FIGURE = { size: 120, gap: 16, radius: 44, pad: 2, ringPad: 3, minRing: 5, fill: 0.86 } as const

/** Without the clip's own outline: how far a clip stands in from its pocket's land at each end and each side, mm. */
export const CLIP_END_FLOAT = 0.3
export const CLIP_SIDE_PASS = 0.2
/** Room kept round the magnified part inside the circle, mm. */
const DETAIL_MARGIN = { key: 2, clip: 1.5 } as const

/** What the figure needs of a seated part (core/fixing/seated.ts SeatedPart): which part, and where. */
export interface SeatedLike {
  kind: 'clip' | 'key'
  x: number
  y: number
  turns: 0 | 1 | 2 | 3
}

/** The clip as it prints (core/fixing/mechanism.ts clipPlan): its outline in its own frame, mm, x along it, centred on the origin, and its hole's radii. */
export interface ClipShape {
  outline: readonly number[]
  hole: number
  sink: number
}

export interface TileBackInput {
  /** The piece's size, mm. */
  width: number
  height: number
  /** The joint between tiles, mm: a key spans it, and the neighbour's edge stands this far off. */
  joint: number
  /** The pockets in the piece's back (pieceFeatures), piece-local mm. */
  features: readonly BackFeature[]
  /** The printed parts as they sit in this piece (seatedParts), piece-local mm. */
  seated: readonly SeatedLike[]
  /** The clip to seat in a clip pocket; without it, a clip of the drawings' proportions sized to the pocket. */
  clip?: ClipShape
}

type Point = [number, number]
type Box = [number, number, number, number]

export interface TileBackDetail {
  role: BackFeature['role']
  /** The detail circle. */
  cx: number
  cy: number
  r: number
  /** Detail scale in figure units per mm, and how many times the main view it magnifies. */
  scale: number
  magnification: number
  /** The small ring round the chosen pocket in the main view. */
  focus: { cx: number; cy: number; r: number }
  /** From the small ring to the detail circle; null if the two would touch. */
  leader: { x1: number; y1: number; x2: number; y2: number } | null
  /** The piece's outline at the detail's scale (clipped to the circle when drawn). */
  back: string
  /** The pocket's outline at the back face. */
  pocket: string
  /** A clip pocket's ceiling, wider than its mouth and hidden behind the lips: drawn dashed. */
  hidden: string | null
  /** The neighbour across the joint a key reaches into: its area, its edge and its half of the notch. */
  neighbour: { area: string; edge: string; notch: string } | null
  /** The seated part: the key across the joint, or the clip in its pocket (fill-rule evenodd: the clip's hole). */
  part: string
  /** The clip's countersink rim. */
  sink: { cx: number; cy: number; r: number } | null
}

export interface TileBackLayout {
  /** The viewBox, from the origin. */
  width: number
  height: number
  /** Main view scale, figure units per mm. */
  scale: number
  /** The piece's outline, seen from the back. */
  back: string
  /** Each pocket's outline at the back face, seen from the back. */
  features: { role: BackFeature['role']; path: string }[]
  detail: TileBackDetail | null
}

const round = (v: number) => Math.round(v * 100) / 100

function pathOf(points: readonly Point[], close = true): string {
  if (points.length === 0) return ''
  return `M${points.map(([x, y]) => `${round(x)} ${round(y)}`).join(' L')}${close ? ' Z' : ''}`
}

function ringPoints(ring: Ring): Point[] {
  const points: Point[] = []
  for (let i = 0; i + 1 < ring.length; i += 2) points.push([ring[i], ring[i + 1]])
  return points
}

function boxOf(points: readonly Point[]): Box {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of points) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  return [x0, y0, x1, y1]
}

const area = ([x0, y0, x1, y1]: Box) => (x1 - x0) * (y1 - y0)

/** Every outline a feature has, bottom and top of each level. */
function allRings(feature: BackFeature): Ring[] {
  return feature.levels.flatMap((level) => (level.ringTop ? [level.ring, level.ringTop] : [level.ring]))
}

/** The outline the feature cuts in the back face: its first level's bottom ring. */
function footprint(feature: BackFeature): Point[] {
  return feature.levels.length > 0 ? ringPoints(feature.levels[0].ring) : []
}

/** The ring with the smallest (narrowest: a clip pocket's land, a key notch's nominal shape) or largest bounding box. */
function extremeRing(feature: BackFeature, pick: 'smallest' | 'largest'): Point[] {
  let best: Point[] = []
  let bestArea = pick === 'smallest' ? Infinity : -Infinity
  for (const ring of allRings(feature)) {
    const points = ringPoints(ring)
    const a = area(boxOf(points))
    if (pick === 'smallest' ? a < bestArea : a > bestArea) {
      best = points
      bestArea = a
    }
  }
  return best
}

/** Whether a piece-local point lies on a side's line. */
function onSide(side: Side, [x, y]: Point, width: number, height: number): boolean {
  const eps = 1e-6
  if (side === 0) return Math.abs(y) < eps
  if (side === 1) return Math.abs(x - width) < eps
  if (side === 2) return Math.abs(y - height) < eps
  return Math.abs(x) < eps
}

/** Along-the-side coordinate of a point as the piece's outline walks that side, so detours splice in order. */
function alongSide(side: Side, [x, y]: Point, width: number, height: number): number {
  if (side === 0) return x
  if (side === 1) return y
  if (side === 2) return width - x
  return height - y
}

/**
 * One tab as a detour along the side it stands on: from where the outline leaves the side line, round the
 * material, back to where it rejoins it. Its root edge (the two consecutive vertices on the line) is what
 * the walk replaces. Empty for a feature with no root edge on its side.
 */
function tabDetour(feature: BackFeature, width: number, height: number): Point[] {
  const ring = footprint(feature)
  const side = feature.side
  if (side === null || ring.length < 3) return []
  const n = ring.length
  for (let k = 0; k < n; k++) {
    if (!onSide(side, ring[k], width, height) || !onSide(side, ring[(k + 1) % n], width, height)) continue
    const walk = Array.from({ length: n }, (_, i) => ring[(k + 1 + i) % n])
    // The outline walks each side one way, so the detour is turned to leave and rejoin it in that order.
    return alongSide(side, walk[0], width, height) <= alongSide(side, walk[n - 1], width, height) ? walk : walk.reverse()
  }
  return []
}

/**
 * The piece's own silhouette seen from the back: its rectangle, with a detour out around every tab standing
 * past a side, in the order they sit along it. The rectangle alone would leave a tab hanging outside the
 * outline of the very tile it belongs to, which is the one thing this drawing must not show.
 */
function pieceOutline(input: TileBackInput): Point[] {
  const { width, height } = input
  const corners: Point[] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ]
  const tabs = input.features.filter((f) => f.outward === true && f.side !== null && f.levels.length > 0)
  if (tabs.length === 0) return corners
  const out: Point[] = []
  for (const side of [0, 1, 2, 3] as const) {
    out.push(corners[side])
    const detours = tabs
      .filter((f) => f.side === side)
      .map((f) => tabDetour(f, width, height))
      .filter((detour) => detour.length > 0)
      .sort((a, b) => alongSide(side, a[0], width, height) - alongSide(side, b[0], width, height))
    for (const detour of detours) out.push(...detour)
  }
  return out
}

/** The reflection across the middle of the joint beyond a side: a point of this tile's notch to the neighbour's. */
export function acrossJoint(side: Side, width: number, height: number, joint: number): (p: Point) => Point {
  if (side === 0) return ([x, y]) => [x, -joint - y]
  if (side === 1) return ([x, y]) => [2 * width + joint - x, y]
  if (side === 2) return ([x, y]) => [x, 2 * height + joint - y]
  return ([x, y]) => [-joint - x, y]
}

/**
 * The key seated across a notch on `side`: the notch's outline in this tile and its mirror in the
 * neighbour's, joined across the joint. `ring` is the notch's nominal outline, which has exactly one
 * edge on the side line (the opening); without one, the ring itself is returned.
 */
export function keyAcross(ring: readonly Point[], side: Side, width: number, height: number, joint: number): Point[] {
  const n = ring.length
  let opening = -1
  for (let k = 0; k < n; k++) {
    if (onSide(side, ring[k], width, height) && onSide(side, ring[(k + 1) % n], width, height)) {
      opening = k
      break
    }
  }
  if (opening < 0) return [...ring]
  const mirror = acrossJoint(side, width, height, joint)
  // This tile's half from the far end of the opening round to its near end, then the neighbour's half back.
  const mine = Array.from({ length: n }, (_, i) => ring[(opening + 1 + i) % n])
  const theirs = mine.map(mirror).reverse()
  return [...mine, ...theirs]
}

/** Where a key notch's detail is centred: the middle of its opening, out to the middle of the joint. */
function notchFocus(feature: BackFeature, width: number, height: number, joint: number): Point {
  const [x0, y0, x1, y1] = boxOf(footprint(feature))
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  if (feature.side === 0) return [mx, -joint / 2]
  if (feature.side === 1) return [width + joint / 2, my]
  if (feature.side === 2) return [mx, height + joint / 2]
  if (feature.side === 3) return [-joint / 2, my]
  return [mx, my]
}

/** Where a feature's detail is centred, piece-local mm. */
function focusOf(feature: BackFeature, input: TileBackInput): Point {
  if (feature.side !== null) return notchFocus(feature, input.width, input.height, input.joint)
  const [x0, y0, x1, y1] = boxOf(extremeRing(feature, 'smallest'))
  return [(x0 + x1) / 2, (y0 + y1) / 2]
}

/** Whether a seated part sits in this feature: a clip inside the pocket, a key at the joint beyond the notch. */
function holdsPart(feature: BackFeature, part: SeatedLike, input: TileBackInput): boolean {
  if ((part.kind === 'clip') !== (feature.role === 'clip-pocket')) return false
  const [fx, fy] = focusOf(feature, input)
  const [x0, y0, x1, y1] = boxOf(footprint(feature))
  const reach = Math.max(x1 - x0, y1 - y0) / 2 + input.joint / 2 + 1
  return Math.hypot(part.x - fx, part.y - fy) <= reach
}

/**
 * The pocket the detail shows: a clip pocket when the piece has one, else a key notch; among those, one
 * whose part seatedParts places, when any does; then the one drawn furthest right (nearest the detail
 * circle), and of those the highest.
 */
export function chooseFeature(input: TileBackInput): BackFeature | null {
  const clips = input.features.filter((f) => f.role === 'clip-pocket' && f.levels.length > 0)
  // Else the recess the tile-to-tile lock cuts, whichever of the two this design has: a key notch or a socket.
  const pool =
    clips.length > 0
      ? clips
      : input.features.filter((f) => (f.role === 'key-pocket' || f.role === 'join-socket') && f.levels.length > 0)
  if (pool.length === 0) return null
  const seated = pool.filter((f) => input.seated.some((part) => holdsPart(f, part, input)))
  const candidates = seated.length > 0 ? seated : pool
  // Seen from the back x is mirrored: drawn furthest right is the smallest piece x; drawn highest is the largest y.
  const key = (f: BackFeature) => {
    const [x, y] = focusOf(f, input)
    return [Math.round(x * 2) / 2, -y] as const
  }
  return candidates.reduce((best, f) => {
    const [bx, by] = key(best)
    const [x, y] = key(f)
    return x < bx || (x === bx && y < by) ? f : best
  })
}

/** The small ring round a pocket in the main view: centred on the detail's focus, clear of the pocket's outline. */
function ringRadius(feature: BackFeature, focus: Point, s: number): number {
  const reach = Math.max(0, ...footprint(feature).map(([x, y]) => Math.hypot(x - focus[0], y - focus[1])))
  return Math.max(FIGURE.minRing, reach * s + FIGURE.ringPad)
}

/**
 * Lays out the figure: the piece at scale, its pockets, and the detail circle beside it. The main view's
 * extent takes in the ring round the chosen pocket, which may stand past the piece's edge.
 */
export function tileBackLayout(input: TileBackInput): TileBackLayout {
  const { width, height } = input
  const { size, gap, radius, pad } = FIGURE
  const s = size / Math.max(width, height, 1e-6)
  const pw = width * s
  const ph = height * s
  const chosen = chooseFeature(input)
  const focus = chosen ? focusOf(chosen, input) : null
  const ringR = chosen && focus ? ringRadius(chosen, focus, s) : 0
  // The ring's centre in the piece's own box (seen from the back), and the main view's extent round it.
  const fx = focus ? (width - focus[0]) * s : 0
  const fy = focus ? (height - focus[1]) * s : 0
  const piece = pieceOutline(input)
  // Seen from the back x runs the other way, so a tab standing past the right side lands left of the tile.
  const [bx0, by0, bx1, by1] = boxOf(piece.map(([x, y]): Point => [(width - x) * s, (height - y) * s]))
  const left = Math.min(bx0, focus ? fx - ringR : 0)
  const top = Math.min(by0, focus ? fy - ringR : 0)
  const mainW = Math.max(bx1, focus ? fx + ringR : pw) - left
  const mainH = Math.max(by1, focus ? fy + ringR : ph) - top
  const boxH = chosen ? Math.max(mainH, 2 * radius) : mainH
  const ox = pad - left
  const oy = pad + (boxH - mainH) / 2 - top
  // Seen from the back: x runs the other way, and the drawing's y runs down.
  const main = ([x, y]: Point): Point => [ox + (width - x) * s, oy + (height - y) * s]
  const layout: TileBackLayout = {
    width: chosen ? pad + mainW + gap + 2 * radius + pad : mainW + 2 * pad,
    height: boxH + 2 * pad,
    scale: s,
    back: pathOf(piece.map(main)),
    features: input.features.map((f) => ({ role: f.role, path: pathOf(footprint(f).map(main)) })),
    detail: null,
  }
  if (chosen && focus) {
    const circle: Point = [pad + mainW + gap + radius, Math.min(Math.max(main(focus)[1], pad + radius), pad + boxH - radius)]
    layout.detail = detailOf(chosen, input, { s, main, piece, focus, ringR, circle })
  }
  return layout
}

interface MainView {
  s: number
  main: (p: Point) => Point
  piece: Point[]
  /** The detail's focus, piece-local mm; the ring round it in the main view; the detail circle's centre. */
  focus: Point
  ringR: number
  circle: Point
}

/**
 * The tab of the tile beside this one, standing in this socket, in this piece's own frame: the very tab this
 * piece carries on its far side, brought back across the joint. The hand is uniform (tab right, socket left),
 * so the two are the same shape; null on the last piece of a row, which has the socket and no tab of its own,
 * and then the socket is drawn empty.
 */
function neighbourTab(feature: BackFeature, input: TileBackInput): Point[] | null {
  const mine = input.features.find((f) => f.role === 'join-tab' && f.side !== null && f.levels.length > 0)
  if (!mine || mine.side === null || feature.side === null) return null
  const ring = footprint(mine)
  if (ring.length === 0) return null
  const [, sy0, , sy1] = boxOf(footprint(feature))
  const [, my0, , my1] = boxOf(ring)
  // Its own side line, back across the joint to the neighbour's, and along the side to this socket.
  const dx = -(input.width + input.joint)
  const dy = (sy0 + sy1) / 2 - (my0 + my1) / 2
  return ring.map(([x, y]): Point => [x + dx, y + dy])
}

function detailOf(feature: BackFeature, input: TileBackInput, view: MainView): TileBackDetail {
  const { width, height, joint } = input
  const { radius, fill } = FIGURE
  const { s, main, piece, focus, ringR } = view
  const [cx, cy] = view.circle
  const isKey = feature.role === 'key-pocket' && feature.side !== null
  const isSocket = feature.role === 'join-socket' && feature.side !== null
  const nominal = extremeRing(feature, 'smallest')
  const mouth = footprint(feature)
  const ceiling = extremeRing(feature, 'largest')
  // A key spans both tiles; a socket holds the neighbour's tab, which reaches back across the joint too.
  const part = isKey && feature.side !== null ? keyAcross(nominal, feature.side, width, height, joint) : (isSocket ? neighbourTab(feature, input) : null) ?? nominal
  const across = isKey || isSocket
  // How far the magnified part reaches from the detail's centre, mm.
  const reach = Math.max(
    ...(across ? part : ceiling).map(([x, y]) => Math.hypot(x - focus[0], y - focus[1])),
    1,
  )
  const d = Math.max(s, (radius * fill) / (reach + (across ? DETAIL_MARGIN.key : DETAIL_MARGIN.clip)))

  const [fx, fy] = main(focus)
  const dx = cx - fx
  const dy = cy - fy
  const dist = Math.hypot(dx, dy)
  const leader =
    dist > ringR + radius + 1
      ? { x1: fx + (dx / dist) * ringR, y1: fy + (dy / dist) * ringR, x2: cx - (dx / dist) * radius, y2: cy - (dy / dist) * radius }
      : null

  // The detail: mirrored like the main view, magnified about the focus, centred in the circle.
  const at = ([x, y]: Point): Point => [cx - (x - focus[0]) * d, cy - (y - focus[1]) * d]
  const detail: TileBackDetail = {
    role: feature.role,
    cx,
    cy,
    r: radius,
    scale: d,
    magnification: d / s,
    focus: { cx: fx, cy: fy, r: ringR },
    leader,
    back: pathOf(piece.map(at)),
    pocket: pathOf(mouth.map(at)),
    hidden: null,
    neighbour: null,
    part: pathOf(part.map(at)),
    sink: null,
  }
  if (across && feature.side !== null) {
    // The neighbour's own recess is drawn hidden beside a key; behind a tab there is none to draw.
    detail.neighbour = neighbourOf(feature.side, input, focus, radius / d, at, isKey ? mouth : [])
    return detail
  }
  // A clip in its pocket, centred on the land and lying along its long side.
  const [lx0, ly0, lx1, ly1] = boxOf(nominal)
  const along = lx1 - lx0 >= ly1 - ly0 ? 'h' : 'v'
  detail.hidden = pathOf(ceiling.map(at))
  if (input.clip) {
    const { outline, hole, sink } = input.clip
    const clip: Point[] = []
    for (let i = 0; i + 1 < outline.length; i += 2) {
      const [u, v] = [outline[i], outline[i + 1]]
      // A quarter turn for a clip along y ('v'), as seatedParts turns it.
      clip.push(along === 'h' ? [focus[0] + u, focus[1] + v] : [focus[0] - v, focus[1] + u])
    }
    detail.part = `${pathOf(clip.map(at))} ${circlePath(cx, cy, hole * d)}`
    detail.sink = { cx, cy, r: sink * d }
    return detail
  }
  // Without it: as long as the land less its float, as wide as the land less its pass clearance.
  const long = Math.max(lx1 - lx0, ly1 - ly0)
  const short = Math.min(lx1 - lx0, ly1 - ly0)
  const length = Math.max(long * 0.8, long - 2 * CLIP_END_FLOAT)
  const body = Math.max(short * 0.8, short - 2 * CLIP_SIDE_PASS)
  const plan = clipPlan(cx, cy, length * d, body * d, along)
  detail.part = plan.path
  detail.sink = plan.sink
  return detail
}

/** The tile across the joint from a key notch: the area past its edge, its edge, and its half of the notch. */
function neighbourOf(
  side: Side,
  input: TileBackInput,
  focus: Point,
  window: number,
  at: (p: Point) => Point,
  mouth: readonly Point[],
): { area: string; edge: string; notch: string } {
  const { width, height, joint } = input
  const [fx, fy] = focus
  // Far enough to cover the circle whatever the joint.
  const far = 2 * window + joint
  let region: Point[]
  let edge: Point[]
  if (side === 0 || side === 2) {
    const e = side === 0 ? -joint : height + joint
    const out = side === 0 ? e - far : e + far
    region = [
      [fx - far, e],
      [fx + far, e],
      [fx + far, out],
      [fx - far, out],
    ]
    edge = [
      [fx - far, e],
      [fx + far, e],
    ]
  } else {
    const e = side === 3 ? -joint : width + joint
    const out = side === 3 ? e - far : e + far
    region = [
      [e, fy - far],
      [e, fy + far],
      [out, fy + far],
      [out, fy - far],
    ]
    edge = [
      [e, fy - far],
      [e, fy + far],
    ]
  }
  const mirror = acrossJoint(side, width, height, joint)
  return { area: pathOf(region.map(at)), edge: pathOf(edge.map(at), false), notch: pathOf(mouth.map(mirror).map(at)) }
}
