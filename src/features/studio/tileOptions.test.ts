import { describe, expect, it } from 'vitest'
import { LIMITS } from '@/core/config'
import { computeLayout } from '@/core/layout'
import { printerById } from '@/core/printers'
import type { DesignConfig } from '@/core/types'
import { BRICK_TILE_MM, MAX_TILE_CHIPS, sameTileSize, tileChoices } from './tileOptions'

// A chip states a consequence ("24 whole tiles, 8 cut pieces"), so what it says has to be what
// computeLayout then lays. These re-lay every offered size and compare.

const LAYOUT: DesignConfig['layout'] = { origin: 'corner', rowOffset: 0 }
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
})
