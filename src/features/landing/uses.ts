// The uses the home page shows under its title page: six plates, one room per use, each framed close on
// the surface a maker could tile, drawn at its real size and laid with the visitor's own tiles. Pure, so
// the drawing's promises are tested without a DOM: every surface is the size its caption says, shows in
// its plate (whole wherever the plate is big enough to hold it) and is laid with exactly the tiles the
// studio would lay on it.
import { computeLayout, type LayoutInput } from '@/core/layout'
import type { DesignConfig } from '@/core/types'
import { formatSize } from '@/core/units'
import { cornerSettingOut, layDelay } from './layOrder'

/** A rectangle in a room, mm from the room's top-left corner, y running down the page. */
export interface RoomRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Every room is drawn in millimetres from its ceiling down, and everything standing in it stands on this
 * line, so a sofa and a cube shelf are drawn to the same rule whatever plate frames them.
 */
export const FLOOR = 2500

/** Width over height of every plate, so the six sit as one even grid. */
export const PLATE_ASPECT = 5 / 4

export type HomeUseId = 'splashback' | 'sideboard' | 'feature-wall' | 'headboard' | 'shelf-doors' | 'tv-wall'

export interface HomeUse {
  id: HomeUseId
  /** What the caption names: the thing a maker would tile. */
  name: string
  /** What the studio calls the one surface it opens: a sideboard is designed a door at a time. */
  piece: string
  /** The room the drawing stands it in, for a reader who cannot see the drawing. */
  room: string
  /** One surface, mm: what the studio opens. Three doors drawn are still one door to design. */
  surface: { width: number; height: number }
  /** Every copy of it in the room. Each is exactly `surface` in size. */
  places: readonly RoomRect[]
  /**
   * The part of the room its plate shows, mm, in the plate's proportion: cropped close, so the tiles are
   * big enough for their relief to read. A surface wider than its plate runs out of it, as a wall does.
   */
  frame: RoomRect
}

const place = (x: number, y: number, size: HomeUse['surface']): RoomRect => ({ x, y, ...size })

/** A plate's frame: its top-left corner and its width, mm, the height following from the plate's proportion. */
const frame = (x: number, y: number, width: number): RoomRect => ({ x, y, width, height: width / PLATE_ASPECT })

const SPLASHBACK = { width: 2400, height: 600 }
// A sideboard door of the size the big flat-pack ranges sell, so the number is one a maker meets.
const SIDEBOARD_DOOR = { width: 600, height: 640 }
const FEATURE_WALL = { width: 2400, height: 1200 }
const HEADBOARD = { width: 1800, height: 900 }
const CUBE_DOOR = { width: 330, height: 330 }
const TV_WALL = { width: 3000, height: 1500 }

/**
 * The cube shelf in the study: four cells by four on the floor, 45 mm outer boards and 15 mm between
 * cells, every cell exactly a cube door. The drawing builds the unit from this, so a door always fills
 * its cell.
 */
export const CUBE_SHELF = { x: 560, y: 1045, columns: 4, rows: 4, board: 45, divider: 15, cell: CUBE_DOOR } as const

/** The top-left corner of a cell of the cube shelf, mm in the room. */
export function cubeCell(column: number, row: number): RoomRect {
  const { x, y, board, divider, cell } = CUBE_SHELF
  return place(x + board + column * (cell.width + divider), y + board + row * (cell.height + divider), cell)
}

/** The cells that take a door, in a checkerboard so the open ones show the shelf it is. */
const CUBE_DOORS: readonly [number, number][] = [
  [0, 0],
  [2, 0],
  [1, 1],
  [3, 1],
  [0, 2],
  [2, 2],
  [1, 3],
  [3, 3],
]

/**
 * The six uses, in reading order: the kitchen first because it is the use makers ask about most, then
 * furniture and walls in turn so no two neighbours make the same point. On a wide screen they are two
 * rows of three plates; on a phone, one column.
 */
