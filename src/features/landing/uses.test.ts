import { describe, expect, it } from 'vitest'
import { normalizeConfig } from '@/core/config'
import { computeLayout } from '@/core/layout'
import { LANDING_BASE } from './landingDesign'
import {
  captionDetail,
  CUBE_SHELF,
  cubeCell,
  FLOOR,
  PLATE_ASPECT,
  roomLabel,
  studioDesign,
  tileCells,
  USES,
  type RoomRect,
} from './uses'

const overlap = (a: RoomRect, b: RoomRect): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

const inside = (rect: RoomRect, box: RoomRect): boolean =>
  rect.x >= box.x && rect.y >= box.y && rect.x + rect.width <= box.x + box.width && rect.y + rect.height <= box.y + box.height

describe('the uses the plates show', () => {
  it('reads kitchen first, and names each use once', () => {
    expect(USES.map((use) => use.id)).toEqual(['splashback', 'sideboard', 'feature-wall', 'headboard', 'shelf-doors', 'tv-wall'])
    expect(new Set(USES.map((use) => use.name)).size).toBe(USES.length)
  })

  it('frames every plate in one proportion, so the six make an even grid', () => {
    for (const use of USES) expect(use.frame.width / use.frame.height).toBeCloseTo(PLATE_ASPECT, 9)
  })

  it('draws every surface at the size its caption gives, in its plate and whole wherever the plate can hold it', () => {
    for (const use of USES) {
      expect(use.places.length).toBeGreaterThan(0)
      const fits = use.surface.width <= use.frame.width && use.surface.height <= use.frame.height
      for (const rect of use.places) {
        expect([rect.width, rect.height]).toEqual([use.surface.width, use.surface.height])
        expect(overlap(rect, use.frame)).toBeGreaterThan(0)
        if (fits) expect(inside(rect, use.frame)).toBe(true)
      }
      // Close on the surface: the tiling runs across most of the plate's width.
      const { x, width } = use.frame
      const left = Math.max(x, Math.min(...use.places.map((rect) => rect.x)))
      const right = Math.min(x + width, Math.max(...use.places.map((rect) => rect.x + rect.width)))
      expect((right - left) / width).toBeGreaterThan(0.5)
      for (const [i, a] of use.places.entries()) {
        for (const b of use.places.slice(i + 1)) expect(overlap(a, b)).toBe(0)
      }
    }
  })

  it('fits every cube door to a cell of a shelf that stands on the floor, whole in its plate', () => {
    const { x, y, columns, rows, board, divider, cell } = CUBE_SHELF
    const width = 2 * board + columns * cell.width + (columns - 1) * divider
    const height = 2 * board + rows * cell.height + (rows - 1) * divider
    expect(y + height).toBe(FLOOR)
    const plate = USES.find((use) => use.id === 'shelf-doors')?.frame
    expect(plate && inside({ x, y, width, height }, plate)).toBe(true)
    expect(cubeCell(columns - 1, rows - 1)).toEqual({
      x: x + width - board - cell.width,
      y: y + height - board - cell.height,
      ...cell,
    })
    const doors = USES.find((use) => use.id === 'shelf-doors')
    expect(doors?.places).toHaveLength(8)
  })

  it('captions each size as the studio will open it', () => {
    expect(USES.map(captionDetail)).toEqual([
      '240 × 60 cm',
      '3 doors of 60 × 64 cm',
      '240 × 120 cm',
      '180 × 90 cm',
      '8 doors of 33 × 33 cm',
      '300 × 150 cm',
    ])
    expect(roomLabel(USES[0])).toBe('Splashback in a kitchen, 240 × 60 cm. Open it in the studio.')
    expect(roomLabel(USES[1])).toBe('Sideboard in a dining room, 3 doors of 60 × 64 cm. Open one in the studio.')
  })

  it('opens the studio on the surface named and sized, in the visitor tile', () => {
    for (const use of USES) {
      const design = normalizeConfig({ ...LANDING_BASE, ...studioDesign(use) })
      expect(design.surface).toEqual(use.surface)
      expect(design.name).toBe(use.piece)
      expect(design.tile).toEqual(LANDING_BASE.tile)
      expect(design.texture).toEqual(LANDING_BASE.texture)
    }
  })
})

describe('the tiles drawn on each surface', () => {
  it('are the tiles the studio lays, covering the surface exactly once', () => {
    for (const use of USES) {
      for (const rect of use.places) {
        const cells = tileCells(rect, LANDING_BASE)
        const plan = computeLayout({ surface: use.surface, tile: LANDING_BASE.tile, joint: 0, layout: LANDING_BASE.layout })
        expect(cells).toHaveLength(plan.placements.length)
        // Every whole tile clipped to the surface: the pieces tile it with no gap and no overlap.
        const covered = cells.reduce((sum, cell) => sum + overlap(cell, rect), 0)
        expect(covered).toBeCloseTo(rect.width * rect.height, 6)
        for (const [i, a] of cells.entries()) {
          for (const b of cells.slice(i + 1)) expect(overlap(a, b)).toBe(0)
        }
        for (const cell of cells) {
          expect(cell.lay).toBeGreaterThanOrEqual(0)
          expect(cell.lay).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('sets out from the top-left corner, where the first whole tile goes', () => {
    const [splashback] = USES
    const cells = tileCells(splashback.places[0], LANDING_BASE)
    const first = cells.find((cell) => cell.lay === 0)
    expect(first).toMatchObject({ x: splashback.places[0].x, y: splashback.places[0].y })
  })

  it('lays the splashback in 64 whole tiles and cuts a cube door from nine', () => {
    const exact = computeLayout({ surface: USES[0].surface, tile: LANDING_BASE.tile, joint: 0, layout: LANDING_BASE.layout })
    expect([exact.placements.length, exact.partialCount]).toEqual([64, 0])
    const door = computeLayout({ surface: USES[4].surface, tile: LANDING_BASE.tile, joint: 0, layout: LANDING_BASE.layout })
    expect([door.placements.length, door.partialCount]).toEqual([9, 5])
  })
})
