import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, LIMITS } from '@/core/config'
import { tabLimits } from '@/core/fixing/capability'
import { computeLayout } from '@/core/layout'
import { printerById } from '@/core/printers'
import type { DesignConfig } from '@/core/types'
import {
  BRICK_TILE_MM,
  followRecommendation,
  heldRecommendationNote,
  holdsRecommendation,
  MAX_TILE_CHIPS,
  RECOMMENDED,
  recommendationFor,
  sameTileSize,
  tileChoiceKind,
  tileChoices,
  tileChoicesFor,
} from './tileOptions'

// A chip states a consequence ("24 whole tiles, 8 cut pieces"), so what it says has to be what
// computeLayout then lays. These re-lay every offered size and compare.

const LAYOUT: DesignConfig['layout'] = { origin: 'corner', rowOffset: 0 }
const sizeOf = (tile: { width: number; height: number }) => ({ width: tile.width, height: tile.height })
const OPTIONS = { min: LIMITS.tile.min, max: LIMITS.tile.max, layout: LAYOUT }

const WALLS = [
  { width: 1200, height: 600 },
  { width: 1000, height: 630 },
  { width: 2400, height: 1200 },
  { width: 300, height: 600 },
  { width: 800, height: 300 },
  { width: 1234, height: 567 },
]

describe('tileChoices', () => {
  it('states what the layout really lays, for every chip on every wall', () => {
    for (const surface of WALLS) {
      for (const choice of tileChoices(surface, 0, OPTIONS)) {
        const plan = computeLayout({
          surface,
          tile: { width: choice.fit.width, height: choice.fit.height },
          joint: 0,
          layout: LAYOUT,
        })
        expect({ chip: choice.value, ...choice.fit }).toEqual({
          chip: choice.value,
          width: choice.fit.width,
          height: choice.fit.height,
          columns: plan.columns,
          rows: plan.rows,
          exact: plan.exact,
          cuts: plan.partialCount,
          tiles: plan.placements.length,
          whole: plan.fullCount,
        })
      }
    }
  })

  it('keeps the row scannable and never offers the same size twice', () => {
    for (const surface of WALLS) {
      const choices = tileChoices(surface, 0, OPTIONS)
      expect(choices.length).toBeLessThanOrEqual(MAX_TILE_CHIPS)
      for (const [index, choice] of choices.entries()) {
        const twin = choices.findIndex((other) => sameTileSize(other.fit, choice.fit))
        expect(twin).toBe(index)
        expect(new Set(choices.map((c) => c.value)).size).toBe(choices.length)
      }
    }
  })

  it('keeps the rectangle when a full row has to give a chip up', () => {
    // This wall divides into no square at all, so the recommendation is a rectangle and the nearest
    // familiar square differs from it: the row overflows and a square, not the brick, gives way.
    const choices = tileChoices({ width: 1000, height: 630 }, 0, OPTIONS)
    expect(choices).toHaveLength(MAX_TILE_CHIPS)
    expect(choices.at(-1)?.fit).toMatchObject(BRICK_TILE_MM)
  })

  it('offers the brick and the familiar squares on the default wall', () => {
    const names = tileChoices({ width: 1200, height: 600 }, 0, OPTIONS).map((choice) => choice.name)
    expect(names).toEqual(['Recommended', '100 mm square', '200 mm square', '200 × 100 mm brick'])
  })

  it('keeps a picked familiar size on its own chip where the wall makes it the recommendation', () => {
    const surface = { width: 1300, height: 600 }
    const plain = tileChoices(surface, 0, OPTIONS)
    expect(plain[0].fit).toMatchObject({ width: 100, height: 100 })
    expect(plain.some((choice) => choice.name === '100 mm square')).toBe(false)
    const picked = tileChoices(surface, 0, OPTIONS, { width: 100, height: 100 })
    expect(picked.map((choice) => choice.name)).toContain('100 mm square')
    expect(picked[0].value).toBe(RECOMMENDED)
    expect(picked.length).toBeLessThanOrEqual(MAX_TILE_CHIPS)
  })

  it('drops a size that would leave no whole tile at all', () => {
    const choices = tileChoices({ width: 150, height: 150 }, 0, OPTIONS)
    for (const choice of choices) expect(choice.fit.whole).toBeGreaterThan(0)
    expect(choices.some((choice) => choice.fit.width > 150)).toBe(false)
  })

  it('offers nothing the chosen printer cannot print', () => {
    const bed = printerById('bambu-a1-mini')
    for (const surface of WALLS) {
      for (const choice of tileChoices(surface, 0, { ...OPTIONS, bed })) {
        const { width, height } = choice.fit
        const fits = (width <= bed.width && height <= bed.depth) || (height <= bed.width && width <= bed.depth)
        expect({ size: `${width}x${height}`, fits }).toEqual({ size: `${width}x${height}`, fits: true })
      }
    }
  })

  it('offers nothing whose printed box misses the bed once the tabs are cut', () => {
    const bed = printerById('bambu-a1-mini')
    const wall = { surface: { width: 1050, height: 700 }, printerId: 'bambu-a1-mini' }
    const plain: DesignConfig = { ...structuredClone(DEFAULT_CONFIG), ...wall }
    const tabbed: DesignConfig = { ...plain, lock: 'tabs' }
    const grow = tabLimits(tabbed)!.projection
    // 175 mm covers this wall exactly and prints on this bed, until the tab is counted against it.
    expect(tileChoicesFor(plain).some((choice) => choice.fit.width === 175)).toBe(true)
    expect(tileChoicesFor(tabbed).some((choice) => choice.fit.width === 175)).toBe(false)
    for (const choice of tileChoicesFor(tabbed)) {
      expect(choice.fit.width + grow, choice.value).toBeLessThanOrEqual(bed.width)
    }
  })
})

