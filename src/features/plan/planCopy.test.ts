import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { computeLayout, layoutInputOf } from '@/core/layout'
import { buildPlanModel, type PlanModel } from '@/core/plan/planModel'
import type { DesignConfig, LockKind } from '@/core/types'
import { accessoryRows, cutEdgesText, fixingsDescription, mapDescription, pieceRows, plainLabel, planTotals } from './planCopy'

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

  it('calls the point SO on a clipped design, whose start line is the bottom edge of the tiles', () => {
    // 1000 × 700 mm in 150 mm tiles: a 100 mm cut row at the foot, so SO is 100 mm up, above the start line.
    const hung = (mount: DesignConfig['mount']) => {
      const config = normalizeConfig({ ...DEFAULT_CONFIG, surface: { width: 1000, height: 700 }, mount, lock: 'keys' })
      return buildPlanModel(config, computeLayout(layoutInputOf(config)))
    }
    const clipped = hung('clips')
    expect(clipped.clips.length).toBeGreaterThan(0)
    const text = mapDescription(clipped)
    expect(text).toContain(
      'Setting-out point (SO) 100 mm up from the bottom edge, at the left. The start line is the bottom edge of the tiles: ' +
        'the bottom row stands on a batten along it, and the rows go up from there.',
    )
    expect(text).not.toMatch(/\bStart\b/)
    expect(text).not.toMatch(/rail/i)
    // The same wall glued, or keyed, keeps its Start word for word.
    expect(mapDescription(hung('glue'))).toContain('Start 100 mm up from the bottom edge, at the left.')
    expect(mapDescription(hung('glue'))).not.toContain('SO')

    const clip = { x: 75, y: 20, axis: 'h' as const, pieceId: 'full' }
    const corner = modelFor({ width: 900, height: 600 }, 150)
    expect(mapDescription({ ...corner, clips: [clip] })).toContain('Setting-out point (SO) in the bottom-left corner. The start line')
    const centred = modelFor({ width: 1000, height: 150 }, 150, { origin: 'center' })
    expect(mapDescription({ ...centred, clips: [clip] })).toContain(
      'Setting-out point (SO) in the middle of the wall, 500 mm from the left and 75 mm up. The start line',
    )
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

  it('names every mark of the whole tile once keys make border versions of it', () => {
    const keyed = (surface: { width: number; height: number }, lock: LockKind) => {
      const config = normalizeConfig({
        ...DEFAULT_CONFIG,
        surface,
        tile: { ...DEFAULT_CONFIG.tile, width: 150, height: 150 },
        lock,
        layout: { origin: 'corner', rowOffset: 0 },
      })
      return buildPlanModel(config, computeLayout(layoutInputOf(config)))
    }
    // 1000 x 700: whole tiles in four models, A to D, then the cuts.
    const model = keyed({ width: 1000, height: 700 }, 'keys')
    expect(mapDescription(model)).toContain('24 whole tiles, marked A to D.')
    expect(pieceRows(model).filter((r) => !r.cut).map((r) => r.label)).toEqual([
      'Full tile',
      'Full tile, left border',
      'Full tile, top border',
      'Full tile, top-left corner',
    ])
    // Two whole models read as a pair; one as before.
    const pair = normalizeConfig({
      ...DEFAULT_CONFIG,
      surface: { width: 1200, height: 450 },
      tile: { ...DEFAULT_CONFIG.tile, width: 150, height: 150 },
      perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'chamfer', sides: { top: true, bottom: false, left: false, right: false } },
      layout: { origin: 'corner', rowOffset: 0 },
    })
    expect(mapDescription(buildPlanModel(pair, computeLayout(layoutInputOf(pair))))).toContain('24 whole tiles, marked A and B.')
    expect(mapDescription(keyed({ width: 1000, height: 700 }, 'none'))).toContain('24 whole tiles, marked A.')
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

describe('the fixings in words', () => {
  const base = modelFor({ width: 1200, height: 600 }, 150)
  const part = (over: Partial<PlanModel['accessories'][number]>): PlanModel['accessories'][number] => ({
    id: 'x',
    mark: 'X1',
    kind: 'key',
    label: 'Part',
    group: 'join',
    count: 1,
    size: { x: 10, y: 5, z: 1 },
    ...over,
  })

  it("lists the wall's parts after the tiles, one row per file", () => {
    // PlanModel.accessories is wallParts, so the fit test never reaches here: it prints from its own page
    // and planModel.test.ts holds that. These rows are what goes on the wall.
    const model: PlanModel = {
      ...base,
      accessories: [
        part({ id: 'clip-c0.2', mark: 'C1', kind: 'clip', group: 'mount', label: 'Wall clip, standard fit', count: 68, size: { x: 48, y: 14.7, z: 2.8 } }),
        part({ id: 'key-16', mark: 'K1', label: 'Key, 15.8 mm', count: 110, size: { x: 15.8, y: 11.8, z: 1.4 } }),
      ],
    }
    expect(accessoryRows(model)).toEqual([
      { id: 'clip-c0.2', mark: 'C1', label: 'Wall clip, standard fit', size: '48 × 14.7', count: 68, files: 1 },
      { id: 'key-16', mark: 'K1', label: 'Key, 15.8 mm', size: '15.8 × 11.8', count: 110, files: 1 },
    ])
    // Every file counts, and every part printed with the wall.
    expect(planTotals(model)).toEqual({ total: 32 + 68 + 110, files: 1 + 2 })
    // A glued wall prints no part at all, so the tiles are the whole list.
    const glued: PlanModel = { ...base, accessories: [] }
    expect(accessoryRows(glued)).toEqual([])
    expect(planTotals(glued)).toEqual({ total: 32, files: 1 })
  })

  it('counts the clips and names the pieces with none, then the keys and the joints left to glue', () => {
    const clips = Array.from({ length: 64 }, (_, i) => ({ x: 75 + i, y: 20, axis: 'h' as const, pieceId: 'full' }))
    const keys = Array.from({ length: 104 }, () => ({ x: 150, y: 37.5, seam: 'vertical' as const }))
    const model: PlanModel = { ...base, clips, keys, unkeyedSeams: 3, unkeyedPieceIds: [] }
    expect(fixingsDescription(model)).toEqual([
      '64 wall clips, each in its pocket on the back of a tile: each tile carries its own clips to the wall.',
      '104 keys lock neighbouring tiles edge to edge across their joints.',
      '3 joints are too short for a key, but every piece is still keyed to a neighbour.',
    ])
    expect(mapDescription(model).endsWith('every piece is still keyed to a neighbour.')).toBe(true)
    const one: PlanModel = {
      ...base,
      clips: clips.slice(0, 1),
      unclippedPieceIds: ['full'],
      keys: keys.slice(0, 1),
      unkeyedSeams: 1,
      unkeyedPieceIds: ['full'],
    }
    expect(fixingsDescription(one)).toEqual([
      'One wall clip, in its pocket on the back of a tile: each tile carries its own clips to the wall.',
      'Piece A has no clip.',
      '1 key locks neighbouring tiles edge to edge across their joints.',
      'One joint is too short for a key: glue piece A to the tiles beside it.',
    ])
    expect(fixingsDescription(base)).toEqual([])
  })

  it('counts the joints the tabs hold and names the pieces they leave, drawing nothing for them', () => {
    const tabbed: PlanModel = { ...base, locks: 28, unlockedPieceIds: [] }
    expect(fixingsDescription(tabbed)).toEqual([
      '28 joints are held shut by a tab in the back of one tile and the socket in the next; nothing is drawn for them.',
    ])
    const loose: PlanModel = { ...base, locks: 1, unlockedPieceIds: ['full'] }
    expect(fixingsDescription(loose)).toEqual([
      'One joint is held shut by a tab in the back of one tile and the socket in the next; nothing is drawn for them.',
      'Piece A has no room for a socket, so no tab locks it.',
    ])
  })

  it('says the real clips of a clipped wall', () => {
    const config = normalizeConfig({ ...DEFAULT_CONFIG, mount: 'clips' })
    const model = buildPlanModel(config, computeLayout(layoutInputOf(config)))
    expect(model.clips.length).toBeGreaterThan(0)
    expect(mapDescription(model)).toContain(`${model.clips.length} wall clips, each in its pocket on the back of a tile`)
    expect(accessoryRows(model).map((row) => row.mark)).toContain('C1')
  })

  it('says the real keys of a keyed wall', () => {
    const config = normalizeConfig({ ...DEFAULT_CONFIG, lock: 'keys' })
    const model = buildPlanModel(config, computeLayout(layoutInputOf(config)))
    expect(mapDescription(model)).toContain('104 keys lock neighbouring tiles edge to edge across their joints.')
    const rows = accessoryRows(model)
    expect(rows.at(-1)).toEqual({ id: 'key-16x12x1.4-c0.1', mark: 'K1', label: 'Key, 15.8 mm', size: '15.8 × 11.8', count: 110, files: 1 })
    // The plan lists the wall's own parts: the fit test has its own page and never reaches the model.
    expect(model.accessories.every((a) => a.group !== 'fit-test')).toBe(true)
    expect(rows).toHaveLength(1)
    const parts = model.accessories.reduce((sum, a) => sum + a.count, 0)
    expect(planTotals(model)).toEqual({ total: 32 + parts, files: 9 + model.accessories.length })
  })
})
