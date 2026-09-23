// The sizes the Tile size group offers. Beside the recommendation computed from the wall, a short
// row of sizes people already have a feel for: each one is costed against this wall by computeLayout,
// the same path recommendedTile and squareTile are verified with, so a chip never promises a fit the
// layout would not lay.

import { LIMITS } from '@/core/config'
import { tabLimits } from '@/core/fixing/capability'
import {
  computeLayout,
  recommendedTile,
  squareTile,
  tilePresets,
  type PrinterBed,
  type TileFit,
  type TileSuggestOptions,
} from '@/core/layout'
import { printerById } from '@/core/printers'
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

// layout.ts keeps its own copy of this private and is a read-only contract, hence the repeat. `grow` is
// what a tab adds to the printed width: an offer is only a fit while that box lands on the bed.
const fitsBed = (width: number, height: number, bed?: PrinterBed, grow = 0): boolean =>
  !bed || (width + grow <= bed.width && height <= bed.depth) || (height <= bed.width && width + grow <= bed.depth)

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
  if (!fitsBed(width, height, options.bed, options.grow)) return null
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
 *
 * `picked` is a size the maker chose by name: its familiar chip stays beside a recommendation of the
 * same size, so the group can keep showing what they picked rather than Recommended, which follows
 * the wall where their pick does not.
 */
export function tileChoices(
  surface: DesignConfig['surface'],
  joint: number,
  options: TileSuggestOptions = {},
  picked?: { width: number; height: number },
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

  const alreadyOffered = (fit: TileFit) =>
    chips.some((chip) => sameTileSize(chip.fit, fit) && !(picked && chip.value === RECOMMENDED && sameTileSize(fit, picked)))

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

/** What the group costs every chip against: the tile limits, this design's bed and its own layout. */
export const tileSuggestOptions = (config: DesignConfig): TileSuggestOptions => ({
  min: LIMITS.tile.min,
  max: LIMITS.tile.max,
  bed: printerById(config.printerId),
  // The layout matters to the promise: a size that leaves no cuts from the corner can still cut every
  // edge once the grid is centred or the rows are shifted.
  layout: config.layout,
  // With tabs cut, the file is wider than the tile, so a chip is only offered while the printed box fits.
  grow: tabLimits(config)?.projection ?? 0,
})

/** The chips the Tile size group shows for this design; `picked` as in tileChoices. */
export const tileChoicesFor = (config: DesignConfig, picked?: { width: number; height: number }): TileChoice[] =>
  tileChoices(config.surface, config.joint, tileSuggestOptions(config), picked)

/** The recommendation the Tile size group shows for this design, or null when it offers none. */
export const recommendationFor = (config: DesignConfig): TileFit | null =>
  recommendedTile(config.surface, config.joint, tileSuggestOptions(config))

/**
 * Everything the recommendation is computed from, so an edit that touches none of it costs nothing. The
 * tab's projection stands for the three fields behind it (the lock, the joint and the plate): it is the one
 * of them the offer itself reads, through the bed check.
 */
const recommendationInputs = (config: DesignConfig): string =>
  JSON.stringify([config.surface, config.joint, config.layout, config.printerId, tabLimits(config)?.projection ?? 0])

/**
 * What the maker chose in the Tile size group. `size` is any number they picked (a familiar chip, a
 * typed size, a plan fix) and never moves; `custom` is the same, with the fields pinned open.
 */
export type TileChoiceKind = 'recommended' | 'size' | 'custom'

/** A choice and the tile it left the design on: it holds only while the design still has that tile. */
export interface TileChoiceMemo {
  kind: TileChoiceKind
  width: number
  height: number
}

/**
 * The choice the design is on. The memo answers while the tile is still the size it recorded, so a
 * load, an undo or a share link that changes the tile falls back to what the design itself shows:
 * Recommended when the tile is the recommendation, Custom when no chip offers it, a size otherwise.
 */
export function tileChoiceKind(memo: TileChoiceMemo | null, config: DesignConfig): TileChoiceKind {
  if (memo && sameTileSize(memo, config.tile)) return memo.kind
  const recommended = recommendationFor(config)
  if (recommended && sameTileSize(recommended, config.tile)) return 'recommended'
  return tileChoicesFor(config).some((choice) => sameTileSize(choice.fit, config.tile)) ? 'size' : 'custom'
}

/**
 * Recommended with nothing to recommend (a running bond, or a wall no size fits without cuts): the
 * design keeps its tile and follows again once a recommendation exists, so the group must say that
 * rather than check whichever chip happens to share the size.
 */
export const holdsRecommendation = (choices: readonly TileChoice[], kind: TileChoiceKind): boolean =>
  kind === 'recommended' && !choices.some((choice) => choice.value === RECOMMENDED)

/** Why the held Recommended card has no size of its own, in the maker's terms. */
export const heldRecommendationNote = (config: DesignConfig): string =>
  config.layout.rowOffset !== 0
    ? 'Shifted rows always cut the row ends: this size stays until the rows line up.'
    : 'No size fits this wall without cuts: this size stays until one does.'

/**
 * Carries a design that is on Recommended through an edit to what the recommendation is computed
 * from. Only call it for that choice: a size the maker picked never moves, even one that happens to
 * equal the recommendation. Returns `after` untouched whenever it does not apply.
 */
export function followRecommendation(before: DesignConfig, after: DesignConfig): DesignConfig {
  // A preset, a typed size or a plan fix chose the tile in this very edit: that choice wins.
  if (!sameTileSize(after.tile, before.tile)) return after
  if (recommendationInputs(after) === recommendationInputs(before)) return after
  const now = recommendationFor(after)
  // A running bond has no cut-free size: the tile stays, and takes the next recommendation offered.
  if (!now || sameTileSize(now, after.tile)) return after
  return { ...after, tile: { ...after.tile, width: now.width, height: now.height } }
}
