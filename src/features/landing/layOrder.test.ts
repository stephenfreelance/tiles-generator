import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { computeLayout } from '@/core/layout'
import type { LayoutPlan } from '@/core/types'
import { cornerSettingOut, layDelay } from './layOrder'

const WALL = { width: 1000, height: 700 }

/** The page wall as computeLayout lays it: 35 pieces, cuts on the right edge and the bottom. */
const plan: LayoutPlan = computeLayout({
  surface: WALL,
  tile: { width: 150, height: 150 },
  joint: 0,
  layout: { origin: 'corner', rowOffset: 0 },
})
const pieceById = new Map(plan.pieces.map((piece) => [piece.id, piece]))
const tiles = plan.placements.map((placement) => {
  const piece = pieceById.get(placement.pieceId)
  if (!piece) throw new Error(`Placement refers to unknown piece "${placement.pieceId}"`)
  return { x: placement.x, y: placement.y, w: piece.width, h: piece.height }
})
const origin = cornerSettingOut(WALL)
const delays = tiles.map((tile) => layDelay(tile, WALL, origin))

describe('cornerSettingOut', () => {
  it('is the top-left corner, where a corner layout is read from', () => {
    expect(origin).toEqual({ x: 0, y: 700 })
    expect(cornerSettingOut({ width: 0, height: 0 })).toEqual({ x: 0, y: 0 })
  })

  // normalizeConfig is what every landing config passes through, so the default really is this layout.
  it('matches the layout the page wall is laid with', () => {
    expect(normalizeConfig(DEFAULT_CONFIG).layout).toEqual({ origin: 'corner', rowOffset: 0 })
  })
})

describe('layDelay', () => {
  it('starts at the setting-out corner and stays inside 0..1', () => {
    expect(Math.min(...delays)).toBe(0)
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThanOrEqual(1)
    }
  })

  it('ends on the piece furthest from the corner', () => {
    const last = tiles[delays.indexOf(Math.max(...delays))]
    expect(last.x + last.w).toBe(WALL.width)
    expect(last.y).toBe(0)
    // Its nearest corner is one tile short of the far corner: 900 across and 600 down of 1,700.
    expect(Math.max(...delays)).toBeCloseTo(1500 / 1700, 6)
  })

  it('gives equal diagonals one delay, so the wave crosses at 45 degrees', () => {
    const cell = (x: number, y: number) => layDelay({ x, y, w: 150, h: 150 }, WALL, origin)
    expect(cell(150, 400)).toBeCloseTo(cell(0, 250), 12)
    expect(cell(150, 400)).toBeGreaterThan(cell(0, 400))
    expect(cell(150, 400)).toBeGreaterThan(cell(150, 550))
  })

  // A caller holding a grid of cells (the corner detail does) can ask in cells and skip the mm.
  it('reads the same in grid cells as in surface mm', () => {
    const cells = { width: 7, height: 5 }
    const mm = { width: 1050, height: 750 }
    const inCells = layDelay({ x: 6, y: 0, w: 1, h: 1 }, cells, cornerSettingOut(cells))
    const inMm = layDelay({ x: 900, y: 0, w: 150, h: 150 }, mm, cornerSettingOut(mm))
    expect(inCells).toBeCloseTo(inMm, 12)
    expect(inCells).toBeCloseTo(10 / 12, 12)
  })

  it('answers 0 for a model with no size, rather than NaN', () => {
    expect(layDelay({ x: 0, y: 0, w: 1, h: 1 }, { width: 0, height: 0 }, { x: 0, y: 0 })).toBe(0)
  })
})