describe('followRecommendation', () => {
  // A design on Recommended: the tile is whatever this wall recommends.
  const onRecommended = (patch: Partial<DesignConfig> = {}): DesignConfig => {
    const base = { ...structuredClone(DEFAULT_CONFIG), ...patch }
    const fit = recommendationFor(base)
    if (!fit) throw new Error('this wall has no recommendation')
    return { ...base, tile: { ...base.tile, width: fit.width, height: fit.height } }
  }

  it('starts from a default design that is on Recommended, as the group shows it', () => {
    expect(sizeOf(recommendationFor(DEFAULT_CONFIG)!)).toEqual({ width: 150, height: 150 })
    const [first] = tileChoicesFor(DEFAULT_CONFIG)
    expect(first.value).toBe(RECOMMENDED)
    expect(sameTileSize(first.fit, DEFAULT_CONFIG.tile)).toBe(true)
  })

  it('moves a Recommended tile with every input the recommendation reads', () => {
    const start = onRecommended()
    const narrow = onRecommended({ surface: { width: 1000, height: 600 } })
    const edits: [string, DesignConfig, DesignConfig][] = [
      ['width', start, { ...start, surface: { ...start.surface, width: 1000 } }],
      ['height', start, { ...start, surface: { ...start.surface, height: 610 } }],
      ['joint', start, { ...start, joint: 2 }],
      ['origin', start, { ...start, layout: { ...start.layout, origin: 'center' } }],
      ['printer', narrow, { ...narrow, printerId: 'bambu-a1-mini' }],
    ]
    for (const [input, before, edited] of edits) {
      const after = followRecommendation(before, edited)
      const now = recommendationFor(edited)!
      expect({ input, tile: sizeOf(after.tile) }).toEqual({ input, tile: sizeOf(now) })
      expect({ input, moved: !sameTileSize(after.tile, before.tile) }).toEqual({ input, moved: true })
    }
    expect(sizeOf(followRecommendation(start, edits[0][2]).tile)).toEqual({ width: 200, height: 200 })
    // The small bed cannot print the 200 mm the wider bed recommended on this wall.
    const bed = printerById('bambu-a1-mini')
    const printed = followRecommendation(narrow, edits[4][2]).tile
    expect(Math.max(printed.width, printed.height)).toBeLessThanOrEqual(Math.max(bed.width, bed.depth))
  })

  it('follows the recommendation when the tabs no longer let the printed box land on the bed', () => {
    const before = onRecommended({ surface: { width: 1050, height: 700 }, printerId: 'bambu-a1-mini' })
    expect(sizeOf(before.tile)).toEqual({ width: 175, height: 175 })
    const tabbed: DesignConfig = { ...before, lock: 'tabs' }
    const after = followRecommendation(before, tabbed)
    expect(sizeOf(after.tile)).toEqual(sizeOf(recommendationFor(tabbed)!))
    expect(sameTileSize(after.tile, before.tile)).toBe(false)
  })

  it('keeps the thickness and everything else the edit set', () => {
    const before = onRecommended()
    const edited = { ...before, surface: { width: 1000, height: 600 }, tile: { ...before.tile, thickness: 6 } }
    const after = followRecommendation(before, edited)
    expect(after).toEqual({ ...edited, tile: { width: 200, height: 200, thickness: 6 } })
  })

  it('leaves an edit that set the tile itself alone', () => {
    const before = onRecommended()
    const both = { ...before, surface: { ...before.surface, width: 1000 }, tile: { ...before.tile, width: 100, height: 100 } }
    expect(followRecommendation(before, both)).toBe(both)
  })

  it('costs nothing on an edit the recommendation does not read', () => {
    const before = onRecommended()
    const edited = { ...before, color: '#1E63C4', texture: { ...before.texture, depth: 1 }, bevel: 1, name: 'Hall' }
    expect(followRecommendation(before, edited)).toBe(edited)
  })

  it('keeps the tile where a running bond offers no recommendation, and picks it up again on straight rows', () => {
    const before = onRecommended()
    const bond = { ...before, layout: { ...before.layout, rowOffset: 0.5 as const } }
    expect(recommendationFor(bond)).toBeNull()
    const afterBond = followRecommendation(before, bond)
    expect(afterBond).toBe(bond)
    // Back on straight rows the kept tile is the recommendation again, so the next wall edit follows.
    const straight = followRecommendation(afterBond, { ...afterBond, layout: { ...afterBond.layout, rowOffset: 0 } })
    expect(sameTileSize(straight.tile, recommendationFor(straight)!)).toBe(true)
    const wider = followRecommendation(straight, { ...straight, surface: { ...straight.surface, width: 1000 } })
    expect(sizeOf(wider.tile)).toEqual({ width: 200, height: 200 })
  })

  it('takes the recommendation back after a wall edit made while a running bond offered none', () => {
    const centred = onRecommended({ layout: { origin: 'center', rowOffset: 0 } })
    const bond = followRecommendation(centred, { ...centred, layout: { ...centred.layout, rowOffset: 0.5 } })
    const narrower = followRecommendation(bond, { ...bond, surface: { ...bond.surface, width: 1000 } })
    expect(narrower.tile).toEqual(centred.tile)
    const straight = followRecommendation(narrower, { ...narrower, layout: { ...narrower.layout, rowOffset: 0 } })
    expect(sizeOf(straight.tile)).toEqual(sizeOf(recommendationFor(straight)!))
    expect(sameTileSize(straight.tile, centred.tile)).toBe(false)
  })

  it('stays on Recommended through a whole stepper run, however far the recommendation jumps', () => {
    let design = onRecommended({ surface: { width: 1000, height: 600 } })
    const sizes = new Map<number, string>()
    for (let width = 1010; width <= 1400; width += 10) {
      design = followRecommendation(design, { ...design, surface: { ...design.surface, width } })
      expect({ width, on: sameTileSize(design.tile, recommendationFor(design)!) }).toEqual({ width, on: true })
      sizes.set(width, `${design.tile.width}x${design.tile.height}`)
    }
    // One 10 mm press can take the tile from 60 to 50 mm: faithful to the recommendation, not smoothed.
    expect([sizes.get(1140), sizes.get(1150)]).toEqual(['60x60', '50x50'])
  })
})

