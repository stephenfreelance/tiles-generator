import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { computeLayout } from '@/core/layout'
import type { DesignConfig, FitWarning, LayoutPlan } from '@/core/types'
import { fixFor } from './planFixes'

// A fix speaks its result out loud, so what it says has to be what the plan then holds.

const oversizeTile: FitWarning = {
  code: 'tile-larger-than-surface',
  message: 'The tile is larger than the surface, so every piece is a cut. Check the sizes.',
}

function design(surface: { width: number; height: number }, tile: { width: number; height: number }): DesignConfig {
  return normalizeConfig({ ...DEFAULT_CONFIG, surface, tile: { ...DEFAULT_CONFIG.tile, ...tile } })
}

const layoutOf = (config: DesignConfig): LayoutPlan =>
  computeLayout({ surface: config.surface, tile: config.tile, joint: config.joint, layout: config.layout })

describe('make the tile fit', () => {
  it('says what the clamp really leaves when only one axis was oversized', () => {
    const config = design({ width: 300, height: 600 }, { width: 400, height: 400 })
    const fix = fixFor(oversizeTile, config, layoutOf(config))
    expect(fix).not.toBeNull()

    const fixed = fix!.apply(config)
    const plan = layoutOf(fixed)
    expect({ width: fixed.tile.width, height: fixed.tile.height }).toEqual({ width: 300, height: 400 })
    expect({ full: plan.fullCount, cut: plan.partialCount }).toEqual({ full: 1, cut: 1 })

    expect(fix!.done).toContain('1 whole tile and 1 cut piece')
    expect(fix!.done).not.toContain('one whole tile covers it')
  })

  it('keeps the promise when one tile really does cover the surface', () => {
    const config = design({ width: 300, height: 300 }, { width: 400, height: 400 })
    const fix = fixFor(oversizeTile, config, layoutOf(config))

    const plan = layoutOf(fix!.apply(config))
    expect(plan.exact).toBe(true)
    expect(plan.placements).toHaveLength(1)
    expect(fix!.done).toBe('Tile set to 300 mm by 300 mm: one whole tile covers it.')
  })

  it('counts the whole tiles when the clamped tile divides the surface', () => {
    const config = design({ width: 300, height: 600 }, { width: 400, height: 300 })
    const fix = fixFor(oversizeTile, config, layoutOf(config))

    const plan = layoutOf(fix!.apply(config))
    expect(plan.exact).toBe(true)
    expect(plan.placements).toHaveLength(2)
    expect(fix!.done).toBe('Tile set to 300 mm by 300 mm: 2 whole tiles cover it.')
  })
})
