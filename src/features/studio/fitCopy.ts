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

/** "Your wall takes 24 whole tiles and 8 cut pieces. 3 files to print." */
export function fitSummary(plan: LayoutPlan): FitSummary {
  const fullCount = plan.fullCount
  const cutCount = plan.partialCount
  const modelCount = plan.pieces.length
  const total = fullCount + cutCount
  const files = `${modelCount} ${plural(modelCount, 'file')} to print`

  const sentence = plan.exact
    ? total === 1
      ? `One whole tile covers your wall. ${files}.`
      : `All ${total} tiles are whole. ${files}.`
    : fullCount === 0
      ? `Your wall takes ${cutCount} cut ${plural(cutCount, 'piece')}. ${files}.`
      : `Your wall takes ${fullCount} whole ${plural(fullCount, 'tile')} and ${cutCount} cut ${plural(cutCount, 'piece')}. ${files}.`

  return { fullCount, cutCount, modelCount, exact: plan.exact, sentence }
}