describe('tileChoiceKind', () => {
  const withTile = (config: DesignConfig, width: number, height = width): DesignConfig => ({
    ...config,
    tile: { ...config.tile, width, height },
  })

  it('reads the choice from the design when nothing was chosen on this page', () => {
    expect(tileChoiceKind(null, DEFAULT_CONFIG)).toBe('recommended')
    expect(tileChoiceKind(null, withTile(DEFAULT_CONFIG, 100))).toBe('size')
    expect(tileChoiceKind(null, withTile(DEFAULT_CONFIG, 137, 142))).toBe('custom')
  })

  it('keeps a picked size that the wall later makes the recommendation', () => {
    const picked = withTile(DEFAULT_CONFIG, 100)
    const memo = { kind: 'size' as const, width: 100, height: 100 }
    const wider = { ...picked, surface: { ...picked.surface, width: 1300 } }
    // The familiar square is now the recommendation, but the maker picked it as a size.
    expect(sizeOf(recommendationFor(wider)!)).toEqual({ width: 100, height: 100 })
    expect(tileChoiceKind(memo, wider)).toBe('size')
  })

  it('forgets a choice once a load, an undo or a link changes the tile', () => {
    const pinned = { kind: 'custom' as const, width: 163, height: 150 }
    expect(tileChoiceKind(pinned, withTile(DEFAULT_CONFIG, 163, 150))).toBe('custom')
    expect(tileChoiceKind(pinned, DEFAULT_CONFIG)).toBe('recommended')
    const followed = { kind: 'recommended' as const, width: 200, height: 200 }
    expect(tileChoiceKind(followed, withTile(DEFAULT_CONFIG, 100))).toBe('size')
  })
})

describe('holdsRecommendation', () => {
  const bond = { ...DEFAULT_CONFIG, layout: { ...DEFAULT_CONFIG.layout, rowOffset: 0.5 as const } }

  it('holds only a Recommended choice that has no recommendation to show', () => {
    expect(tileChoicesFor(bond).some((choice) => choice.value === RECOMMENDED)).toBe(false)
    expect(holdsRecommendation(tileChoicesFor(bond), 'recommended')).toBe(true)
    expect(holdsRecommendation(tileChoicesFor(bond), 'size')).toBe(false)
    expect(holdsRecommendation(tileChoicesFor(bond), 'custom')).toBe(false)
    expect(holdsRecommendation(tileChoicesFor(DEFAULT_CONFIG), 'recommended')).toBe(false)
  })

  it('names why the size is held in the terms of the layout', () => {
    expect(heldRecommendationNote(bond)).toContain('Shifted rows')
    expect(heldRecommendationNote(DEFAULT_CONFIG)).toContain('without cuts')
    expect(heldRecommendationNote(bond)).not.toMatch(/\u2014/)
  })
})
