// The four printed pieces the "pieces side by side" panel is assembled from. A corner-origin layout
// reads the wall from the top-left, so every kind of cut it makes lands in the bottom-right corner:
// take the 2 x 2 there and the panel shows one of each model, with nothing invented.
import type { LayoutPlan, Placement } from '@/core/types'

/** Cells along each axis: two is what the panel fits, and what holds all four models of a corner wall. */
const SPAN = 2

/**
 * The bottom-right SPAN x SPAN of a plan, as a plan of its own: the two largest x and the two smallest
 * y (surface coordinates start at the bottom-left, y up). `pieces` are the source plan's own objects,
 * so the marks, labels and counts stay the whole wall's; only `row` and `col` are renumbered, so the
 * fragment reads as the small grid it is. A wall with fewer than SPAN columns or rows returns what it
 * has, which keeps the panel honest for a one-tile wall.
 */
export function cornerDetail(plan: LayoutPlan): LayoutPlan {
  const allX = [...new Set(plan.placements.map((placement) => placement.x))]
  const allY = [...new Set(plan.placements.map((placement) => placement.y))]
  // Taken from the far end, then put back in reading order so column 0 is the left one.
  const xs = allX.sort((a, b) => b - a).slice(0, SPAN).sort((a, b) => a - b)
  const ys = allY.sort((a, b) => a - b).slice(0, SPAN)
  const placements: Placement[] = plan.placements
    .filter((placement) => xs.includes(placement.x) && ys.includes(placement.y))
    .map((placement) => ({ ...placement, row: ys.indexOf(placement.y), col: xs.indexOf(placement.x) }))
  const used = new Set(placements.map((placement) => placement.pieceId))
  const pieces = plan.pieces.filter((piece) => used.has(piece.id))
  // Keys or a border profile make several whole models (the interior tile and its border versions).
  const fullIds = new Set(pieces.filter((piece) => piece.kind === 'full').map((piece) => piece.id))
  const fullCount = placements.filter((placement) => fullIds.has(placement.pieceId)).length
  return {
    pieces,
    placements,
    columns: xs.length,
    rows: ys.length,
    fullCount,
    partialCount: placements.length - fullCount,
    exact: pieces.every((piece) => piece.kind === 'full'),
    // A detail of a wall is not a wall: the warnings belong to the plan the reader is being shown.
    warnings: [],
  }
}
