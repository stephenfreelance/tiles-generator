import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config'
import { computeLayout } from '../layout'
import type { DesignConfig } from '../types'
import { buildPlanModel, chainLabels, type DimensionChain } from './planModel'

const design = (over: Partial<DesignConfig> = {}): DesignConfig => ({ ...structuredClone(DEFAULT_CONFIG), ...over })

const planFor = (config: DesignConfig) =>
  computeLayout({ surface: config.surface, tile: config.tile, joint: config.joint, layout: config.layout })

const sum = (chain: DimensionChain) => chain.items.reduce((s, i) => s + i.length, 0)

function expectContiguous(chain: DimensionChain) {
  expect(chain.items[0]?.start).toBe(0)
  for (let i = 1; i < chain.items.length; i++) {
    expect(chain.items[i].start).toBeCloseTo(chain.items[i - 1].end, 2)
  }
  expect(chain.items.at(-1)?.end).toBeCloseTo(chain.total, 2)
}

describe('buildPlanModel', () => {
  it('lists every placed tile exactly once', () => {
    const config = design({ surface: { width: 1000, height: 800 }, layout: { origin: 'center', rowOffset: 0 } })
    const plan = planFor(config)
    const model = buildPlanModel(config, plan)
    expect(model.tiles).toHaveLength(plan.placements.length)
    const keys = new Set(model.tiles.map((t) => `${t.x}:${t.y}`))
    expect(keys.size).toBe(plan.placements.length)
    expect(model.tiles.filter((t) => t.cut)).toHaveLength(plan.partialCount)
    expect(model.legend.map((r) => r.mark)).toEqual(plan.pieces.map((p) => p.mark))
    expect(model.legend.reduce((s, r) => s + r.count, 0)).toBe(plan.placements.length)
  })

  it('builds chains that sum to the surface size, joints included', () => {
    const config = design({ surface: { width: 1000, height: 700 }, joint: 2, layout: { origin: 'balanced', rowOffset: 0 } })
    const plan = planFor(config)
    const model = buildPlanModel(config, plan)
    const [bottom] = model.chains.columns
    expectContiguous(bottom)
    expectContiguous(model.chains.rows)
    expect(sum(bottom)).toBeCloseTo(1000, 2)
    expect(sum(model.chains.rows)).toBeCloseTo(700, 2)
    const pieces = bottom.items.filter((i) => i.kind === 'tile' || i.kind === 'cut')
    const joints = bottom.items.filter((i) => i.kind === 'joint')
    expect(pieces).toHaveLength(model.tiles.filter((t) => t.row === 0).length)
    expect(joints).toHaveLength(pieces.length - 1)
    expect(joints.every((j) => j.length === 2)).toBe(true)
    expect(pieces.reduce((s, p) => s + p.length, 0) + 2 * joints.length).toBeCloseTo(1000, 2)
    expect(model.chains.rows.items.filter((i) => i.kind === 'tile' || i.kind === 'cut')).toHaveLength(plan.rows)
  })

  it('marks cut widths separately from full widths along each axis', () => {
    const config = design({ surface: { width: 1000, height: 150 }, layout: { origin: 'center', rowOffset: 0 } })
    const model = buildPlanModel(config, planFor(config))
    const kinds = model.chains.columns[0].items.map((i) => [i.kind, i.length])
    expect(kinds).toEqual([['cut', 125], ['tile', 150], ['tile', 150], ['tile', 150], ['tile', 150], ['tile', 150], ['cut', 125]])
  })

  it('gives a running bond one bottom chain per row of the cycle', () => {
    const config = design({
      surface: { width: 600, height: 300 },
      tile: { width: 200, height: 100, thickness: 4 },
      layout: { origin: 'corner', rowOffset: 0.5 },
    })
    const model = buildPlanModel(config, planFor(config))
    expect(model.chains.columns.map((c) => c.title)).toEqual(['Row 1', 'Row 2'])
    for (const chain of model.chains.columns) expect(sum(chain)).toBeCloseTo(600, 2)
    expect(model.chains.columns[1].items[0]).toMatchObject({ kind: 'cut', length: 100 })
  })

  it('keeps the dropped sliver in the chain as an edge gap', () => {
    const config = design({ surface: { width: 900.5, height: 150 }, layout: { origin: 'corner', rowOffset: 0 } })
    const chain = buildPlanModel(config, planFor(config)).chains.columns[0]
    expect(chain.items.at(-1)).toMatchObject({ kind: 'gap', length: 0.5 })
    expect(sum(chain)).toBeCloseTo(900.5, 2)
  })

  it('sets out from the corner or from the centre lines', () => {
    // 800 / 150 leaves 50 mm at the bottom, so the first whole row starts there (see below).
    const corner = design({ surface: { width: 1000, height: 800 }, layout: { origin: 'corner', rowOffset: 0 } })
    const cornerModel = buildPlanModel(corner, planFor(corner))
    expect(cornerModel.settingOut).toMatchObject({ point: { x: 0, y: 50 }, modeX: 'edge', modeY: 'edge', centreLines: { x: null, y: null } })

    // 1100 mm: the joint-centred grid gives 100 mm cuts instead of 25 mm ones.
    const balanced = design({ surface: { width: 1100, height: 150 }, layout: { origin: 'balanced', rowOffset: 0 } })
    const balancedModel = buildPlanModel(balanced, planFor(balanced))
    expect(balancedModel.settingOut.modeX).toBe('joint-centred')
    expect(balancedModel.settingOut.centreLines.x).toBe(550)
    expect(balancedModel.settingOut.point.x).toBe(550)

    const centred = design({ surface: { width: 1000, height: 150 }, layout: { origin: 'center', rowOffset: 0 } })
    const centredModel = buildPlanModel(centred, planFor(centred))
    expect(centredModel.settingOut.modeX).toBe('tile-centred')
    expect(centredModel.settingOut.point.x).toBe(425)
    // The setting-out point is the corner of a real full tile.
    expect(centredModel.tiles.some((t) => !t.cut && t.x === centredModel.settingOut.point.x)).toBe(true)
    expect(centredModel.settingOut.notes.join(' ')).toContain('500 mm')
  })

  it('sets out from the first whole row when the corner grid leaves a bottom cut', () => {
    const config = design({ surface: { width: 1000, height: 800 }, layout: { origin: 'corner', rowOffset: 0 } })
    const model = buildPlanModel(config, planFor(config))
    // Whole tiles are read from the top-left, so the piece in the bottom-left corner is a cut.
    expect(model.tiles.some((t) => t.cut && t.x === 0 && t.y === 0)).toBe(true)
    expect(model.settingOut.point).toEqual({ x: 0, y: 50 })
    // The SO marker lands on the corner of a real whole tile.
    expect(model.tiles.some((t) => !t.cut && t.x === 0 && t.y === 50)).toBe(true)
    const notes = model.settingOut.notes.join(' ')
    expect(notes).toContain('top-left corner')
    expect(notes).toContain('50 mm up from the bottom edge')
    expect(notes).not.toContain('bottom-left corner')
  })

  it('keeps naming the bottom-left corner when the grid divides exactly', () => {
    const config = design({ surface: { width: 900, height: 600 }, layout: { origin: 'corner', rowOffset: 0 } })
    const model = buildPlanModel(config, planFor(config))
    expect(model.settingOut.point).toEqual({ x: 0, y: 0 })
    expect(model.settingOut.notes[0]).toContain('bottom-left corner')
  })

  it('tells the installer about the row shift of a running bond', () => {
    const config = design({ surface: { width: 900, height: 600 }, layout: { origin: 'corner', rowOffset: 0.5 } })
    const model = buildPlanModel(config, planFor(config))
    expect(model.settingOut.notes.join(' ')).toContain('half a tile')
  })

  it('keeps chains contiguous and exact for many random layouts', () => {
    let seed = 11
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const origins = ['corner', 'center', 'balanced'] as const
    const offsets = [0, 0.5, 0.3333] as const
    for (let i = 0; i < 200; i++) {
      const config = design({
        surface: { width: 200 + Math.round(rand() * 2800), height: 150 + Math.round(rand() * 1800) },
        tile: { width: 40 + Math.round(rand() * 260), height: 40 + Math.round(rand() * 260), thickness: 4 },
        joint: [0, 1.5, 2, 3][i % 4],
        layout: { origin: origins[i % 3], rowOffset: offsets[(i >> 2) % 3] },
      })
      const plan = planFor(config)
      const model = buildPlanModel(config, plan)
      for (const chain of [...model.chains.columns, model.chains.rows]) {
        expectContiguous(chain)
        expect(Math.abs(sum(chain) - chain.total)).toBeLessThan(0.02)
        expect(chain.items.every((it) => it.length > 0)).toBe(true)
      }
      expect(model.tiles).toHaveLength(plan.placements.length)
    }
  })
})

describe('chainLabels', () => {
  const config = design({ surface: { width: 9000, height: 6000 }, layout: { origin: 'balanced', rowOffset: 0 } })
  const model = buildPlanModel(config, planFor(config))
  const chain = model.chains.columns[0]

  it('labels every piece when there is room', () => {
    const labels = chainLabels(chain, 10)
    expect(labels).toHaveLength(chain.items.filter((i) => i.kind !== 'joint' && i.kind !== 'gap').length)
    expect(labels.every((l) => l.fits && !l.grouped)).toBe(true)
  })

  it('groups repeated full tiles when crowded and keeps the cuts', () => {
    const labels = chainLabels(chain, 400)
    const grouped = labels.filter((l) => l.grouped)
    expect(grouped).toHaveLength(1)
    const fullItems = chain.items.filter((i) => i.kind === 'tile')
    expect(grouped[0].text).toBe(`${fullItems.length} × 150`)
    expect(labels.filter((l) => l.cut)).toHaveLength(chain.items.filter((i) => i.kind === 'cut').length)
    expect(labels.length).toBeLessThanOrEqual(3)
  })
})
