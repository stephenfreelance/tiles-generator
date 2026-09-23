// The shapes behind the fixing drawings, as plain path strings. Pure, so vitest can hold the drawings
// to the rules they illustrate (a key straddles its seam, no key sits on the outside edge of a block,
// a clip passes the pocket's land and its barbs catch behind it) without a DOM.
//
// Units are the drawings' own, not mm. The side sections draw depth about twice as deep as it is, or
// a 4 mm plate beside a 150 mm tile would be a hairline, and the keys and clips at several times their size.
import {
  BLOCK_HALF_WIDTH,
  CLIP_THICKNESS,
  POCKET_DEPTH,
  STOP_HALF_LENGTH,
  STOP_OFFSET,
  STOP_WIDTH,
} from '@/core/fixing/mechanism'

/** x of the wall's face in the side sections: the wall is on the left, the tiles stand to its right. */
export const WALL_FACE = 24
/** The joint between the two tiles of a side section, and the gap drawn for it. */
export const JOINT_Y = 50
export const JOINT_GAP = 1.2
/** The base plate, seen edge on, and the relief riding on its face. */
export const PLATE = 7
export const RELIEF_AMP = 4
/** One wave of relief along a tile's face: eight to a tile, so it reads as a pattern and not as a bump. */
export const WAVE_PERIOD = 12.5

/**
 * The studio's choice cards: an 80 x 56 box. The side sections put the wall's face at x = 16 and the
 * joint between the two tiles at y = 28; the back views stand two tiles side by side, the gap between
 * them drawn 4 wide, far wider than it prints, so the joint reads at card size.
 */
export const CARD = { width: 80, height: 56, wallFace: 16, jointY: 28, tileW: 34, tileH: 44, gap: 4, top: 6 } as const

/**
 * How the clip section is scaled in each drawing, [depth, height]: depth stays at the plate's scale (the
 * pocket must fit under the plate), height is stretched so the lips and barbs read at the drawing's size.
 */
export const CLIP_SCALE = { card: [0.8, 1], section: [1, 1.5] } as const

/** The two tiles of a back-view card, left then right: each tile's top-left corner and size. */
export function cardTiles(): { x: number; y: number; w: number; h: number }[] {
  const left = (CARD.width - 2 * CARD.tileW - CARD.gap) / 2
  return [0, 1].map((i) => ({ x: left + i * (CARD.tileW + CARD.gap), y: CARD.top, w: CARD.tileW, h: CARD.tileH }))
}

/**
 * A bow-tie key: half its length, where its shoulders are, and the half-widths of its head and neck. A fit
 * test's key carries 1 to 3 V notches in its +x end (core/fixing/joins.ts): their pitch, width and depth,
 * drawn about three times their size so they can be counted at icon size.
 */
export const KEY = { half: 8, shoulder: 3, head: 5, neck: 2.5, markPitch: 2.2, markWidth: 1.3, markDepth: 1.5 } as const

const round = (value: number): number => Math.round(value * 100) / 100

/** How many fit marks a part carries: 0 to 3, whole. */
const markCount = (marks: number): number => Math.max(0, Math.min(3, Math.round(marks)))

/**
 * The V notches of `marks` fit marks across an end at `along`, centred on the end's middle and cut back
 * towards the part's centre (`inward` is -1 at a +along end): [along, across] corners, walked with across
 * increasing.
 */
function markNotches(along: number, inward: number, marks: number, pitch: number, width: number, depth: number): [number, number][] {
  const count = markCount(marks)
  const corners: [number, number][] = []
  for (let m = 0; m < count; m++) {
    const at = (m - (count - 1) / 2) * pitch
    corners.push([along, at - width / 2], [along + inward * depth, at], [along, at + width / 2])
  }
  return corners
}

const pathOf = (points: readonly (readonly [number, number])[]): string =>
  `M${points.map(([x, y]) => `${round(x)} ${round(y)}`).join(' L')} Z`

/** The same, left open: an outline that is not a closed shape (a pocket seen in section, open at its mouth). */
const polylineOf = (points: readonly (readonly [number, number])[]): string =>
  `M${points.map(([x, y]) => `${round(x)} ${round(y)}`).join(' L')}`

/** A full circle as a path of two arcs, so it can be a hole in a compound path (fill-rule evenodd). */
export function circlePath(cx: number, cy: number, r: number): string {
  return `M${round(cx - r)} ${round(cy)} A${round(r)} ${round(r)} 0 1 0 ${round(cx + r)} ${round(cy)} A${round(r)} ${round(r)} 0 1 0 ${round(cx - r)} ${round(cy)} Z`
}

