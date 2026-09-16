import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { computeLayout } from '@/core/layout'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { cornerDetail } from './cornerDetail'

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

describe('cornerDetail', () => {
  const source = planOf(wall(1000, 700))
  const detail = cornerDetail(source)

  it('takes the four pieces of the bottom-right corner, one of each model', () => {
    expect(detail.placements).toHaveLength(4)
    expect(detail.pieces).toHaveLength(4)
    expect(detail.pieces.map((piece) => piece.mark)).toEqual(['A', 'B', 'C', 'D'])
    expect(new Set(detail.placements.map((placement) => placement.pieceId)).size).toBe(4)
    expect(detail.pieces.map((piece) => [piece.width, piece.height])).toEqual([
      [150, 150],
      [150, 100],
      [100, 150],
      [100, 100],
    ])
  })

  it('reuses the source plan pieces, so marks, labels and counts cannot drift', () => {
    for (const piece of detail.pieces) expect(source.pieces).toContain(piece)
  })

  it('is the corner the cuts fall in, not any other', () => {
    const maxX = Math.max(...source.placements.map((placement) => placement.x))
    const minY = Math.min(...source.placements.map((placement) => placement.y))
    expect(detail.placements.some((placement) => placement.x === maxX && placement.y === minY)).toBe(true)
    expect(Math.min(...detail.placements.map((placement) => placement.x))).toBe(750)
    expect(Math.max(...detail.placements.map((placement) => placement.y))).toBe(100)
  })

  it('renumbers itself as the 2 x 2 grid it is', () => {
    expect([detail.columns, detail.rows]).toEqual([2, 2])
    expect(detail.placements.map((placement) => [placement.col, placement.row]).sort()).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ])
    expect([detail.fullCount, detail.partialCount, detail.exact]).toEqual([1, 3, false])
    expect(detail.warnings).toEqual([])
  })

  it('holds four whole tiles and one model when the wall divides exactly', () => {
    const exact = cornerDetail(planOf(wall(2400, 1200)))
    expect(exact.placements).toHaveLength(4)
    expect(exact.pieces).toHaveLength(1)
    expect([exact.fullCount, exact.partialCount, exact.exact]).toEqual([4, 0, true])
  })

  it('returns what a wall of one tile has, rather than inventing pieces', () => {
    const single = cornerDetail(planOf(wall(200, 200, 200)))
    expect(single.placements).toHaveLength(1)
    expect(single.pieces).toHaveLength(1)
    expect([single.columns, single.rows]).toEqual([1, 1])
  })
})
