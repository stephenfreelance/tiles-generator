// A laid-out plan read as a CSS grid of real millimetres: the column and row tracks the tiles meet on,
// and the order they go down in. The corner detail and the hero wall are the same drawing at two
// scales, so both build from here and a joint can never land in two different places.
import type { LayoutPlan, PieceSpec } from '@/core/types'
import { cornerSettingOut, layDelay } from './layOrder'

export interface WallCell {
  /** Keyed on the grid, never on the wall's millimetres: a resize moves a cell rather than remounting it. */
  key: string
  piece: PieceSpec
  /** 1-based grid position: laying order owns the DOM, so the placement has to be explicit. */
  column: number
  row: number
  /** Distance from the setting-out corner, 0 at the first tile laid and 1 at the last. */
  lay: number
  /** Place in the laying order, 0 for the piece that goes up first. */
  order: number
  /** True on the four cells that own an outside corner of the wall. */
  edge: { top: boolean; bottom: boolean; left: boolean; right: boolean }
}

export interface WallGrid {
  cells: WallCell[]
  /** grid-template-columns and -rows, in fr units taken straight from the millimetres. */
  columns: string
  rows: string
  /** The wall's own proportions, so the grid carries them whatever box it is given. */
  aspect: string
  /** The same ratio as a number, for the CSS that fits the wall into its box. */
  ratio: number
  columnCount: number
  rowCount: number
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)

/** The column and row tracks of a laid-out wall, in millimetres, with the pieces they were read from. */
function wallTracks(plan: LayoutPlan) {
  const pieceById = new Map(plan.pieces.map((piece) => [piece.id, piece]))
  const xs = [...new Set(plan.placements.map((placement) => placement.x))].sort((a, b) => a - b)
  const ys = [...new Set(plan.placements.map((placement) => placement.y))].sort((a, b) => b - a)
  const at = (axis: 'x' | 'y', value: number): PieceSpec | undefined =>
    pieceById.get(plan.placements.find((placement) => placement[axis] === value)?.pieceId ?? '')
  return {
    pieceById,
    xs,
    ys,
    widths: xs.map((x) => at('x', x)?.width ?? 1),
    heights: ys.map((y) => at('y', y)?.height ?? 1),
  }
}

/**
 * The wall's own proportions, width over height, without building the cells for them: the hero's frame
 * takes its aspect from this, so the box the wall is fitted into is the shape of the wall itself.
 */
export function wallRatio(plan: LayoutPlan): number {
  const { widths, heights } = wallTracks(plan)
  const height = sum(heights)
  return height > 0 ? sum(widths) / height : 1
}

/**
 * The plan as a grid of real millimetres, plus the order it is laid in. Column and row tracks follow
 * the millimetres, so the pieces meet exactly as they will on the wall; rows run top to bottom, since
 * surface coordinates put the largest y at the top.
 */
export function buildWallGrid(plan: LayoutPlan): WallGrid {
  const { pieceById, xs, ys, widths, heights } = wallTracks(plan)
  const model = { width: sum(widths), height: sum(heights) }
  const origin = cornerSettingOut(model)

  const laid = plan.placements.flatMap<Omit<WallCell, 'order'>>((placement) => {
    const piece = pieceById.get(placement.pieceId)
    if (!piece) return []
    const column = xs.indexOf(placement.x)
    const row = ys.indexOf(placement.y)
    return [
      {
        key: `${column}-${row}`,
        piece,
        column: column + 1,
        row: row + 1,
        // Grid-local millimetres, measured against this grid rather than against a wall it is a piece of.
        lay: layDelay(
          { x: sum(widths.slice(0, column)), y: sum(heights.slice(row + 1)), w: widths[column], h: heights[row] },
          model,
          origin,
        ),
        edge: { top: row === 0, bottom: row === ys.length - 1, left: column === 0, right: column === xs.length - 1 },
      },
    ]
  })
  // Ties are broken in reading order rather than shared, so the wall lays one piece at a time.
  laid.sort((a, b) => a.lay - b.lay || a.row - b.row || a.column - b.column)

  return {
    cells: laid.map((cell, order) => ({ ...cell, order })),
    columns: widths.map((width) => `${width}fr`).join(' '),
    rows: heights.map((height) => `${height}fr`).join(' '),
    aspect: `${model.width} / ${model.height}`,
    ratio: model.height > 0 ? model.width / model.height : 1,
    columnCount: xs.length,
    rowCount: ys.length,
  }
}