/**
 * A tile seen edge on, its back at x = `back`, from y0 to y1: the base plate and a relief wave on its
 * face. The wave's phase is taken from y itself, so two tiles drawn one above the other carry on each
 * other's pattern across the joint, as the printed ones do.
 */
export function tileSectionPath(back: number, y0: number, y1: number): string {
  const face = back + PLATE
  const samples = Math.max(2, Math.ceil(Math.abs(y1 - y0) / 1.25))
  const points: [number, number][] = [[back, y0]]
  for (let i = 0; i <= samples; i++) {
    const y = y0 + ((y1 - y0) * i) / samples
    points.push([face + (RELIEF_AMP / 2) * (1 + Math.sin((2 * Math.PI * y) / WAVE_PERIOD)), y])
  }
  points.push([back, y1])
  return pathOf(points)
}

/**
 * The outline of a key straddling a seam at (cx, cy): a square-shouldered double T, its length across
 * the seam. `horizontal` lays it across a vertical seam. `grow` offsets the outline outwards, which is
 * how the pocket around a key is drawn, and `scale` sizes the whole shape. `marks` (0 to 3) cuts a fit
 * test key's notches in its +along end (right when horizontal, down when not).
 */
export function keyPath(cx: number, cy: number, horizontal: boolean, grow = 0, scale = 1, marks = 0): string {
  const half = KEY.half * scale + grow
  const shoulder = KEY.shoulder * scale - grow
  const head = KEY.head * scale + grow
  const neck = KEY.neck * scale + grow
  // Walked once in (along, across) terms, then laid onto the axes the key lies on.
  const outline: [number, number][] = [
    [-half, -head],
    [-shoulder, -head],
    [-shoulder, -neck],
    [shoulder, -neck],
    [shoulder, -head],
    [half, -head],
    ...markNotches(half, -1, marks, KEY.markPitch * scale, KEY.markWidth * scale, KEY.markDepth * scale),
    [half, head],
    [shoulder, head],
    [shoulder, neck],
    [-shoulder, neck],
    [-shoulder, head],
    [-half, head],
  ]
  return pathOf(outline.map(([along, across]) => (horizontal ? [cx + along, cy + across] : [cx + across, cy + along])))
}

/** One place a key goes: the seam point it straddles, and whether it lies across a vertical seam. */
export interface KeySpot {
  x: number
  y: number
  horizontal: boolean
}

export interface TileBlock {
  columns: number
  rows: number
  /** One tile's width and height, and the joint drawn between them. */
  w: number
  h: number
  gap: number
  /** Top-left corner of the block. */
  x0: number
  y0: number
}

/** The top-left corner of every tile in a block, row by row. */
export function blockTiles({ columns, rows, w, h, gap, x0, y0 }: TileBlock): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) tiles.push({ x: x0 + column * (w + gap), y: y0 + row * (h + gap) })
  }
  return tiles
}

/**
 * Where the keys go on the back of a block of tiles: two on every tile side, at a quarter and three
 * quarters of it, and only on the seams inside the block, never along its outside edge. That is the
 * lattice the studio lays at its simplest (straight bond, tiles under 240 mm).
 */
export function keySpots({ columns, rows, w, h, gap, x0, y0 }: TileBlock): KeySpot[] {
  const spots: KeySpot[] = []
  for (let column = 1; column < columns; column++) {
    const x = x0 + column * (w + gap) - gap / 2
    for (let row = 0; row < rows; row++) {
      for (const at of [0.25, 0.75]) spots.push({ x, y: y0 + row * (h + gap) + at * h, horizontal: true })
    }
  }
  for (let row = 1; row < rows; row++) {
    const y = y0 + row * (h + gap) - gap / 2
    for (let column = 0; column < columns; column++) {
      for (const at of [0.25, 0.75]) spots.push({ x: x0 + column * (w + gap) + at * w, y, horizontal: false })
    }
  }
  return spots
}

/**
 * A tab standing out past a tile's side, in the key's own (along, across) terms: how far it reaches past
 * the side line, and where its shoulder sits. Its head and neck are KEY's, because a printed tab is the
 * printed key's own section with one half fused into the tile (core/fixing/tabs.ts).
 */
export const TAB = { reach: 11, shoulder: 5.5 } as const

/** Where a pair sits along a joint, as a fraction of the tile's height: the key lattice, drawn. */
export const TAB_SPOTS: readonly number[] = [0.3, 0.7]

