import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { computeLayout, layoutInputOf } from '@/core/layout'
import { buildPlanModel } from '@/core/plan/planModel'
import type { DesignConfig } from '@/core/types'
import { accessoryRows, planTotals } from '@/features/plan/planCopy'
import { fitSummary } from './fitCopy'

// The foot of the studio says what the wall takes, and its file count has to agree with "Your pieces".

const design = (over: Partial<DesignConfig>): DesignConfig => normalizeConfig({ ...DEFAULT_CONFIG, ...over })

describe('fitSummary', () => {
  it('reads the default wall as it always has', () => {
    const plan = computeLayout(layoutInputOf(DEFAULT_CONFIG))
    expect(fitSummary(plan).sentence).toBe('All 32 tiles are whole. 1 file to print.')
    expect(fitSummary(plan, 0).sentence).toBe('All 32 tiles are whole. 1 file to print.')
  })

  it('counts the cut pieces', () => {
    const plan = computeLayout(layoutInputOf(design({ surface: { width: 1000, height: 700 } })))
    expect(fitSummary(plan).sentence).toMatch(/^Your wall takes \d+ whole tiles and \d+ cut pieces\. \d+ files to print\.$/)
  })

  it('names the tile files and the part files apart, adding up to what "Your pieces" counts', () => {
    const config = design({ surface: { width: 1000, height: 700 }, lock: 'keys', mount: 'clips' })
    const plan = computeLayout(layoutInputOf(config))
    const model = buildPlanModel(config, plan)
    // The wall's own part files, one per row: the fit test prints from its own page and is not counted here.
    const parts = accessoryRows(model).length
    expect(parts).toBe(2)
    const { sentence } = fitSummary(plan, parts)
    expect(sentence).toMatch(
      new RegExp(`\\. ${plan.pieces.length} tile files and ${parts} part files to print\\.$`),
    )
    expect(plan.pieces.length + parts).toBe(planTotals(model).files)
  })

  it('says one file, not one files', () => {
    const plan = computeLayout(layoutInputOf(DEFAULT_CONFIG))
    expect(fitSummary(plan, 1).sentence).toBe('All 32 tiles are whole. 1 tile file and 1 part file to print.')
  })
})