export const USES: readonly HomeUse[] = [
  {
    id: 'splashback',
    name: 'Splashback',
    piece: 'Splashback',
    room: 'kitchen',
    surface: SPLASHBACK,
    // Between the worktop (900 mm off the floor) and the wall cabinets, end to end of the run.
    places: [place(400, 1000, SPLASHBACK)],
    // Close on the run: the shelf over it, the worktop and the drawers under it, the tiles out of both sides.
    frame: frame(640, 600, 1700),
  },
  {
    id: 'sideboard',
    name: 'Sideboard',
    piece: 'Sideboard door',
    room: 'dining room',
    surface: SIDEBOARD_DOOR,
    // Three doors 10 mm apart, between a top board at 1700 and a plinth rail at 2360.
    places: [place(680, 1720, SIDEBOARD_DOOR), place(1290, 1720, SIDEBOARD_DOOR), place(1900, 1720, SIDEBOARD_DOOR)],
    frame: frame(540, 920, 2100),
  },
  {
    id: 'feature-wall',
    name: 'Feature wall',
    piece: 'Feature wall',
    room: 'living room',
    surface: FEATURE_WALL,
    // The panel behind the sofa: its foot runs down behind the sofa's back, as a real one does.
    places: [place(400, 950, FEATURE_WALL)],
    // The panel's top edge and the floor in, its two sides out: a panel the width of the room.
    frame: frame(475, 800, 2250),
  },
  {
    id: 'headboard',
    name: 'Headboard',
    piece: 'Headboard',
    room: 'bedroom',
    surface: HEADBOARD,
    // Wider than the 1600 mm mattress, its foot behind the pillows.
    places: [place(700, 1150, HEADBOARD)],
    frame: frame(450, 760, 2300),
  },
  {
    id: 'shelf-doors',
    name: 'Cube shelf',
    piece: 'Cube shelf door',
    room: 'study',
    surface: CUBE_DOOR,
    places: CUBE_DOORS.map(([column, row]) => cubeCell(column, row)),
    frame: frame(400, 840, 2200),
  },
  {
    id: 'tv-wall',
    name: 'TV wall',
    piece: 'TV wall',
    room: 'living room',
    surface: TV_WALL,
    places: [place(100, 750, TV_WALL)],
    // Inside the tiling on three sides: a wall tiled from end to end, behind the screen and the unit.
    frame: frame(500, 840, 2200),
  },
]

/** The caption's second line: the size the studio opens, and how many there are when there are several. */
export function captionDetail(use: HomeUse): string {
  const size = formatSize(use.surface.width, use.surface.height, 'cm')
  return use.places.length > 1 ? `${use.places.length} doors of ${size}` : size
}

/** What a screen reader hears for the plate, which is a link: the drawing itself is hidden from it. */
export function roomLabel(use: HomeUse): string {
  const open = use.places.length > 1 ? 'Open one in the studio.' : 'Open it in the studio.'
  return `${use.name} in a ${use.room}, ${captionDetail(use)}. ${open}`
}

/** The design the room opens in the studio: the visitor's own tile, at this surface's size and name. */
export function studioDesign(use: HomeUse): Pick<DesignConfig, 'name' | 'surface'> {
  return { name: use.piece, surface: { ...use.surface } }
}

/** One tile as the drawing lays it: where the whole tile's picture goes, mm in the room. */
export interface TileCell {
  key: string
  /** The whole tile's box. A cut piece draws the whole tile and is clipped to the surface. */
  x: number
  y: number
  width: number
  height: number
  /** 0 at the corner the surface is set out from, 1 at the far corner: the lay-in wave. */
  lay: number
}

/**
 * The tiles of one surface, read off computeLayout for that surface rather than off a grid of its own,
 * so the drawing lays exactly what the studio would. A cut piece's crop says which part of the whole
 * tile it keeps; the whole tile is drawn where that part lands, and the surface clips the rest away.
 */
export function tileCells(rect: RoomRect, design: Pick<LayoutInput, 'tile' | 'joint' | 'layout'>): TileCell[] {
  const surface = { width: rect.width, height: rect.height }
  const plan = computeLayout({ surface, tile: design.tile, joint: design.joint, layout: design.layout })
  const pieces = new Map(plan.pieces.map((piece) => [piece.id, piece]))
  const origin = cornerSettingOut(surface)
  return plan.placements.flatMap((placement, index) => {
    const piece = pieces.get(placement.pieceId)
    if (!piece) return []
    // Surface coordinates run up from the bottom-left corner; the room's run down from its top-left.
    const left = placement.x - piece.crop.x0
    const bottom = placement.y - piece.crop.y0
    return [
      {
        key: `${index}`,
        x: rect.x + left,
        y: rect.y + rect.height - bottom - design.tile.height,
        width: design.tile.width,
        height: design.tile.height,
        lay: layDelay({ x: placement.x, y: placement.y, w: piece.width, h: piece.height }, surface, origin),
      },
    ]
  })
}