/**
 * A tab rooted on a vertical side line at (x, y) and reaching to the right: the key's outline with its other
 * half amputated at the side line, so the root edge carries the neck's full width. `grow` offsets it
 * outwards, which is how the socket round it is drawn, and `scale` sizes the whole shape. There is no hand
 * to pass in: a tab points the same way on every tile of every wall (core/fixing/tabs.ts TAB_SIDE).
 */
export function tabPath(x: number, y: number, grow = 0, scale = 1): string {
  const reach = TAB.reach * scale + grow
  const shoulder = TAB.shoulder * scale - grow
  const head = KEY.head * scale + grow
  const neck = KEY.neck * scale + grow
  return pathOf([
    [x, y - neck],
    [x + shoulder, y - neck],
    [x + shoulder, y - head],
    [x + reach, y - head],
    [x + reach, y + head],
    [x + shoulder, y + head],
    [x + shoulder, y + neck],
    [x, y + neck],
  ])
}

/**
 * Where the pairs go along one joint of a block: the tab's root on the left tile's side, one per lattice
 * spot. `spots` overrides the lattice, for a fit-test coupon, which carries one pair at mid-height.
 */
export function tabSpots({ rows, w, h, gap, x0, y0 }: TileBlock, column: number, spots: readonly number[] = TAB_SPOTS): { x: number; y: number }[] {
  const x = x0 + column * (w + gap) + w
  return Array.from({ length: rows }, (_, row) => spots.map((at) => ({ x, y: y0 + row * (h + gap) + at * h }))).flat()
}

// ---------------------------------------------------------------------------------------------------
// The wall clip in side section: the section across its catch, wall on the left.

/** Section units per mm of depth: PLATE draws the 4 mm base plate the pocket is sized for. */
const DEPTH_PER_MM = PLATE / 4
/** The clip's half-height at the land in section units (CLIP_SECTION.body), and what that stands for across the catch, per mm. */
const SECTION_BODY = 4.6
const ACROSS_PER_MM = SECTION_BODY / BLOCK_HALF_WIDTH

/**
 * The clip and its pocket across the catch, in side-section units at scale 1 (the 76 x 100 sections):
 * depth `u` from the tile's back towards the room, half-heights `v` about the clip's centre line. Depth
 * is drawn at the plate's scale (mechanism.ts's 2.8 mm of pocket and 2.4 mm of clip under a 4 mm plate
 * drawn 7 deep), the heights about three times larger, so the lips and the barbs read. The pocket opens
 * through a lead-in to its land (the narrowest place), then flares wider to a flat ceiling; the clip
 * passes the land, its barbs spring out behind the lips into the flare, and its two stops rest on the
 * ceiling, which is what sets its back level with the tile's back.
 */
export const CLIP_SECTION = {
  /** The pocket: its ceiling's depth, the lead-in's depth and mouth, the land's end and half-height, the ceiling's half-height. */
  depth: round(POCKET_DEPTH * DEPTH_PER_MM),
  lead: 0.7,
  mouth: 6.2,
  landEnd: 1.3,
  land: 5,
  ceiling: 7,
  /** The clip: its thickness and half-height at the land, where its barbs' return faces start, their tips, the top chamfer. */
  thick: round(CLIP_THICKNESS * DEPTH_PER_MM),
  body: SECTION_BODY,
  returnAt: 1.5,
  barb: 6,
  tipAt: 3.1,
  tipEnd: 3.5,
  chamfer: 0.6,
  /**
   * The thin double-sided tape between the clip's back and the wall, and so the gap behind the tile: about
   * three times as thick as 0.2 mm, a hairline that still shows at the guide's size.
   */
  tape: 1,
  /** The two stops on the centre block, from the clip's top to the ceiling: their middle's height off the centre line, and width. */
  stop: round(STOP_OFFSET * ACROSS_PER_MM),
  stopWidth: round(STOP_WIDTH * ACROSS_PER_MM),
} as const

/** Half-height of the clip pocket at depth u into the tile (section units, scale 1): the void a barb may use there. */
export function clipPocketHalfAt(u: number): number {
  const c = CLIP_SECTION
  if (u <= 0) return c.mouth
  if (u < c.lead) return c.mouth + ((c.land - c.mouth) * u) / c.lead
  if (u <= c.landEnd) return c.land
  if (u <= c.depth) return c.land + ((c.ceiling - c.land) * (u - c.landEnd)) / (c.depth - c.landEnd)
  return 0
}

