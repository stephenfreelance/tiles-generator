import type { LayoutPlan } from '@/core/types'

export interface FitSummary {
  fullCount: number
  cutCount: number
  modelCount: number
  exact: boolean
  /** The whole fit in plain words, for the line above the action and for screen readers. */
  sentence: string
}

const plural = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many)

/**
 * "Your wall takes 24 whole tiles and 8 cut pieces. 3 files to print." With keys or wall clips the wall's
 * parts are files too, and "Your pieces" counts them with the tiles, so the line names each number:
 * "9 tile files and 2 part files to print." (The fit test is not counted: it prints from its own page.)
 */
export function fitSummary(plan: LayoutPlan, partFiles = 0): FitSummary {
  const fullCount = plan.fullCount
  const cutCount = plan.partialCount
  const modelCount = plan.pieces.length
  const total = fullCount + cutCount
  const files =
    partFiles > 0
      ? `${modelCount} tile ${plural(modelCount, 'file')} and ${partFiles} part ${plural(partFiles, 'file')} to print`
      : `${modelCount} ${plural(modelCount, 'file')} to print`

  const sentence = plan.exact
    ? total === 1
      ? `One whole tile covers your wall. ${files}.`
      : `All ${total} tiles are whole. ${files}.`
    : fullCount === 0
      ? `Your wall takes ${cutCount} cut ${plural(cutCount, 'piece')}. ${files}.`
      : `Your wall takes ${fullCount} whole ${plural(fullCount, 'tile')} and ${cutCount} cut ${plural(cutCount, 'piece')}. ${files}.`

  return { fullCount, cutCount, modelCount, exact: plan.exact, sentence }
}
