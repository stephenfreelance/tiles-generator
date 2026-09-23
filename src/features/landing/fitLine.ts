// The one sentence the hero says about the visitor's wall. It is derived from the plan, never typed, so
// the page can only ever claim what computeLayout worked out; a test pins the exact strings.
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { formatNumber, formatSize } from '@/core/units'

/** Whole counts, grouped over a thousand ("1,024 tiles") so a large wall stays readable. */
const count = (value: number): string => formatNumber(value, 0)

const plural = (value: number, noun: string): string => `${count(value)} ${noun}${value === 1 ? '' : 's'}`

/**
 * "100 × 70 cm: 35 tiles, 24 whole and 11 cut, printed from 4 models."
 * The wall is shown in the unit the fields above it are edited in, so the sentence reads as an answer
 * to what the visitor just typed.
 */
export function fitLine(config: DesignConfig, plan: LayoutPlan): string {
  const wall = formatSize(config.surface.width, config.surface.height, config.surfaceUnit)
  const total = plan.placements.length
  const models = `printed from ${plural(plan.pieces.length, 'model')}`
  if (plan.exact) {
    const tiles = total === 1 ? 'one whole tile' : `${plural(total, 'tile')}, all whole`
    return `${wall}: ${tiles}, ${models}. No cuts.`
  }
  // A wall smaller than one tile has no whole tile to count, and "0 whole" is the long way of saying so.
  if (plan.fullCount === 0) {
    const pieces = total === 1 ? 'one cut piece' : `${plural(total, 'piece')}, every one cut`
    return `${wall}: ${pieces}, ${models}.`
  }
  return `${wall}: ${plural(total, 'tile')}, ${count(plan.fullCount)} whole and ${count(plan.partialCount)} cut, ${models}.`
}
