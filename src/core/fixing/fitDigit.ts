// The number cut into every part of the fit test that comes in three fits: 1 snug, 2 standard, 3 loose. One
// outline per digit on a 3 x 5 grid of square cells, so a clip, a key and a socket coupon each cut the same
// figure at their own size, and the drawings draw it from the same points. Each digit is one simple ring with
// no counter (1, 2 and 3 have none), so a mesher cuts it as a single pocket and never needs an island.
// Pure maths with no imports to speak of: the clip and key meshers ship in the studio's chunk, and this with them.

import type { FitClass } from '../types'

/** The digit each fit class is cut with, in the order of FIT_ORDER (fitTest.ts): snuggest first. */
export type FitDigit = 1 | 2 | 3

export const FIT_DIGIT: Record<FitClass, FitDigit> = { snug: 1, standard: 2, loose: 3 }

/** Grid cells across a digit and up it. */
export const DIGIT_COLUMNS = 3
export const DIGIT_ROWS = 5

/**
 * Each digit's outline in grid cells, counter-clockwise, x right and y up from its bottom-left corner. Every
 * stroke and every gap between strokes is one whole cell, so a cell as wide as the nozzle can draw is all a
 * part has to choose.
 */
const OUTLINES: Record<FitDigit, readonly number[]> = {
  1: [0, 0, 3, 0, 3, 1, 2, 1, 2, 5, 1, 5, 1, 4, 0, 4, 0, 3, 1, 3, 1, 1, 0, 1],
  2: [0, 0, 3, 0, 3, 1, 1, 1, 1, 2, 3, 2, 3, 5, 0, 5, 0, 4, 2, 4, 2, 3, 0, 3],
  3: [0, 0, 3, 0, 3, 5, 0, 5, 0, 4, 2, 4, 2, 3, 1, 3, 1, 2, 2, 2, 2, 1, 0, 1],
}

export const isFitDigit = (value: unknown): value is FitDigit => value === 1 || value === 2 || value === 3

/** A digit's outline in grid cells, as `digitRing` reads it: for a drawing that maps the cells itself. */
export function digitOutline(digit: FitDigit): readonly number[] {
  return OUTLINES[digit]
}

/**
 * A digit's outline in mm, `cell` mm a grid step, centred on (cx, cy) and upright with y up. `mirror` flips it
 * across its upright axis, for a digit cut into a part's back and read by turning the part over left to right;
 * the ring runs counter-clockwise either way.
 */
export function digitRing(digit: FitDigit, cell: number, cx: number, cy: number, mirror = false): number[] {
  const grid = OUTLINES[digit]
  const sx = mirror ? -cell : cell
  const points: number[] = []
  for (let i = 0; i < grid.length; i += 2) {
    points.push(cx + (grid[i] - DIGIT_COLUMNS / 2) * sx, cy + (grid[i + 1] - DIGIT_ROWS / 2) * cell)
  }
  if (!mirror) return points
  // A mirror turns the ring clockwise: walk it backwards to keep it counter-clockwise.
  const ccw: number[] = []
  for (let i = points.length - 2; i >= 0; i -= 2) ccw.push(points[i], points[i + 1])
  return ccw
}