/**
 * The clip pocket in section, its mouth on the tile's back at x = `back`, centred on y, scaled about that
 * point by k in depth and kv in height: an open outline (the mouth is where the tile's back is not),
 * drawn dashed over the tile.
 */
export function clipPocketSectionPath(back: number, y: number, k = 1, kv = k): string {
  const c = CLIP_SECTION
  const half: [number, number][] = [
    [0, c.mouth],
    [c.lead, c.land],
    [c.landEnd, c.land],
    [c.depth, c.ceiling],
  ]
  const points = [...half.map(([u, v]) => [u, -v] as const), ...[...half].reverse().map(([u, v]) => [u, v] as const)]
  return polylineOf(points.map(([u, v]) => [back + k * u, y + kv * v]))
}

/**
 * The clip in section, its back at x = `back` (level with the tile's back, on the tape), centred on y,
 * scaled by k in depth and kv in height: the body that passes the land, a barb each side whose return
 * face the lips bear on, and a top chamfer that the pocket's lead-in pushes in as the tile goes on. Cut
 * through the centre block, with the barbs of the tines beyond it seen past the cut. Its stops are drawn
 * on top of it (clipStopsSectionPath).
 */
export function clipSectionPath(back: number, y: number, k = 1, kv = k): string {
  const c = CLIP_SECTION
  const half: [number, number][] = [
    [0, c.body],
    [c.returnAt, c.body],
    [c.tipAt, c.barb],
    [c.tipEnd, c.barb],
    [c.thick, c.barb - c.chamfer],
  ]
  const points = [...half.map(([u, v]) => [u, -v] as const), ...[...half].reverse().map(([u, v]) => [u, v] as const)]
  return pathOf(points.map(([u, v]) => [back + k * u, y + kv * v]))
}

/**
 * The clip's two stops in section, the clip's back at x = `back`: short ribs from the clip's top up to the
 * pocket's ceiling. They stay on for good: clicked in, they rest on the ceiling with the clip's back level
 * with the tile's back, on the wall or off it, and pressing the tile on presses the tape through them.
 * Two rectangles, scaled like the clip.
 */
export function clipStopsSectionPath(back: number, y: number, k = 1, kv = k): string {
  const c = CLIP_SECTION
  return [-1, 1]
    .map((sign) => {
      const v0 = sign * c.stop - c.stopWidth / 2
      const v1 = sign * c.stop + c.stopWidth / 2
      return pathOf([
        [back + k * c.thick, y + kv * v0],
        [back + k * c.depth, y + kv * v0],
        [back + k * c.depth, y + kv * v1],
        [back + k * c.thick, y + kv * v1],
      ])
    })
    .join(' ')
}

/** How far the upper tile of the clip side section stands off the wall while it is pressed on or pulled off. */
export const PULLED = 20

/** One tile of a clip side section, as x positions: its back, its clip's back, and the tape's wall side. */
export interface ClipWallTile {
  back: number
  clip: number
  tape: number
}

/**
 * Where a clip side section puts its two tiles, their clips and their tape, the wall's face at `face` and
 * the tape `tape` thick. A tile on its clips stands a tape's thickness off the wall, never on it: its clip's
 * back lies level with the tile's back (the stops on the ceiling), the tape between the clip and the wall.
 * 'press': the upper tile on its way, its clip in it and the tape proud of the clip. 'off': the upper tile
 * pulled off, its clip left on the wall on its tape.
 */
export function clipWallTiles(
  show: 'on' | 'press' | 'off',
  face = WALL_FACE,
  tape: number = CLIP_SECTION.tape,
  pulled = PULLED,
): { upper: ClipWallTile; lower: ClipWallTile } {
  const onWall: ClipWallTile = { back: face + tape, clip: face + tape, tape: face }
  if (show === 'on') return { upper: onWall, lower: onWall }
  const back = face + pulled
  return {
    upper: show === 'press' ? { back, clip: back, tape: back - tape } : { back, clip: face + tape, tape: face },
    lower: onWall,
  }
}

/**
 * The optional screw through a clip, in the same section: a countersunk head sunk in the clip's centre
 * block (its top just under the clip's top, clear of the pocket ceiling) and a shank through the clip,
 * the tape and a wall plug. `back` is the clip's back; `reach` how far the shank runs into the wall.
 */
export const SCREW_SECTION = { head: 2.5, shank: 1.25, sunk: 0.2, plug: 1.9 } as const

