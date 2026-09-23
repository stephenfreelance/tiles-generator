import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config'
import { accessoryParts, wallParts } from '../fixing/accessories'
import { joinPlan } from '../fixing/joins'
import { mountPlan } from '../fixing/mount'
import { tabPlan } from '../fixing/tabs'
import { computeLayout, layoutInputOf } from '../layout'
import type { DesignConfig } from '../types'
import { buildPlanModel, chainLabels, isLettered, tileAtPoint, type DimensionChain } from './planModel'

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

  it('measures a tabbed wall on the nominal tile, not on the printed box', () => {
    // The tab makes the file wider than the tile, but nothing is set out from it: the chains still close.
    const config = design({ lock: 'tabs', surface: { width: 1200, height: 600 } })
    const plan = computeLayout(layoutInputOf(config))
    const model = buildPlanModel(config, plan)
    expect(model.tile).toEqual({ width: 150, height: 150 })
    expectContiguous(model.chains.columns[0])
    expectContiguous(model.chains.rows)
    expect(sum(model.chains.columns[0])).toBeCloseTo(1200, 2)
    expect(sum(model.chains.rows)).toBeCloseTo(600, 2)
    expect(model.legend.every((row) => row.width === 150 && row.height === 150)).toBe(true)
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
    // The notes must agree with the SO point, which sits above the bottom cut, not at the top.
    expect(notes).not.toContain('top-left')
    expect(notes).toContain('50 mm up from the bottom edge')
    expect(notes).not.toContain('bottom-left corner')
  })

  it('keeps naming the bottom-left corner when the grid divides exactly', () => {
    const config = design({ surface: { width: 900, height: 600 }, layout: { origin: 'corner', rowOffset: 0 } })
    const model = buildPlanModel(config, planFor(config))
    expect(model.settingOut.point).toEqual({ x: 0, y: 0 })
    expect(model.settingOut.notes[0]).toContain('bottom-left corner')
    expect(model.settingOut.notes.join(' ')).not.toContain('cuts at the edges')
  })

  it('sets a centred running bond out from the tile or joint that really sits on the upright line', () => {
    // Half bond, 1250 x 640 of 100 mm: the row the level line runs through has a joint at 625 mm.
    const half = design({ surface: { width: 1250, height: 640 }, tile: { width: 100, height: 100, thickness: 4 }, joint: 0, layout: { origin: 'center', rowOffset: 0.5 } })
    const halfModel = buildPlanModel(half, planFor(half))
    expect(halfModel.settingOut).toMatchObject({ modeX: 'joint-centred', modeY: 'tile-centred', centreLines: { x: 625, y: 320 }, point: { x: 625, y: 270 } })
    expect(halfModel.settingOut.notes[0]).not.toContain('centre a tile')

    for (const origin of ['center', 'balanced'] as const) {
      for (const rowOffset of [0.5, 0.3333] as const) {
        for (const joint of [0, 2]) {
          for (const width of [1000, 1237, 1250]) {
            for (const height of [600, 633, 640]) {
              const config = design({ surface: { width, height }, tile: { width: 100, height: 100, thickness: 4 }, joint, layout: { origin, rowOffset } })
              const { settingOut: so, tiles } = buildPlanModel(config, planFor(config))
              const first = tileAtPoint(tiles, so.point)
              const at = `${origin} ${rowOffset} j${joint} ${width}x${height}`
              expect(first, at).not.toBeNull()
              const x = so.modeX === 'tile-centred' ? first!.x + 50 : first!.x - joint / 2
              expect({ at, x: Math.round(x * 100) / 100 }).toEqual({ at, x: so.centreLines.x })
            }
          }
        }
      }
    }
  })

  it('names the piece on the corner when a running bond starts on a cut', () => {
    const config = design({ surface: { width: 1250, height: 640 }, tile: { width: 100, height: 100, thickness: 4 }, joint: 0, layout: { origin: 'corner', rowOffset: 0.3333 } })
    const notes = buildPlanModel(config, planFor(config)).settingOut.notes.join(' ')
    expect(notes).not.toContain('Fix the full tiles first')
    expect(notes).toContain('fitting the cut pieces as you reach them')
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

describe('buildPlanModel with border versions', () => {
  const profiled = (sides: DesignConfig['perimeter']['sides']) =>
    design({
      surface: { width: 1200, height: 600 },
      perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'chamfer', width: 4, drop: 2, fade: 8, sides },
    })

  it('carries each piece edges onto its tiles and its legend row', () => {
    const config = profiled({ top: true, bottom: true, left: false, right: false })
    const plan = computeLayout(layoutInputOf(config))
    const model = buildPlanModel(config, plan)
    const byId = new Map(plan.pieces.map((p) => [p.id, p]))
    for (const t of model.tiles) expect(t.edges).toBe(byId.get(t.pieceId)!.edges)
    expect(model.legend.map((r) => [r.mark, r.edges])).toEqual(plan.pieces.map((p) => [p.mark, p.edges]))
    // Border versions are whole tiles: not cuts, but lettered on the drawing all the same.
    expect(model.tiles.filter((t) => t.cut)).toHaveLength(0)
    expect(model.basePieceId).toBe('full')
    expect(model.legend.filter((r) => isLettered(model, r)).map((r) => r.label)).toEqual([
      'Full tile, bottom border',
      'Full tile, top border',
    ])
  })

  it('letters nothing but cuts on a design without edges', () => {
    const config = design({ surface: { width: 1000, height: 800 } })
    const model = buildPlanModel(config, planFor(config))
    expect(model.basePieceId).toBe('full')
    for (const t of model.tiles) expect(isLettered(model, t)).toBe(t.cut)
  })

  it('letters every whole tile when none is the interior one', () => {
    // One row, profiled all round: every whole tile meets an edge, so each is told apart.
    const config = design({
      surface: { width: 900, height: 150 },
      perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'chamfer', width: 4, drop: 2, fade: 8 },
    })
    const model = buildPlanModel(config, computeLayout(layoutInputOf(config)))
    expect(model.basePieceId).toBeNull()
    expect(model.tiles.every((t) => isLettered(model, t))).toBe(true)
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

describe('the fixings on the plan', () => {
  const modelOf = (config: DesignConfig) => {
    const plan = computeLayout(layoutInputOf(config))
    return { plan, model: buildPlanModel(config, plan) }
  }

  it('adds nothing to a glued wall without keys', () => {
    const { model } = modelOf(design())
    expect(model).toMatchObject({
      clips: [],
      unclippedPieceIds: [],
      keys: [],
      unkeyedSeams: 0,
      unkeyedPieceIds: [],
      locks: 0,
      unlockedPieceIds: [],
      accessories: [],
    })
  })

  // Nothing is measured, marked or set out for a tab: every tile carries its own, exactly as it carries its
  // own clips. So the plan gains no symbol and no legend row, only the order the tabs force and the count.
  it('counts the joints a tab locks and the pieces it leaves, and draws nothing for either', () => {
    const config = design({ lock: 'tabs', tile: { width: 100, height: 100, thickness: 4 }, surface: { width: 410, height: 300 } })
    const plan = computeLayout(layoutInputOf(config))
    const model = buildPlanModel(config, plan)
    const tab = tabPlan(config, plan)
    expect(tab.tabs).toBeGreaterThan(0)
    expect(model.locks).toBe(tab.joints)
    expect(model.unlockedPieceIds).toEqual(tab.unlockedPieceIds)
    // No clip and no key is placed, so nothing new is drawn and the printed-parts list stays empty.
    expect(model).toMatchObject({ clips: [], unclippedPieceIds: [], keys: [], unkeyedPieceIds: [], accessories: [] })
    // The "no tab" variant is its own legend row with its own mark, which is what tells the two piles apart.
    expect(model.legend.some((row) => row.label === 'Full tile, no tab')).toBe(true)
  })

  it('keeps the glued setting-out for a tabbed wall, and replaces its order with the tabs own', () => {
    const config = design({ lock: 'tabs', tile: { width: 100, height: 100, thickness: 4 }, surface: { width: 410, height: 300 } })
    const plan = computeLayout(layoutInputOf(config))
    const model = buildPlanModel(config, plan)
    const marks = model.legend.filter((row) => model.unlockedPieceIds.includes(row.pieceId)).map((row) => row.mark)
    expect(marks).toHaveLength(3)
    expect(model.settingOut.notes).toEqual([
      'Set out from the bottom-left corner: the first whole tile sits in the corner.',
      "Set each row from left to right, fitting the cut pieces as you reach them: each tile's socket goes over the tab of the tile already up. Nothing is set out for the tabs.",
      `Pieces ${marks.slice(0, -1).join(', ')} and ${marks[2]} have no room for a socket, so no tab locks them: glue them to the tiles beside them.`,
    ])
    // The glued fitting order is left out, because a tabbed row cannot leave its cuts for last.
    expect(model.settingOut.notes.some((note) => note.includes('Fix the full tiles first'))).toBe(false)
    // Nothing is left of the clips' or the keys' own setting-out either.
    expect(model.settingOut.notes.join(' ')).not.toMatch(/start line|face down|batten/i)
  })

  it('keeps the clips setting-out on a tabbed wall on clips, and adds the order to it', () => {
    const config = design({ lock: 'tabs', mount: 'clips', surface: { width: 1200, height: 600 } })
    const plan = computeLayout(layoutInputOf(config))
    const notes = buildPlanModel(config, plan).settingOut.notes
    expect(notes[0]).toContain('The start line is the bottom edge of the tiles')
    expect(notes).toContain('Press the tiles on from the bottom row up, fitting the cut pieces as you reach them: each tile carries its own clips (see MOUNTING in the README).')
    expect(notes.at(-1)).toBe("Set each row from left to right: each tile's socket goes over the tab of the tile already up. Nothing is set out for the tabs.")
  })

  it('carries every key site of the join plan, and the key file with its count', () => {
    const config = design({ lock: 'keys' })
    const { plan, model } = modelOf(config)
    const joins = joinPlan(config, plan)
    expect(model.keys).toEqual(joins.sites)
    expect(model.keys).toHaveLength(104)
    expect(model.unkeyedSeams).toBe(joins.unkeyedSeams)
    expect(model.unkeyedPieceIds).toEqual(joins.unkeyedPieceIds)
    const key = model.accessories.find((a) => a.group === 'join')
    expect(key).toMatchObject({ mark: 'K1', group: 'join', count: 110, label: 'Key, 15.8 mm' })
  })

  // The catalogue, not the download: the fit test prints from its own page, and planCopy lists the wall's own.
  it("lists the wall's own printed parts, in print order, and never the fit test", () => {
    const config = design({ lock: 'keys', mount: 'clips' })
    const { plan, model } = modelOf(config)
    // The plan sets out the wall, so it lists what goes on the wall: the fit test prints from its own page.
    expect(model.accessories.map((a) => a.group)).toEqual(['mount', 'join'])
    expect(model.accessories.map((a) => a.id)).toEqual(wallParts(config, plan).map((a) => a.id))
    expect(model.accessories.map((a) => a.count)).toEqual(wallParts(config, plan).map((a) => a.count))
    expect(accessoryParts(config, plan).some((a) => a.group === 'fit-test')).toBe(true)
  })

  // 1000 x 800 from the corner leaves a 50 mm bottom cut, so the glue notes lay the whole rows first.
  const cutBelow = { surface: { width: 1000, height: 800 }, layout: { origin: 'corner' as const, rowOffset: 0 as const } }

  it('keeps the glue order on the sheet of a glued wall', () => {
    const notes = modelOf(design(cutBelow)).model.settingOut.notes.join(' ')
    expect(notes).toContain('50 mm up from the bottom edge')
    expect(notes).toContain('Fix the full tiles first, then the cuts at the edges.')
  })

  it('sends a wall on clips to the start line and the bottom row first, never the full tiles first', () => {
    for (const lock of ['none', 'keys'] as const) {
      const config = design({ ...cutBelow, mount: 'clips', lock })
      const { model } = modelOf(config)
      expect(model.clips.length).toBeGreaterThan(0)
      const notes = model.settingOut.notes.join(' ')
      expect(notes).not.toContain('Fix the full tiles first')
      expect(notes).not.toContain('first full-height row sits on it')
      expect(notes).not.toContain('the strip below it is the bottom cut')
      expect(notes).toContain('The start line is the bottom edge of the tiles')
      expect(notes).toContain('batten')
      expect(notes).toContain('from the bottom row up')
      expect(notes).toContain('see MOUNTING in the README')
      expect(notes.includes('left to right'), lock).toBe(lock === 'keys')
      expect(notes).not.toMatch(/rail|snap|gauge|mounting-plan/i)
    }
  })

  it('has keyed tiles set into a panel face down, then put up on a level line', () => {
    const config = design({ ...cutBelow, lock: 'keys' })
    const notes = modelOf(config).model.settingOut.notes.join(' ')
    expect(notes).not.toContain('Fix the full tiles first')
    expect(notes).not.toContain('first full-height row sits on it')
    expect(notes).toContain('face down')
    expect(notes).toContain('bottom edge')
    expect(notes).not.toContain('mounting-plan.svg')
  })

  it('still sets a keyed or clipped wall out on its centre lines, with the running bond shift', () => {
    const config = design({ surface: { width: 1000, height: 800 }, layout: { origin: 'center', rowOffset: 0.5 }, mount: 'clips' })
    const notes = modelOf(config).model.settingOut.notes.join(' ')
    expect(notes).toContain('Snap a vertical line at')
    expect(notes).toContain('half a tile')
    expect(notes).toContain('The start line is the bottom edge of the tiles')
  })

  it('gives the glue notes when the keys asked for cannot be placed', () => {
    // A 3 mm plate leaves no room for a key notch: the wall is glued whatever the switch says.
    const config = design({ ...cutBelow, lock: 'keys', tile: { ...DEFAULT_CONFIG.tile, thickness: 3 } })
    const { plan, model } = modelOf(config)
    expect(joinPlan(config, plan).keys).toBe(0)
    expect(model.settingOut.notes).toEqual(modelOf(design(cutBelow)).model.settingOut.notes)
  })

  it('gives the glue notes when the clips asked for cannot be placed', () => {
    // A 3 mm plate cannot hold a clip pocket: the wall is glued whatever the choice says.
    const thin = { ...DEFAULT_CONFIG.tile, thickness: 3 }
    const config = design({ ...cutBelow, mount: 'clips', tile: thin })
    const { model } = modelOf(config)
    expect(model).toMatchObject({ clips: [], unclippedPieceIds: [], accessories: [] })
    expect(model.settingOut.notes).toEqual(modelOf(design({ ...cutBelow, tile: thin })).model.settingOut.notes)
  })

  it('places every clip of the mount plan, bottom to top, only when the wall goes up on them', () => {
    const config = design({ mount: 'clips' })
    const { plan, model } = modelOf(config)
    const mount = mountPlan(config, plan)
    expect(mount.clips).toBeGreaterThan(0)
    expect(model.clips).toEqual(mount.sites)
    expect(model.unclippedPieceIds).toEqual(mount.unmountedPieceIds)
    // Surface coordinates, inside the wall, in reading order from the bottom.
    for (const clip of model.clips) {
      expect(clip.x).toBeGreaterThan(0)
      expect(clip.x).toBeLessThan(model.width)
      expect(clip.y).toBeGreaterThan(0)
      expect(clip.y).toBeLessThan(model.height)
    }
    for (let i = 1; i < model.clips.length; i++) {
      const [a, b] = [model.clips[i - 1], model.clips[i]]
      expect(a.y < b.y || (a.y === b.y && a.x < b.x)).toBe(true)
    }
    // Each clip lies on the tile it belongs to.
    for (const clip of model.clips) {
      const tile = model.tiles.find((t) => t.pieceId === clip.pieceId && clip.x > t.x && clip.x < t.x + t.w && clip.y > t.y && clip.y < t.y + t.h)
      expect(tile, `${clip.pieceId} at ${clip.x}, ${clip.y}`).toBeDefined()
    }
    expect(model.accessories.find((a) => a.group === 'mount')).toMatchObject({ mark: 'C1', kind: 'clip' })
    expect(modelOf(design()).model.clips).toEqual([])
  })

  it('names the pieces too small for a clip, and none when no piece takes one', () => {
    // 1000 x 612 from the corner leaves a 12 mm strip along the bottom: too short for a clip either way.
    const config = design({ surface: { width: 1000, height: 612 }, layout: cutBelow.layout, mount: 'clips' })
    const { plan, model } = modelOf(config)
    expect(model.unclippedPieceIds).toEqual(mountPlan(config, plan).unmountedPieceIds)
    expect(model.unclippedPieceIds.length).toBeGreaterThan(0)
    for (const id of model.unclippedPieceIds) expect(model.clips.some((c) => c.pieceId === id)).toBe(false)
    // Tiles too small for any clip: the wall is glued, so nothing is "without" a clip.
    const tiny = design({ mount: 'clips', tile: { width: 32, height: 32, thickness: 4 } })
    const small = modelOf(tiny).model
    expect(small.clips).toEqual([])
    expect(small.unclippedPieceIds).toEqual([])
    expect(small.settingOut.notes).toEqual(modelOf(design({ tile: { width: 32, height: 32, thickness: 4 } })).model.settingOut.notes)
  })
})
