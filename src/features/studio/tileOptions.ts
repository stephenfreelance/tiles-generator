// The sizes the Tile size group offers. Beside the recommendation computed from the wall, a short
// row of sizes people already have a feel for, and for each of those this wall would cut, the nearest
// size it would not, square or not. Every one is costed against this wall by computeLayout, the same
// path recommendedTile and squareTile are verified with, so a chip never promises a fit the layout
// would not lay.

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

// layout.ts keeps these private too (its EPS and MAX_ASPECT), hence the repeats.
/** Under computeLayout's own EPS: a residual it would treat as a cut must not pass as an exact fit. */
const EXACT_EPS = 0.01
/** A tile is a tile, not a plank: the recommendation stops here, and so does a stand-in. */
const MAX_ASPECT = 2.5

/** How far from a familiar size a cut-free size may land and still stand in for it: a quarter either way. */
const STAND_IN_REACH = Math.log(1.25)
/** What each unit of aspect costs against nearness in size, so a squarer tile wins a near tie. */
const ASPECT_COST = 0.3
/** What a size that is not a whole or half millimetre costs: 87.5 x 100 reads better than 83.33 x 100. */
const UNTIDY_COST = 0.1
/** Stand-ins proved with computeLayout before giving up, as recommendedTile caps its own. */
const MAX_VERIFIED_STAND_INS = 8

const tidy = (mm: number): boolean => Math.abs(mm * 2 - Math.round(mm * 2)) < 1e-6

/** Sizes between `low` and `high` that fill `length` with whole tiles and their joints. */
function exactSizes(length: number, joint: number, low: number, high: number): number[] {
  const sizes: number[] = []
  for (let count = 1; ; count++) {
    const raw = (length - (count - 1) * joint) / count
    if (raw < low) break
    if (raw > high) continue
    const size = Math.round(raw * 100) / 100
    if (Math.abs(length - (count * size + (count - 1) * joint)) < EXACT_EPS) sizes.push(size)
  }
  return sizes
}

/**
 * The size that stands in for a familiar one this wall would cut: the cut-free size nearest to it,
 * square or not, a squarer and tidier tile winning a near tie. Only a size the row does not already
 * offer either way round, and only once computeLayout has laid it with no cuts.
 */
function cutFreeNear(
  surface: DesignConfig['surface'],
  joint: number,
  target: number,
  options: TileSuggestOptions,
  taken: readonly TileFit[],
): TileFit | null {
  const layout = options.layout ?? PRESET_LAYOUT
  // Past half or twice the target no pair of sides can land within reach of it at an allowed aspect.
  const low = Math.max(options.min ?? 20, target / 2)
  const high = Math.min(options.max ?? 400, target * 2)
  const widths = exactSizes(surface.width, joint, low, high)
  // Shifted rows cut every row end, so only a single row can be laid whole under them.
  const heights = layout.rowOffset === 0 ? exactSizes(surface.height, joint, low, high) : [surface.height]
  const candidates: { width: number; height: number; cost: number }[] = []
  for (const width of widths) {
    for (const height of heights) {
      const aspect = Math.max(width, height) / Math.min(width, height)
      const distance = Math.abs(Math.log(Math.sqrt(width * height) / target))
      if (aspect > MAX_ASPECT || distance > STAND_IN_REACH) continue
      // Turned a quarter, a tile the row already offers is no new choice: the same print, laid on its side.
      if (taken.some((fit) => sameTileSize(fit, { width, height }) || sameTileSize(fit, { width: height, height: width }))) continue
      const cost = distance + (aspect - 1) * ASPECT_COST + (tidy(width) && tidy(height) ? 0 : UNTIDY_COST)
      candidates.push({ width, height, cost })
    }
  }
  candidates.sort((a, b) => a.cost - b.cost)
  for (const size of candidates.slice(0, MAX_VERIFIED_STAND_INS)) {
    // rectangleTile applies the limits and the bed, and its layout is the proof of "no cuts".
    const fit = rectangleTile(surface, joint, size, options)
    if (fit?.exact) return fit
  }
  return null
}

const oblongFit = (fit: TileFit): boolean => Math.abs(fit.width - fit.height) >= 0.05
const oblong = (choice: TileChoice): boolean => oblongFit(choice.fit)
const squareName = (fit: TileFit): string => `${formatLength(fit.width, 'mm', false)} mm square`

/**
 * The chips the group shows, in reading order: the recommendation, then every size that leaves no
 * cuts, then the sizes that do. The rest are the nearest familiar square when it differs from the
 * recommendation, the familiar squares, each one this wall would cut preceded by the cut-free size
 * nearest to it, and the brick. No size appears twice, and the row is never longer than
 * MAX_TILE_CHIPS, so a size that cuts is the first to give way. When the row would lose its only
 * rectangle, the rectangle takes the last square's place, since it is the only chip offering a
 * different shape, unless it cuts and that square does not.
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

  // Everything after the recommendation, in reading order until the cut-free sizes are moved ahead.
  const offers: TileChoice[] = []
  if (square) {
    offers.push({ value: SQUARE, name: 'Square tile', figure: formatSize(square.width, square.height), fit: square })
  }

  const alreadyOffered = (fit: TileFit) =>
    offers.some((offer) => sameTileSize(offer.fit, fit)) ||
    chips.some((chip) => sameTileSize(chip.fit, fit) && !(picked && sameTileSize(fit, picked)))

  for (const size of FAMILIAR_SQUARES_MM) {
    // squareTile snaps to the nearest standard size the bed and the limits allow, so a bed too small
    // for 200 mm answers with the largest square it can print rather than with nothing.
    const fit = squareTile(surface, joint, size, options)
    if (!worthOffering(fit) || alreadyOffered(fit)) continue
    if (!fit.exact) {
      const taken = [...chips, ...offers].map((offer) => offer.fit)
      const standIn = cutFreeNear(surface, joint, fit.width, options, taken)
      if (standIn) {
        offers.push({
          value: `fit-${standIn.width}x${standIn.height}`,
          name: oblongFit(standIn) ? formatSize(standIn.width, standIn.height) : squareName(standIn),
          fit: standIn,
        })
      }
    }
    offers.push({ value: `familiar-${fit.width}x${fit.height}`, name: squareName(fit), fit })
  }

  const brick = rectangleTile(surface, joint, BRICK_TILE_MM, options)
  if (worthOffering(brick) && !alreadyOffered(brick)) {
    offers.push({
      value: `familiar-${brick.width}x${brick.height}`,
      name: `${formatSize(brick.width, brick.height)} brick`,
      fit: brick,
    })
  }

  const ranked = [...offers.filter((offer) => offer.fit.exact), ...offers.filter((offer) => !offer.fit.exact)]
  const kept = ranked.slice(0, Math.max(0, MAX_TILE_CHIPS - chips.length))
  const rectangle = ranked.slice(kept.length).find(oblong)
  const last = kept.at(-1)
  if (rectangle && last && ![...chips, ...kept].some(oblong) && (rectangle.fit.exact || !last.fit.exact)) {
    kept[kept.length - 1] = rectangle
  }
  return [...chips, ...kept]
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
