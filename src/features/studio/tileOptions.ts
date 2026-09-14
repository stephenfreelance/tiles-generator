// The sizes the Tile size group offers. Beside the recommendation computed from the wall, a short
// row of sizes people already have a feel for: each one is costed against this wall by computeLayout,
// the same path recommendedTile and squareTile are verified with, so a chip never promises a fit the
// layout would not lay.

import { computeLayout, squareTile, tilePresets, type PrinterBed, type TileFit, type TileSuggestOptions } from '@/core/layout'
import type { DesignConfig } from '@/core/types'
import { formatLength, formatSize } from '@/core/units'

/** Squares people recognise, mm. All three are standard sizes, so squareTile returns them unchanged. */
export const FAMILIAR_SQUARES_MM = [100, 150, 200]

/** One rectangle, because a brick bond is the other thing a maker pictures. */
export const BRICK_TILE_MM = { width: 200, height: 100 }

/** A choice row stops being scannable past about five options, so Custom is the sixth and last. */
export const MAX_TILE_CHIPS = 5

/** The recommendation's chip value; its note is the only one that changes wording. */
export const RECOMMENDED = 'recommended'
export const SQUARE = 'square'
export const CUSTOM = 'custom'

export interface TileChoice {
  /** Radio value; derived from the size, so a chip keeps its identity across re-layouts. */
  value: string
  name: string
  /** The size, for the chips whose name does not already say it. */
  figure?: string
  fit: TileFit
}

/** Two sizes this close are the same size: what the group matches the current tile with. */
export const sameTileSize = (a: { width: number; height: number }, b: { width: number; height: number }): boolean =>
  Math.abs(a.width - b.width) < 0.05 && Math.abs(a.height - b.height) < 0.05

// layout.ts keeps its own copy of this private and is a read-only contract, hence the repeat.
const fitsBed = (width: number, height: number, bed?: PrinterBed): boolean =>
  !bed || (width <= bed.width && height <= bed.depth) || (height <= bed.width && width <= bed.depth)

const PRESET_LAYOUT: DesignConfig['layout'] = { origin: 'corner', rowOffset: 0 }

/** A rectangular offer, costed exactly the way squareTile costs a square. */
function rectangleTile(
  surface: DesignConfig['surface'],
  joint: number,
  size: { width: number; height: number },
  options: TileSuggestOptions,
): TileFit | null {
  const min = options.min ?? 20
  const max = options.max ?? 400
  const { width, height } = size
  if (Math.min(width, height) < min || Math.max(width, height) > max) return null
  if (!fitsBed(width, height, options.bed)) return null
  const plan = computeLayout({ surface, tile: { width, height }, joint, layout: options.layout ?? PRESET_LAYOUT })
  return {
    width,
    height,
    columns: plan.columns,
    rows: plan.rows,
    exact: plan.exact,
    cuts: plan.partialCount,
    tiles: plan.placements.length,
    whole: plan.fullCount,
  }
}

/** A size that lays no whole tile at all is not an offer, whatever its name. */
const worthOffering = (fit: TileFit | null): fit is TileFit => fit !== null && fit.whole > 0

/**
 * The chips the group shows, in reading order: the recommendation, the nearest familiar square when
 * it differs, then familiar sizes. No size appears twice, and the row is never longer than
 * MAX_TILE_CHIPS. When it has to be trimmed the rectangle stays: it is the only chip offering a
 * different shape, so dropping it would cost the row more than dropping one more square.
 */
export function tileChoices(
  surface: DesignConfig['surface'],
  joint: number,
  options: TileSuggestOptions = {},
): TileChoice[] {
  const { recommended, square } = tilePresets(surface, joint, options)
  const chips: TileChoice[] = []
  if (recommended) {
    chips.push({
      value: RECOMMENDED,
      name: 'Recommended',
      figure: formatSize(recommended.width, recommended.height),
      fit: recommended,
    })
  }
  if (square) {
    chips.push({ value: SQUARE, name: 'Square tile', figure: formatSize(square.width, square.height), fit: square })
  }

  const alreadyOffered = (fit: TileFit) => chips.some((chip) => sameTileSize(chip.fit, fit))

  const squares: TileFit[] = []
  for (const size of FAMILIAR_SQUARES_MM) {
    // squareTile snaps to the nearest standard size the bed and the limits allow, so a bed too small
    // for 200 mm answers with the largest square it can print rather than with nothing.
    const fit = squareTile(surface, joint, size, options)
    if (!worthOffering(fit)) continue
    if (alreadyOffered(fit) || squares.some((kept) => sameTileSize(kept, fit))) continue
    squares.push(fit)
  }

  const brick = rectangleTile(surface, joint, BRICK_TILE_MM, options)
  const rectangle = worthOffering(brick) && !alreadyOffered(brick) ? brick : null

  const room = Math.max(0, MAX_TILE_CHIPS - chips.length)
  for (const fit of squares.slice(0, Math.max(0, room - (rectangle ? 1 : 0)))) {
    chips.push({
      value: `familiar-${fit.width}x${fit.height}`,
      name: `${formatLength(fit.width, 'mm', false)} mm square`,
      fit,
    })
  }
  if (rectangle && chips.length < MAX_TILE_CHIPS) {
    chips.push({
      value: `familiar-${rectangle.width}x${rectangle.height}`,
      name: `${formatSize(rectangle.width, rectangle.height)} brick`,
      fit: rectangle,
    })
  }
  return chips
}
