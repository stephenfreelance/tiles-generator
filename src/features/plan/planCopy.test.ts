import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { computeLayout } from '@/core/layout'
import { buildPlanModel, type PlanModel } from '@/core/plan/planModel'
import type { DesignConfig } from '@/core/types'
import { cutEdgesText, mapDescription, pieceRows, plainLabel, planTotals } from './planCopy'

// The rail's words come from the geometry, so they have to say what the drawing shows.

function modelFor(
  surface: { width: number; height: number },
  tile: number,
  layout: Partial<DesignConfig['layout']> = {},
  joint = 0,
): PlanModel {
  const config = normalizeConfig({
    ...DEFAULT_CONFIG,
    surface,
    tile: { ...DEFAULT_CONFIG.tile, width: tile, height: tile },
    joint,
    layout: { origin: 'corner', rowOffset: 0, ...layout },
  })
  const plan = computeLayout({ surface: config.surface, tile: config.tile, joint: config.joint, layout: config.layout })
  return buildPlanModel(config, plan)
}

const allCopy = (model: PlanModel) => [
  cutEdgesText(model),
  ...pieceRows(model).flatMap((r) => [r.label, r.size]),
  mapDescription(model),
]

describe('the plan in words', () => {
  it('tells the user wall exactly', () => {
    const model = modelFor({ width: 1200, height: 640 }, 100)
    expect(cutEdgesText(model)).toBe('Cuts along the bottom')
    expect(pieceRows(model)).toEqual([
      { pieceId: 'full', mark: 'A', cut: false, label: 'Full tile', size: '100 × 100', count: 72 },
      { pieceId: expect.any(String), mark: 'B', cut: true, label: 'Bottom edge', size: '100 × 40', count: 12 },
    ])
    expect(planTotals(model)).toEqual({ total: 84, files: 2 })
    expect(mapDescription(model)).toBe(
      'Drawing of your 1,200 × 640 mm wall. 72 whole tiles, marked A. 12 cut pieces along the bottom. Start 40 mm up from the bottom edge, at the left.',
    )
  })

  it('starts an exact fit in the corner, with one file and nothing to cut', () => {
    const model = modelFor({ width: 900, height: 600 }, 150)
    expect(planTotals(model).files).toBe(1)
    expect(cutEdgesText(model)).toBe('No cuts')
    expect(mapDescription(model).endsWith('Start in the bottom-left corner.')).toBe(true)
  })

  it('measures a centred grid from the left and up', () => {
    const model = modelFor({ width: 1000, height: 150 }, 150, { origin: 'center' })
    expect(mapDescription(model).endsWith('Start in the middle of the wall, 500 mm from the left and 75 mm up.')).toBe(true)
  })

  it('lists the cut edges clockwise from the top', () => {
    const two = modelFor({ width: 1250, height: 640 }, 100)
    expect(cutEdgesText(two)).toBe('Cuts on the right and bottom')
    expect(cutEdgesText(modelFor({ width: 1250, height: 640 }, 100, { rowOffset: 0.5 }))).toBe('Cuts on the right, bottom and left')
    expect(cutEdgesText(modelFor({ width: 3000, height: 2400 }, 100, { origin: 'center' }))).toBe('Cuts on every edge')
  })

  it('hides the size suffix the core adds to tell same-side cuts apart', () => {
    expect(plainLabel('Right edge · 83.3 × 100 mm')).toBe('Right edge')
    expect(plainLabel('Full tile')).toBe('Full tile')
    expect(pieceRows(modelFor({ width: 1250, height: 640 }, 100, { rowOffset: 0.3333 })).some((r) => r.label.includes('·'))).toBe(false)
  })

  it('still lists the pieces when the tile is bigger than the wall', () => {
    const model = modelFor({ width: 300, height: 250 }, 400)
    expect(() => pieceRows(model)).not.toThrow()
    expect(planTotals(model).total).toBeGreaterThan(0)
  })

  it('never writes an em-dash', () => {
    const models = [
      modelFor({ width: 1200, height: 640 }, 100),
      modelFor({ width: 900, height: 600 }, 150),
      modelFor({ width: 1100, height: 800 }, 150, { origin: 'balanced' }, 2),
      modelFor({ width: 1250, height: 640 }, 100, { rowOffset: 0.3333 }),
      modelFor({ width: 3000, height: 2400 }, 100, { origin: 'center' }),
      modelFor({ width: 300, height: 250 }, 400),
    ]
    // Built from its code point, so this file carries no em-dash of its own.
    const emDash = String.fromCharCode(0x2014)
    for (const model of models) for (const text of allCopy(model)) expect(text).not.toContain(emDash)
  })
})
