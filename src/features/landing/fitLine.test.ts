import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { computeLayout } from '@/core/layout'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { fitLine } from './fitLine'

/** The landing page's own wall: 150 mm tiles on a corner-origin grid, sized in centimetres. */
function wall(widthMm: number, heightMm: number, tileMm = 150): DesignConfig {
  return normalizeConfig({
    ...DEFAULT_CONFIG,
    surface: { width: widthMm, height: heightMm },
    surfaceUnit: 'cm',
    tile: { width: tileMm, height: tileMm, thickness: 4 },
    joint: 0,
    layout: { origin: 'corner', rowOffset: 0 },
  })
}

const planOf = (config: DesignConfig): LayoutPlan =>
  computeLayout({ surface: config.surface, tile: config.tile, joint: config.joint, layout: config.layout })

describe('fitLine', () => {
  it('counts the whole tiles, the cuts and the models of a wall that needs cutting', () => {
    const config = wall(1000, 700)
    const plan = planOf(config)
    expect([plan.placements.length, plan.fullCount, plan.partialCount, plan.pieces.length]).toEqual([35, 24, 11, 4])
    expect(fitLine(config, plan)).toBe('100 × 70 cm: 35 tiles, 24 whole and 11 cut, printed from 4 models.')
  })

  it('says so plainly when the wall divides exactly', () => {
    const config = wall(2400, 1200)
    const plan = planOf(config)
    expect(plan.exact).toBe(true)
    expect(fitLine(config, plan)).toBe('240 × 120 cm: 128 tiles, all whole, printed from 1 model. No cuts.')
  })

  it('counts one tile as one', () => {
    const config = wall(200, 200, 200)
    const plan = planOf(config)
    expect(plan.placements).toHaveLength(1)
    expect(fitLine(config, plan)).toBe('20 × 20 cm: one whole tile, printed from 1 model. No cuts.')
  })

  it('does not say "0 whole" for a wall smaller than its tile', () => {
    const config = wall(100, 100)
    const plan = planOf(config)
    expect([plan.fullCount, plan.exact]).toEqual([0, false])
    expect(fitLine(config, plan)).toBe('10 × 10 cm: one cut piece, printed from 1 model.')
  })
})
