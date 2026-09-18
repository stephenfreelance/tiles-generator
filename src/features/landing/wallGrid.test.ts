import { describe, expect, it } from 'vitest'
import { computeLayout } from '@/core/layout'
import { printerById } from '@/core/printers'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { LANDING_BASE, landingConfig, LANDING_DESIGN_START } from './landingDesign'
import { buildWallGrid } from './wallGrid'

const planOf = (config: DesignConfig): LayoutPlan =>
  computeLayout({
    surface: config.surface,
    tile: config.tile,
    joint: config.joint,
    layout: config.layout,
    bed: printerById(config.printerId),
  })

const wallOf = (widthMm: number, heightMm: number) =>
  buildWallGrid(planOf(landingConfig({ ...LANDING_DESIGN_START, widthMm, heightMm })))

describe('buildWallGrid', () => {
  it('lays the landing wall as its own columns and rows', () => {
    const plan = planOf(LANDING_BASE)
    const grid = buildWallGrid(plan)
    expect(grid.columnCount).toBe(plan.columns)
    expect(grid.rowCount).toBe(plan.rows)
    expect(grid.cells).toHaveLength(plan.placements.length)
  })

  it('gives every placement one cell, at a grid position of its own', () => {
    const grid = wallOf(1000, 700)
    const seen = new Set(grid.cells.map((cell) => `${cell.column}:${cell.row}`))
    expect(seen.size).toBe(grid.cells.length)
    for (const cell of grid.cells) {
      expect(cell.column).toBeGreaterThanOrEqual(1)
      expect(cell.column).toBeLessThanOrEqual(grid.columnCount)
      expect(cell.row).toBeGreaterThanOrEqual(1)
      expect(cell.row).toBeLessThanOrEqual(grid.rowCount)
    }
  })

  it('sizes the tracks in millimetres, so the tracks add up to the wall', () => {
    const grid = wallOf(1000, 700)
    const track = (value: string) => value.split(' ').map((entry) => Number.parseFloat(entry))
    expect(track(grid.columns)).toHaveLength(grid.columnCount)
    expect(track(grid.rows)).toHaveLength(grid.rowCount)
    // The landing wall butts its tiles, so the tracks cover the surface exactly.
    expect(track(grid.columns).reduce((total, width) => total + width, 0)).toBeCloseTo(1000, 6)
    expect(track(grid.rows).reduce((total, height) => total + height, 0)).toBeCloseTo(700, 6)
    expect(grid.aspect).toBe('1000 / 700')
  })

  it('reads the wall from the top-left: the first tile laid is the top-left one', () => {
    const grid = wallOf(1000, 700)
    const first = grid.cells[0]
    expect(first.order).toBe(0)
    expect(first.lay).toBe(0)
    expect(first.column).toBe(1)
    expect(first.row).toBe(1)
    expect(first.edge).toEqual({ top: true, bottom: false, left: true, right: false })
  })

  it('lays out from the corner: the far corner goes last and no delay leaves 0..1', () => {
    const grid = wallOf(1000, 700)
    const last = grid.cells[grid.cells.length - 1]
    expect(last.column).toBe(grid.columnCount)
    expect(last.row).toBe(grid.rowCount)
    expect(last.edge).toEqual({ top: false, bottom: true, left: false, right: true })
    for (const cell of grid.cells) {
      expect(cell.lay).toBeGreaterThanOrEqual(0)
      expect(cell.lay).toBeLessThanOrEqual(1)
    }
    const delays = grid.cells.map((cell) => cell.lay)
    expect([...delays].sort((a, b) => a - b)).toEqual(delays)
  })

  it('puts the cut pieces on the last column and the last row', () => {
    const grid = wallOf(1000, 700)
    const cut = grid.cells.filter((cell) => cell.piece.kind !== 'full')
    expect(cut.length).toBeGreaterThan(0)
    for (const cell of cut) {
      expect(cell.column === grid.columnCount || cell.row === grid.rowCount).toBe(true)
    }
  })

  it('keeps a cell key across a resize, so a wider wall moves cells rather than remounting them', () => {
    const before = wallOf(1000, 700)
    const after = wallOf(1200, 700)
    const shared = new Set(before.cells.map((cell) => cell.key))
    // Every cell the narrower wall had is still on the wider one, under the same key.
    for (const cell of before.cells.filter((entry) => entry.column < before.columnCount)) {
      expect(shared.has(cell.key)).toBe(true)
      expect(after.cells.some((entry) => entry.key === cell.key)).toBe(true)
    }
  })

  it('handles a wall of one tile', () => {
    const grid = wallOf(300, 300)
    expect(grid.columnCount).toBeGreaterThanOrEqual(1)
    expect(grid.rowCount).toBeGreaterThanOrEqual(1)
    expect(grid.cells.length).toBe(grid.columnCount * grid.rowCount)
    expect(grid.cells[0].lay).toBe(0)
  })

  it('drops a placement whose piece is missing rather than drawing a hole', () => {
    const plan = planOf(LANDING_BASE)
    const broken: LayoutPlan = { ...plan, placements: [...plan.placements, { pieceId: 'nope', x: 0, y: 0, row: 0, col: 0 }] }
    expect(buildWallGrid(broken).cells).toHaveLength(plan.placements.length)
  })
})