export function screwSectionPath(back: number, y: number, k = 1, reach = 16): string {
  const c = CLIP_SECTION
  const s = SCREW_SECTION
  const top = c.thick - s.sunk
  // A 90 degree head: it narrows by as much as it drops.
  const neck = top - (s.head - s.shank)
  const points: [number, number][] = [
    [top, -s.head],
    [neck, -s.shank],
    [-reach + s.shank, -s.shank],
    [-reach, 0],
    [-reach + s.shank, s.shank],
    [neck, s.shank],
    [top, s.head],
  ]
  return pathOf(points.map(([u, v]) => [back + k * u, y + k * v]))
}

// ---------------------------------------------------------------------------------------------------
// The wall clip in plan: seen from the back of the tile (or from the wall), as it prints.

/**
 * The clip's plan, in mm at scale 1 (core/fixing/mechanism.ts's clip), lying along x: a centre block that
 * carries the tape and the countersunk hole for the optional screw, a stiff spine running out to both
 * ends, and a springy tine along each long edge on each side of the block, cut free of the spine by a
 * slot, with a barb at its tip. Slots and tines are drawn a little wider than they print, and the barbs
 * stand out a little further, so the comb reads at icon size. The two stops stand on the block's top face,
 * beside the countersink, at their real size (mechanism.ts): seen only from above the clip as it prints.
 * A fit test's clip carries 1 to 3 V notches in its spine's +x end, drawn larger than they print so they
 * can be counted at icon size.
 */
export const CLIP_PLAN = {
  /** Half the length, tip to tip, and half the width of the body (the tines' outer faces). */
  half: 24,
  body: 6.3,
  /** How far the barbs stand out past the body, how long they are along the tine, and the chamfer at the tip. */
  barb: 1.1,
  barbLength: 4,
  tip: 0.6,
  /** The tines' width, the slot beside each, and half the centre block's length. */
  tine: 1.4,
  slot: 1.5,
  block: 5,
  /** The through hole and the rim of its countersink. */
  hole: 2.65,
  sink: 3.75,
  /** The stops: half their length along the clip, their width, and their middle's distance off the centre line. */
  stopHalf: STOP_HALF_LENGTH,
  stopWidth: STOP_WIDTH,
  stopOffset: STOP_OFFSET,
  /** The fit marks in the spine's end: their pitch and width across it, and how deep they cut along it. */
  markPitch: 2.4,
  markWidth: 1.6,
  markDepth: 2.8,
} as const

export interface ClipPlan {
  /** The outline, with the through hole as a second ring: draw it with fill-rule evenodd. */
  path: string
  /** The countersink's rim, a circle around the hole. */
  sink: { cx: number; cy: number; r: number }
  /** The centre block, where the tape goes: [x0, y0, x1, y1]. */
  block: [number, number, number, number]
  /** The two stops on the block's top face, [x0, y0, x1, y1] each. */
  stops: [number, number, number, number][]
}

/**
 * A clip in plan centred on (cx, cy): `length` tip to tip and `width` across its body (barbs excluded),
 * lying along x ('h') or along y ('v'). Every other size follows CLIP_PLAN's proportions. `marks` (0 to 3)
 * cuts a fit test clip's notches in the spine's +x end (+y for a 'v' clip).
 */
export function clipPlan(cx: number, cy: number, length: number, width: number, axis: 'h' | 'v' = 'h', marks = 0): ClipPlan {
  const p = CLIP_PLAN
  const kx = length / (2 * p.half)
  const ky = width / (2 * p.body)
  const h = p.half * kx
  const body = p.body * ky
  const barb = (p.body + p.barb) * ky
  const barbLength = p.barbLength * kx
  const tip = Math.min(p.tip * kx, p.tip * ky)
  const spine = (p.body - p.tine - p.slot) * ky
  const slotTop = (p.body - p.tine) * ky
  const block = p.block * kx
  const back = h - barbLength - (barb - body)
  // The right end, bottom to top: the lower barb and slot up to the spine's end, then the upper slot and barb.
  const lower: [number, number][] = [
    [back, -body],
    [h - barbLength, -barb],
    [h - tip, -barb],
    [h, -barb + tip],
    [h, -slotTop],
    [block, -slotTop],
    [block, -spine],
    [h, -spine],
  ]
  const upper: [number, number][] = [
    [h, spine],
    [block, spine],
    [block, slotTop],
    [h, slotTop],
    [h, barb - tip],
    [h - tip, barb],
    [h - barbLength, barb],
    [back, body],
  ]
  // The left end is the right one turned a half turn (the shape is symmetric about both axes), less the
  // marks, which only the right end's spine carries.
  const left = [...lower, ...upper].map(([x, y]) => [-x, -y] as [number, number])
  const right = [...lower, ...markNotches(h, -1, marks, p.markPitch * ky, p.markWidth * ky, p.markDepth * kx), ...upper]
  const place = ([x, y]: [number, number]): [number, number] => (axis === 'h' ? [cx + x, cy + y] : [cx + y, cy + x])
  const r = Math.min(kx, ky)
  const box = (x0: number, y0: number, x1: number, y1: number): [number, number, number, number] =>
    axis === 'h' ? [cx + x0, cy + y0, cx + x1, cy + y1] : [cx + y0, cy + x0, cx + y1, cy + x1]
  const stop = (sign: number) =>
    box(-p.stopHalf * kx, (sign * p.stopOffset - p.stopWidth / 2) * ky, p.stopHalf * kx, (sign * p.stopOffset + p.stopWidth / 2) * ky)
  return {
    path: `${pathOf([...right, ...left].map(place))} ${circlePath(cx, cy, p.hole * r)}`,
    sink: { cx, cy, r: p.sink * r },
    block: box(-block, -body, block, body),
    stops: [stop(-1), stop(1)],
  }
}

/** A clip in plan at a uniform scale of CLIP_PLAN (1 = its mm-like units). */
export function clipPlanAt(cx: number, cy: number, scale: number, axis: 'h' | 'v' = 'h', marks = 0): ClipPlan {
  return clipPlan(cx, cy, 2 * CLIP_PLAN.half * scale, 2 * CLIP_PLAN.body * scale, axis, marks)
}

/** The clip's pocket seen from the back at the same scale: the mouth around the clip, and the wider ceiling hidden behind the lips. */
export function clipPocketPlan(cx: number, cy: number, scale: number): { mouth: [number, number, number, number]; ceiling: [number, number, number, number] } {
  const p = CLIP_PLAN
  const mouthX = (p.half + 1.8) * scale
  const mouthY = (p.body + p.barb + 0.4) * scale
  const ceilingX = mouthX + 1.2 * scale
  const ceilingY = mouthY + 1.2 * scale
  return {
    mouth: [cx - mouthX, cy - mouthY, cx + mouthX, cy + mouthY],
    ceiling: [cx - ceilingX, cy - ceilingY, cx + ceilingX, cy + ceilingY],
  }
}

/** An arrow's line end and its head (one open chevron), pointing from (x1, y1) at (x2, y2). */
export function arrowHeadPath(x1: number, y1: number, x2: number, y2: number, size = 3.2): string {
  const towards = Math.atan2(y2 - y1, x2 - x1)
  const spread = 0.5
  const a = [x2 - size * Math.cos(towards - spread), y2 - size * Math.sin(towards - spread)]
  const b = [x2 - size * Math.cos(towards + spread), y2 - size * Math.sin(towards + spread)]
  return `M${round(a[0])} ${round(a[1])} L${round(x2)} ${round(y2)} L${round(b[0])} ${round(b[1])}`
}

/**
 * The wall from the front, for the start-line step: a level line for the bottom edge of the tiles, a
 * straight batten screwed on under it to carry the bottom row, and the tiles still to come above it.
 */
export const START_LINE = { x0: 14, x1: 130, line: 80, batten: 7, tileW: 36, tileH: 30, gap: 2, rows: 2, screwPitch: 29 } as const

/** Screws along the batten: evenly spaced, clear of both ends. */
export function battenScrews(): number[] {
  const span = START_LINE.x1 - START_LINE.x0
  const count = Math.max(2, Math.floor(span / START_LINE.screwPitch))
  const step = span / count
  return Array.from({ length: count }, (_, i) => START_LINE.x0 + step * (i + 0.5))
}

/** The tiles still to come, standing on the line, bottom row first: each one's top-left corner. */
export function startLineTiles(): { x: number; y: number }[] {
  const { x0, x1, line, tileW, tileH, gap, rows } = START_LINE
  const columns = Math.floor((x1 - x0 + gap) / (tileW + gap))
  const left = (x0 + x1 - columns * tileW - (columns - 1) * gap) / 2
  const tiles: { x: number; y: number }[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      tiles.push({ x: left + column * (tileW + gap), y: line - (row + 1) * tileH - row * gap })
    }
  }
  return tiles
}
