import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './config'
import { pieceSockets, pieceTabs, TAB_SIDE } from './fixing/tabs'
import type { BackFeature } from './fixing/types'
import {
  axisStart,
  basePiece,
  computeLayout,
  edgeSides,
  hasEdges,
  layoutInputOf,
  perfectFitSizes,
  recommendedTile,
  STANDARD_TILE_SIZES,
  THIN_CUT_MM,
  tilePresets,
  type LayoutEdges,
  type LayoutInput,
} from './layout'
import { hasSide, sideBit } from './sides'
import type { DesignConfig, LayoutPlan, PieceSpec } from './types'

const base = (over: Partial<LayoutInput> = {}): LayoutInput => ({
  surface: { width: 900, height: 600 },
  tile: { width: 150, height: 150 },
  joint: 0,
  layout: { origin: 'corner', rowOffset: 0 },
  ...over,
})

const countOf = (plan: ReturnType<typeof computeLayout>, label: string) =>
  plan.pieces.find((p) => p.label === label)?.count ?? 0

describe('computeLayout', () => {
  it('covers an exact surface with full tiles only', () => {
    const plan = computeLayout(base())
    expect(plan.exact).toBe(true)
    expect(plan.pieces).toHaveLength(1)
    expect(plan.pieces[0]).toMatchObject({ id: 'full', mark: 'A', count: 24 })
    expect(plan.columns).toBe(6)
    expect(plan.rows).toBe(4)
    expect(plan.warnings).toEqual([])
  })

  it('cuts the right edge when the width does not divide', () => {
    const plan = computeLayout(base({ surface: { width: 1000, height: 750 } }))
    expect(plan.fullCount).toBe(30)
    expect(plan.pieces).toHaveLength(2)
    const edge = plan.pieces[1]
    expect(edge).toMatchObject({ kind: 'edge', label: 'Right edge', width: 100, height: 150, count: 5, mark: 'B' })
    expect(edge.crop).toEqual({ x0: 0, y0: 0, x1: 100, y1: 150 })
  })

  it('anchors the top-left corner, so the cuts fall at the right and the bottom', () => {
    const plan = computeLayout(base({ surface: { width: 1000, height: 800 } }))
    expect(plan.fullCount).toBe(30)
    expect(countOf(plan, 'Right edge')).toBe(5)
    expect(countOf(plan, 'Bottom edge')).toBe(6)
    expect(countOf(plan, 'Bottom-right corner')).toBe(1)
    expect(plan.partialCount).toBe(12)
    // The top row of tiles is whole and flush with the top of the wall.
    const top = Math.max(...plan.placements.map((p) => p.y))
    expect(top + 150).toBeCloseTo(800, 6)
  })

  it('centres the grid with equal cuts on opposite edges', () => {
    const plan = computeLayout(base({ surface: { width: 1000, height: 150 }, layout: { origin: 'center', rowOffset: 0 } }))
    expect(plan.fullCount).toBe(5)
    const left = plan.pieces.find((p) => p.label === 'Left edge')
    const right = plan.pieces.find((p) => p.label === 'Right edge')
    expect(left?.width).toBe(125)
    expect(right?.width).toBe(125)
    // The left cut keeps the right part of the tile so the pattern meets its neighbour.
    expect(left?.crop).toEqual({ x0: 25, y0: 0, x1: 150, y1: 150 })
    expect(right?.crop).toEqual({ x0: 0, y0: 0, x1: 125, y1: 150 })
  })

  it('balanced picks the grid with the widest narrowest cut', () => {
    // Tile-centred gives 125 mm cuts, joint-centred 50 mm cuts.
    expect(axisStart(1000, 150, 0, 'balanced')).toBe(axisStart(1000, 150, 0, 'center'))
    // Tile-centred gives 25 mm cuts, joint-centred 100 mm cuts.
    const start = axisStart(1100, 150, 0, 'balanced')
    const plan = computeLayout(base({ surface: { width: 1100, height: 150 }, layout: { origin: 'balanced', rowOffset: 0 } }))
    expect(start).toBe(-50)
    expect(Math.min(...plan.pieces.map((p) => p.width))).toBe(100)
  })

  it('offsets every other row for a running bond', () => {
    const plan = computeLayout(
      base({ surface: { width: 600, height: 300 }, tile: { width: 200, height: 100 }, layout: { origin: 'corner', rowOffset: 0.5 } }),
    )
    expect(plan.fullCount).toBe(8)
    const cuts = plan.pieces.filter((p) => p.kind !== 'full')
    expect(cuts.map((p) => [p.crop.x0, p.crop.x1, p.count]).sort()).toEqual([
      [0, 100, 1],
      [100, 200, 1],
    ])
  })

  it('accounts for joints between tiles', () => {
    const plan = computeLayout(base({ surface: { width: 606, height: 150 }, joint: 2 }))
    expect(plan.exact).toBe(true)
    expect(plan.fullCount).toBe(4)
    expect(plan.placements.map((p) => p.x)).toEqual([0, 152, 304, 456])
  })

  it('drops slivers thinner than a millimetre and says so', () => {
    const plan = computeLayout(base({ surface: { width: 900.5, height: 150 } }))
    expect(plan.exact).toBe(true)
    expect(plan.warnings.map((w) => w.code)).toContain('sliver-dropped')
  })

  it('warns about thin cuts and tiles that exceed the bed', () => {
    const plan = computeLayout(
      base({
        surface: { width: 908, height: 300 },
        tile: { width: 300, height: 150 },
        bed: { name: 'Bambu Lab A1 mini', width: 180, depth: 180 },
      }),
    )
    const codes = plan.warnings.map((w) => w.code)
    expect(codes).toContain('thin-cut')
    expect(codes).toContain('exceeds-bed')
  })

  it('tiles the whole surface with no overlap for many random configurations', () => {
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const origins = ['corner', 'center', 'balanced'] as const
    const offsets = [0, 0.5, 0.3333] as const
    for (let i = 0; i < 300; i++) {
      const input = base({
        surface: { width: 200 + Math.round(rand() * 2800), height: 150 + Math.round(rand() * 1800) },
        tile: { width: 40 + Math.round(rand() * 260), height: 40 + Math.round(rand() * 260) },
        layout: { origin: origins[i % 3], rowOffset: offsets[(i >> 2) % 3] },
      })
      const plan = computeLayout(input)
      const byId = new Map(plan.pieces.map((p) => [p.id, p]))
      let area = 0
      for (const pl of plan.placements) {
        const piece = byId.get(pl.pieceId)!
        expect(pl.x).toBeGreaterThanOrEqual(-0.01)
        expect(pl.y).toBeGreaterThanOrEqual(-0.01)
        expect(pl.x + piece.width).toBeLessThanOrEqual(input.surface.width + 0.02)
        expect(pl.y + piece.height).toBeLessThanOrEqual(input.surface.height + 0.02)
        area += piece.width * piece.height
      }
      const dropped = plan.warnings.some((w) => w.code === 'sliver-dropped')
      const surfaceArea = input.surface.width * input.surface.height
      // Joint 0: tiles cover the surface exactly, minus any sliver left to the joint.
      if (dropped) expect(area).toBeLessThanOrEqual(surfaceArea + 1)
      else expect(Math.abs(area - surfaceArea) / surfaceArea).toBeLessThan(1e-4)
      expect(plan.pieces.reduce((n, p) => n + p.count, 0)).toBe(plan.placements.length)
    }
  })

  it('lays out the largest legal wall with the smallest tile without blowing the stack', () => {
    // The documented maximum surface with the minimum tile: a million pieces, all reachable by typing.
    const plan = computeLayout(base({ surface: { width: 20000, height: 20000 }, tile: { width: 20, height: 20 } }))
    expect(plan.placements).toHaveLength(1_000_000)
    expect(plan.columns).toBe(1000)
    expect(plan.rows).toBe(1000)
    expect(plan.exact).toBe(true)
  })

  it('raises one thin-cut note covering every thin piece, not one note each', () => {
    const plan = computeLayout(
      base({
        surface: { width: 1130, height: 870 },
        tile: { width: 125, height: 125 },
        layout: { origin: 'center', rowOffset: 0.3333 },
      }),
    )
    const thin = plan.pieces.filter((p) => p.kind !== 'full' && Math.min(p.width, p.height) < THIN_CUT_MM)
    expect(thin.length).toBeGreaterThan(1)
    const notes = plan.warnings.filter((w) => w.code === 'thin-cut')
    expect(notes).toHaveLength(1)
    // It says how many pieces it covers, and still names one so the UI can highlight it.
    expect(notes[0].message).toContain(`${thin.length} cuts`)
    expect(thin.map((p) => p.id)).toContain(notes[0].pieceId)
  })
})

describe('tilePresets', () => {
  it('recommends a square tile when the surface divides into one', () => {
    const { recommended, square } = tilePresets({ width: 1200, height: 600 }, 0)
    expect(recommended).toMatchObject({ width: 150, height: 150, columns: 8, rows: 4, exact: true, cuts: 0 })
    // The recommendation is already the familiar square, so there is no second preset to offer.
    expect(square).toBeNull()
  })

  it('recommends a near-square rectangle when no square divides the surface', () => {
    const { recommended, square } = tilePresets({ width: 1210, height: 610 }, 0)
    expect(recommended?.exact).toBe(true)
    expect(recommended?.cuts).toBe(0)
    const aspect = Math.max(recommended!.width, recommended!.height) / Math.min(recommended!.width, recommended!.height)
    expect(aspect).toBeLessThan(1.3)
    // Both axes really are covered by whole tiles.
    expect(recommended!.columns * recommended!.width).toBeCloseTo(1210, 1)
    expect(recommended!.rows * recommended!.height).toBeCloseTo(610, 1)
    // The square alternative is a size people know, and it does cost cuts.
    expect(STANDARD_TILE_SIZES).toContain(square?.width)
    expect(square?.cuts).toBeGreaterThan(0)
  })

  it('never recommends a tile larger than the printer bed', () => {
    const bed = { name: 'Bambu Lab A1 mini', width: 180, depth: 180 }
    const { recommended, square } = tilePresets({ width: 2400, height: 1200 }, 0, { bed })
    expect(recommended!.width).toBeLessThanOrEqual(180)
    expect(recommended!.height).toBeLessThanOrEqual(180)
    expect(recommended!.exact).toBe(true)
    if (square) expect(square.width).toBeLessThanOrEqual(180)
  })

  it('accounts for the joint between tiles', () => {
    const { recommended } = tilePresets({ width: 606, height: 606 }, 2)
    expect(recommended!.exact).toBe(true)
    const span = recommended!.columns * recommended!.width + (recommended!.columns - 1) * 2
    expect(span).toBeCloseTo(606, 1)
  })

  it('finds an exact fit for awkward surfaces, and gives up only when the range makes it impossible', () => {
    // Any sensible wall divides into whole tiles somehow, which is the point of leading with this preset.
    expect(tilePresets({ width: 997, height: 991 }, 0).recommended?.exact).toBe(true)
    expect(tilePresets({ width: 1333, height: 762 }, 3).recommended?.exact).toBe(true)
    // Only an impossible range leaves nothing to offer: no tile of 400 mm fits a 300 mm wall.
    expect(tilePresets({ width: 300, height: 300 }, 0, { min: 400, max: 400 }).recommended).toBeNull()
  })
})

describe('recommendedTile', () => {
  const straight = { origin: 'corner', rowOffset: 0 } as const

  const layoutFor = (
    surface: { width: number; height: number },
    fit: { width: number; height: number },
    layout: LayoutInput['layout'] = straight,
  ) => computeLayout({ surface, tile: { width: fit.width, height: fit.height }, joint: 0, layout })

  it('never offers a size that the real layout would cut', () => {
    // Every wall the audit caught claiming "no cuts" and then cutting.
    const walls = [
      { width: 1130, height: 870 },
      { width: 1220, height: 910 },
      { width: 1000, height: 610 },
      { width: 2000, height: 2000 },
      { width: 997, height: 613 },
      { width: 1219, height: 914 },
    ]
    for (const surface of walls) {
      const fit = recommendedTile(surface, 0)
      expect(fit).not.toBeNull()
      const plan = layoutFor(surface, fit!)
      expect({ wall: surface, exact: plan.exact, cuts: plan.partialCount }).toEqual({
        wall: surface,
        exact: true,
        cuts: 0,
      })
    }
  })

  it('keeps the no-cuts promise across a sweep of walls', () => {
    let offered = 0
    for (let width = 200; width <= 3000; width += 130) {
      for (let height = 200; height <= 1500; height += 130) {
        const surface = { width, height }
        const fit = recommendedTile(surface, 0)
        if (!fit) continue
        offered++
        const plan = layoutFor(surface, fit)
        expect({ wall: surface, exact: plan.exact }).toEqual({ wall: surface, exact: true })
      }
    }
    // The preset is the one that leads the tile field, so it has to be there for nearly every wall.
    expect(offered).toBeGreaterThan(200)
  })

  it('counts against the design layout instead of assuming a corner grid', () => {
    const surface = { width: 1200, height: 600 }
    const centred = { origin: 'center', rowOffset: 0 } as const
    // 150 mm divides this wall, but a centred grid straddles the centre line with 8 columns.
    const fit = recommendedTile(surface, 0, { layout: centred })
    expect(fit).not.toBeNull()
    expect(layoutFor(surface, fit!, centred).exact).toBe(true)
    // The corner default still lands on the familiar square, so this is no regression there.
    expect(recommendedTile(surface, 0)).toMatchObject({ width: 150, height: 150, exact: true, cuts: 0 })
  })

  it('offers nothing when a running bond makes a cut-free wall impossible', () => {
    const bond = { origin: 'corner', rowOffset: 0.5 } as const
    expect(recommendedTile({ width: 1200, height: 600 }, 0, { layout: bond })).toBeNull()
    // A single row has nothing to shift against, so an exact fit is still real there.
    expect(recommendedTile({ width: 1200, height: 150 }, 0, { layout: bond })?.exact).toBe(true)
  })
})

describe('tilePresets under the design layout', () => {
  it('states consequences the chosen origin and bond actually produce', () => {
    const surface = { width: 1130, height: 870 }
    const layouts = [
      { origin: 'center', rowOffset: 0 },
      { origin: 'corner', rowOffset: 0.5 },
      { origin: 'balanced', rowOffset: 0.3333 },
    ] as const
    for (const layout of layouts) {
      const { square } = tilePresets(surface, 0, { layout })
      expect(square).not.toBeNull()
      const plan = computeLayout({
        surface,
        tile: { width: square!.width, height: square!.height },
        joint: 0,
        layout,
      })
      expect({
        cuts: square!.cuts,
        tiles: square!.tiles,
        whole: square!.whole,
        exact: square!.exact,
      }).toEqual({
        cuts: plan.partialCount,
        tiles: plan.placements.length,
        whole: plan.fullCount,
        exact: plan.exact,
      })
    }
  })

  it('still offers the familiar square when a bond leaves no exact fit to recommend', () => {
    const { recommended, square } = tilePresets({ width: 1200, height: 600 }, 0, {
      layout: { origin: 'corner', rowOffset: 0.5 },
    })
    expect(recommended).toBeNull()
    expect(square).not.toBeNull()
  })
})

describe('perfectFitSizes', () => {
  it('suggests sizes that divide the length exactly, closest first', () => {
    expect(perfectFitSizes(1000, 0, 150)).toEqual([142.9, 166.7, 125])
  })

  it('accounts for joints', () => {
    const [size] = perfectFitSizes(606, 2, 150)
    expect(size).toBe(150)
  })
})

describe('computeLayout with edges', () => {
  const ALL = { bottom: true, right: true, top: true, left: true }
  const NONE = { bottom: false, right: false, top: false, left: false }
  const wall = (over: Partial<LayoutInput> = {}): LayoutInput =>
    base({ surface: { width: 1200, height: 600 }, tile: { width: 150, height: 150 }, ...over })
  const profiled = (sides: Partial<typeof ALL>, band = 12): LayoutEdges => ({
    profiled: { ...NONE, ...sides },
    band,
    boundaryMatters: false,
    tabs: null,
  })
  const keyed: LayoutEdges = { profiled: null, band: 0, boundaryMatters: true, tabs: null }
  const summary = (plan: LayoutPlan) => plan.pieces.map((p) => [p.mark, p.id, p.label, p.count])
  const byId = (plan: LayoutPlan) => new Map(plan.pieces.map((p) => [p.id, p]))

  it('changes nothing when no edge changes a model', () => {
    const inputs = [
      base(),
      base({ surface: { width: 1000, height: 800 } }),
      base({ surface: { width: 1250, height: 640 }, tile: { width: 100, height: 100 }, layout: { origin: 'center', rowOffset: 0.3333 } }),
      base({ surface: { width: 900.5, height: 150 } }),
    ]
    const quiet: LayoutEdges[] = [
      { profiled: null, band: 0, boundaryMatters: false, tabs: null },
      { profiled: ALL, band: 0, boundaryMatters: false, tabs: null },
      { profiled: NONE, band: 20, boundaryMatters: false, tabs: null },
    ]
    for (const input of inputs) {
      const plain = computeLayout(input)
      for (const edges of quiet) expect(computeLayout({ ...input, edges })).toEqual(plain)
      for (const piece of plain.pieces) expect(piece.edges).toEqual({ boundary: 0, tabs: 0, profiled: {} })
    }
  })

  it('splits a wall profiled top and bottom into the interior, the top row and the bottom row', () => {
    const plan = computeLayout(wall({ edges: profiled({ top: true, bottom: true }) }))
    expect(summary(plan)).toEqual([
      ['A', 'full', 'Full tile', 16],
      ['B', 'full-eB0', 'Full tile, bottom border', 8],
      ['C', 'full-eT0', 'Full tile, top border', 8],
    ])
    expect(plan.pieces[1].edges).toEqual({ boundary: 0, tabs: 0, profiled: { bottom: 0 } })
    expect(plan.pieces[2].edges).toEqual({ boundary: 0, tabs: 0, profiled: { top: 0 } })
    // Every piece is still a whole tile: the edge makes models, not cuts.
    expect([plan.fullCount, plan.partialCount, plan.exact]).toEqual([32, 0, true])
    const ids = byId(plan)
    for (const pl of plan.placements) {
      const expected = pl.row === 0 ? 'full-eB0' : pl.row === plan.rows - 1 ? 'full-eT0' : 'full'
      expect(ids.get(pl.pieceId)?.id).toBe(expected)
    }
  })

  it('gives a wall profiled on every side nine classes, the interior first', () => {
    const plan = computeLayout(wall({ edges: profiled(ALL) }))
    expect(summary(plan)).toEqual([
      ['A', 'full', 'Full tile', 12],
      ['B', 'full-eB0', 'Full tile, bottom border', 6],
      ['C', 'full-eL0', 'Full tile, left border', 2],
      ['D', 'full-eR0', 'Full tile, right border', 2],
      ['E', 'full-eT0', 'Full tile, top border', 6],
      ['F', 'full-eB0L0', 'Full tile, bottom-left corner', 1],
      ['G', 'full-eB0R0', 'Full tile, bottom-right corner', 1],
      ['H', 'full-eT0L0', 'Full tile, top-left corner', 1],
      ['I', 'full-eR0T0', 'Full tile, top-right corner', 1],
    ])
    expect(plan.fullCount).toBe(32)
  })

  it('spills the profile across a narrow cut into the next column', () => {
    // 1210 mm: eight whole tiles and a 10 mm cut at the right, inside a 20 mm band.
    const plan = computeLayout(wall({ surface: { width: 1210, height: 600 }, edges: profiled({ left: true, right: true }, 20) }))
    expect(summary(plan)).toEqual([
      ['A', 'full', 'Full tile', 24],
      ['B', 'full-eL0', 'Full tile, left border', 4],
      ['C', 'full-eR10', 'Full tile, 10 mm from the right border', 4],
      ['D', 'p-0-0-10-150-eR0', 'Right edge, border', 4],
    ])
    const ids = byId(plan)
    for (const pl of plan.placements) {
      const piece = ids.get(pl.pieceId)!
      if (pl.x === 1050) expect(piece.edges.profiled).toEqual({ right: 10 })
      if (pl.x === 1200) expect(piece.edges.profiled).toEqual({ right: 0 })
      // Two tiles in, the band has run out.
      if (pl.x === 900) expect(piece.edges.profiled).toEqual({})
    }
  })

  it('spills the profile across a thin bottom row into the row above it', () => {
    // The corner grid reads from the top, so 610 mm leaves a 10 mm row at the bottom.
    const plan = computeLayout(wall({ surface: { width: 1200, height: 610 }, edges: profiled({ top: true, bottom: true }, 20) }))
    const rowOf = (row: number) => new Set(plan.placements.filter((p) => p.row === row).map((p) => p.pieceId))
    expect([...rowOf(0)]).toEqual(['p-0-140-150-150-eB0'])
    expect([...rowOf(1)]).toEqual(['full-eB10'])
    expect([...rowOf(2)]).toEqual(['full'])
    expect([...rowOf(4)]).toEqual(['full-eT0'])
    expect(byId(plan).get('full-eB10')?.label).toBe('Full tile, 10 mm from the bottom border')
    expect(byId(plan).get('p-0-140-150-150-eB0')?.label).toBe('Bottom edge, border')
  })

  it('tells the boundary pieces apart when keys make it matter', () => {
    const plan = computeLayout(base({ surface: { width: 1000, height: 700 }, edges: keyed }))
    expect(summary(plan)).toEqual([
      ['A', 'full', 'Full tile', 15],
      ['B', 'full-b8', 'Full tile, left border', 3],
      ['C', 'full-b4', 'Full tile, top border', 5],
      ['D', 'full-b12', 'Full tile, top-left corner', 1],
      ['E', 'p-0-50-150-150-b1', 'Bottom edge', 5],
      ['F', 'p-0-0-100-150-b2', 'Right edge', 3],
      ['G', 'p-0-50-150-150-b9', 'Bottom edge, bottom-left corner', 1],
      ['H', 'p-0-0-100-150-b6', 'Right edge, top-right corner', 1],
      ['I', 'p-0-50-100-150-b3', 'Bottom-right corner', 1],
    ])
    // Same counts as without keys, spread over more models.
    const plain = computeLayout(base({ surface: { width: 1000, height: 700 } }))
    expect([plan.fullCount, plan.partialCount, plan.exact]).toEqual([plain.fullCount, plain.partialCount, plain.exact])
    for (const piece of plan.pieces) expect(piece.edges.profiled).toEqual({})
  })

  it('reads the boundary from rows and columns, whatever the bond', () => {
    let seed = 3
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const origins = ['corner', 'center', 'balanced'] as const
    const offsets = [0, 0.5, 0.3333] as const
    for (let i = 0; i < 120; i++) {
      const input = base({
        surface: { width: 200 + Math.round(rand() * 2000), height: 150 + Math.round(rand() * 1200) },
        tile: { width: 40 + Math.round(rand() * 200), height: 40 + Math.round(rand() * 200) },
        joint: [0, 2][i % 2],
        layout: { origin: origins[i % 3], rowOffset: offsets[(i >> 2) % 3] },
        edges: keyed,
      })
      const plan = computeLayout(input)
      const ids = byId(plan)
      const lastRow = Math.max(...plan.placements.map((p) => p.row))
      const lastCol = new Map<number, number>()
      for (const p of plan.placements) lastCol.set(p.row, Math.max(lastCol.get(p.row) ?? 0, p.col))
      for (const p of plan.placements) {
        const expected = (p.row === 0 ? 1 : 0) | (p.col === lastCol.get(p.row) ? 2 : 0) | (p.row === lastRow ? 4 : 0) | (p.col === 0 ? 8 : 0)
        expect(ids.get(p.pieceId)!.edges.boundary).toBe(expected)
      }
      // The same pieces as without keys, only split further.
      const plain = computeLayout({ ...input, edges: undefined })
      expect(plan.placements.map((p) => [p.x, p.y])).toEqual(plain.placements.map((p) => [p.x, p.y]))
      expect([plan.fullCount, plan.partialCount, plan.exact]).toEqual([plain.fullCount, plain.partialCount, plain.exact])
    }
  })

  it('puts a running bond row end on the right border whether it is a cut or a whole tile', () => {
    const plan = computeLayout(
      base({
        surface: { width: 1250, height: 640 },
        tile: { width: 100, height: 100 },
        layout: { origin: 'corner', rowOffset: 0.5 },
        edges: { profiled: ALL, band: 12, boundaryMatters: true, tabs: null },
      }),
    )
    const ids = byId(plan)
    const rows = new Set(plan.placements.map((p) => p.row))
    for (const row of rows) {
      const inRow = plan.placements.filter((p) => p.row === row).sort((a, b) => a.x - b.x)
      const last = ids.get(inRow.at(-1)!.pieceId)!
      const first = ids.get(inRow[0].pieceId)!
      expect(last.edges.boundary & 2).toBe(2)
      expect(last.edges.profiled.right).toBe(0)
      expect(first.edges.profiled.left).toBe(0)
    }
    // Both kinds of row end exist in a half bond of 12.5 tiles.
    const ends = [...rows].map((row) => ids.get(plan.placements.filter((p) => p.row === row).at(-1)!.pieceId)!.kind)
    expect(new Set(ends)).toEqual(new Set(['full', 'edge', 'corner']))
    expect(plan.pieces[0]).toMatchObject({ id: 'full', mark: 'A', label: 'Full tile' })
  })

  it('treats the last tile before a dropped sliver as the row end, and measures from the tiles laid', () => {
    // 900.5 mm: six whole tiles and a 0.5 mm strip the joint absorbs.
    const input = base({ surface: { width: 900.5, height: 150 }, edges: { profiled: ALL, band: 12, boundaryMatters: true, tabs: null } })
    const plan = computeLayout(input)
    expect(plan.warnings.map((w) => w.code)).toContain('sliver-dropped')
    const last = plan.placements.find((p) => p.col === 5)!
    const piece = byId(plan).get(last.pieceId)!
    expect(piece.edges.boundary & 2).toBe(2)
    // The band starts at the last tile laid, not at the nominal wall: no floating 0.5 mm offset.
    expect(piece.edges.profiled.right).toBe(0)
  })

  it('tells a row end that stops short of the others how far the edge is', () => {
    // Half bond on 1000.5 mm: even rows end at 1000 (the 0.5 mm strip is dropped), odd rows at 1000.5.
    const plan = computeLayout(
      base({
        surface: { width: 1000.5, height: 300 },
        tile: { width: 100, height: 100 },
        layout: { origin: 'corner', rowOffset: 0.5 },
        edges: profiled({ right: true }, 12),
      }),
    )
    const ids = byId(plan)
    const endOf = (row: number) => ids.get(plan.placements.filter((p) => p.row === row).at(-1)!.pieceId)!
    expect(endOf(1).edges.profiled.right).toBe(0)
    const short = endOf(0).kind === 'full' ? endOf(0) : endOf(2)
    expect(short.edges.profiled.right).toBe(0.5)
    expect(short.label).toBe('Full tile, 0.5 mm from the right border')
  })

  it('counts every whole tile, whichever border version it is', () => {
    const plan = computeLayout(wall({ surface: { width: 1000, height: 700 }, edges: { profiled: ALL, band: 30, boundaryMatters: true, tabs: null } }))
    const whole = plan.pieces.filter((p) => p.kind === 'full')
    expect(whole.length).toBeGreaterThan(1)
    expect(plan.fullCount).toBe(whole.reduce((s, p) => s + p.count, 0))
    expect(plan.partialCount).toBe(plan.placements.length - plan.fullCount)
  })

  it('keeps ids and labels unique and every placement resolvable for many edged layouts', () => {
    let seed = 19
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const origins = ['corner', 'center', 'balanced'] as const
    const offsets = [0, 0.5, 0.3333] as const
    for (let i = 0; i < 150; i++) {
      const sides = { bottom: rand() < 0.7, right: rand() < 0.7, top: rand() < 0.7, left: rand() < 0.7 }
      const plan = computeLayout(
        base({
          surface: { width: 150 + Math.round(rand() * 1800), height: 100 + Math.round(rand() * 1200) },
          tile: { width: 30 + Math.round(rand() * 220), height: 30 + Math.round(rand() * 220) },
          joint: [0, 1.5, 3][i % 3],
          layout: { origin: origins[i % 3], rowOffset: offsets[(i >> 2) % 3] },
          edges: { profiled: sides, band: 2 + Math.round(rand() * 40), boundaryMatters: rand() < 0.5, tabs: null },
        }),
      )
      const ids = plan.pieces.map((p) => p.id)
      expect(new Set(ids).size).toBe(ids.length)
      const labels = plan.pieces.map((p) => p.label)
      expect(new Set(labels).size).toBe(labels.length)
      const known = new Set(ids)
      for (const p of plan.placements) expect(known.has(p.pieceId)).toBe(true)
      expect(plan.pieces.reduce((n, p) => n + p.count, 0)).toBe(plan.placements.length)
      for (const p of plan.pieces) {
        for (const d of Object.values(p.edges.profiled)) expect(d).toBeGreaterThanOrEqual(0)
        // An id without a suffix is a piece no edge shapes, and the other way round.
        expect(p.id === 'full' || /^p(-[\d.]+){4}$/.test(p.id)).toBe(!hasEdges(p.edges))
      }
      // The interior whole tile, when the wall has one, is still A.
      const interior = plan.pieces.find((p) => p.kind === 'full' && !hasEdges(p.edges))
      if (interior) expect(interior).toMatchObject({ id: 'full', mark: 'A' })
      // Built from its code point, so this file carries no em-dash of its own.
      expect(plan.pieces.map((p) => p.label).join(' ')).not.toContain(String.fromCharCode(0x2014))
    }
  })

  it('says how many models the border adds when there are many', () => {
    const plan = computeLayout(
      base({
        surface: { width: 1250, height: 640 },
        tile: { width: 100, height: 100 },
        layout: { origin: 'center', rowOffset: 0.3333 },
        edges: { profiled: ALL, band: 12, boundaryMatters: true, tabs: null },
      }),
    )
    const note = plan.warnings.find((w) => w.code === 'many-pieces')
    expect(note?.message).toMatch(new RegExp(`needs ${plan.pieces.length} different models, \\d+ of them border versions`))
    expect(note?.message).toContain('A straight grid or the corner origin needs fewer.')

    // Already a straight grid from the corner: the advice says where the models come from instead.
    const straight = computeLayout(
      base({ surface: { width: 1210, height: 610 }, tile: { width: 150, height: 150 }, edges: { profiled: ALL, band: 20, boundaryMatters: true, tabs: null } }),
    )
    const straightNote = straight.warnings.find((w) => w.code === 'many-pieces')
    expect(straight.pieces.length).toBeGreaterThan(12)
    expect(straightNote?.message).not.toContain('straight grid')
    expect(straightNote?.message).toContain('Each border piece is its own model')
  })
})

describe('computeLayout with tabs', () => {
  const tabbed = (over: Partial<DesignConfig> = {}): DesignConfig => ({ ...structuredClone(DEFAULT_CONFIG), lock: 'tabs', ...over })
  const summary = (plan: LayoutPlan) => plan.pieces.map((p) => [p.mark, p.id, p.label, p.count])
  const pieceOf = (plan: LayoutPlan, pieceId: string) => plan.pieces.find((p) => p.id === pieceId) as PieceSpec
  /** Where a back feature sits along its side, piece-local mm: the middle of its ring across the joint. */
  const alongOf = (feature: BackFeature): number => {
    const ring = feature.levels[0].ring
    const along: number[] = []
    for (let k = 1; k < ring.length; k += 2) along.push(ring[k])
    return Math.round(((Math.min(...along) + Math.max(...along)) / 2) * 100) / 100
  }
  /**
   * The invariant the whole feature rests on: every tab really stands opposite a socket at its own height.
   * Read off the fixings themselves, so the layout's mask is held to what the mesher is then handed.
   */
  const expectEveryTabMated = (config: DesignConfig, plan: LayoutPlan) => {
    for (let i = 0; i < plan.placements.length; i++) {
      const here = pieceOf(plan, plan.placements[i].pieceId)
      const next = plan.placements[i + 1]
      const beside = next && next.row === plan.placements[i].row ? pieceOf(plan, next.pieceId) : undefined
      const tabs = pieceTabs(config, here).map(alongOf)
      expect(hasSide(here.edges.tabs, 1), `${here.id} carries tabs`).toBe(tabs.length > 0)
      if (tabs.length === 0) continue
      expect(beside, `${here.id} has a tile to its right`).toBeDefined()
      const sockets = pieceSockets(config, beside as PieceSpec).map(alongOf)
      for (const at of tabs) expect(sockets, `${here.id} tab at ${at} into ${(beside as PieceSpec).id}`).toContain(at)
    }
  }

  it('splits a tabbed wall into the nine the keys need, and cuts no tab on the right column', () => {
    const config = tabbed()
    const plan = computeLayout(layoutInputOf(config))
    // The same nine boundary classes keys cost: the tab mask follows the right boundary bit, so it adds none.
    // The tile that carries a tab is the wall's ordinary tile, so it stays A and the piles read in order.
    expect(summary(plan)).toEqual([
      ['A', 'full-t2', 'Full tile', 12],
      ['B', 'full-b1-t2', 'Full tile, bottom border', 6],
      ['C', 'full-b8-t2', 'Full tile, left border', 2],
      ['D', 'full-b4-t2', 'Full tile, top border', 6],
      ['E', 'full-b2-t0', 'Full tile, right border', 2],
      ['F', 'full-b9-t2', 'Full tile, bottom-left corner', 1],
      ['G', 'full-b12-t2', 'Full tile, top-left corner', 1],
      ['H', 'full-b3-t0', 'Full tile, bottom-right corner', 1],
      ['I', 'full-b6-t0', 'Full tile, top-right corner', 1],
    ])
    expect(computeLayout(layoutInputOf(tabbed({ lock: 'keys' }))).pieces).toHaveLength(9)
    // The hand is the fixings' own: the layout may not import TAB_SIDE, so this holds its copy equal.
    expect(pieceOf(plan, 'full-t2').edges.tabs).toBe(sideBit(TAB_SIDE))
    // Nothing is cut on the wall's two vertical edges: no tab on the right column, no socket on the left.
    for (const id of ['full-b2-t0', 'full-b3-t0', 'full-b6-t0']) {
      expect(pieceTabs(config, pieceOf(plan, id)), id).toEqual([])
    }
    for (const id of ['full-b8-t2', 'full-b9-t2', 'full-b12-t2']) {
      expect(pieceSockets(config, pieceOf(plan, id)), id).toEqual([])
    }
    expect(pieceTabs(config, pieceOf(plan, 'full-t2'))).toHaveLength(2)
    expectEveryTabMated(config, plan)
  })

  it('leaves the whole tile before a cut too narrow for a socket without a tab, and labels it', () => {
    // 1205 mm of wall: the ninth column is a 5 mm cut, which prints but cannot hold a socket.
    const config = tabbed({ surface: { width: 1205, height: 600 } })
    const plan = computeLayout(layoutInputOf(config))
    const cut = plan.pieces.find((p) => p.width === 5) as PieceSpec
    expect(cut.edges.tabs).toBe(0)
    // The interior class splits in two: the tile before the cut is its own model, and says why.
    const noTab = pieceOf(plan, 'full-t0')
    expect(noTab.label).toBe('Full tile, no tab')
    expect(noTab.count).toBe(2)
    expect(pieceOf(plan, 'full-t2').label).toBe('Full tile')
    // Twelve models where keys need nine: the tab mask is the only thing telling the two piles apart.
    expect(plan.pieces).toHaveLength(12)
    expect(computeLayout(layoutInputOf(tabbed({ surface: { width: 1205, height: 600 }, lock: 'keys' }))).pieces).toHaveLength(9)
    // Only a piece with a tile to its right is ever called "no tab": the right column simply has none.
    expect(plan.pieces.filter((p) => p.label.includes('no tab')).map((p) => p.id)).toEqual(['full-t0', 'full-b1-t0', 'full-b4-t0'])
    expectEveryTabMated(config, plan)
  })

  it('reads the printed box against the bed, the tab included, and says so', () => {
    const bed = { name: 'Bambu Lab A1 mini', width: 180, depth: 180 }
    // 175 mm fits the bed; 175 plus the 8 mm tab does not.
    const tile = { width: 175, height: 175, thickness: 4 }
    const nominal = computeLayout(layoutInputOf(tabbed({ tile, lock: 'none' }), bed))
    expect(nominal.warnings.filter((w) => w.code === 'exceeds-bed')).toEqual([])
    const printed = computeLayout(layoutInputOf(tabbed({ tile }), bed))
    expect(printed.warnings.find((w) => w.code === 'exceeds-bed')?.message).toBe(
      'A 175 × 175 mm tile prints 183 mm wide with its tab, which does not fit the 180 × 180 mm bed of the Bambu Lab A1 mini.',
    )
    // Without tabs the note is the one it always was.
    const big = computeLayout(layoutInputOf(tabbed({ tile: { width: 300, height: 150, thickness: 4 }, lock: 'none' }), bed))
    expect(big.warnings.find((w) => w.code === 'exceeds-bed')?.message).toBe(
      'A 300 × 150 mm tile does not fit the 180 × 180 mm bed of the Bambu Lab A1 mini.',
    )
  })

  it('never offers a tile size whose printed box misses the bed', () => {
    const bed = { name: 'Bambu Lab A1 mini', width: 180, depth: 180 }
    const surface = { width: 1050, height: 700 }
    // 175 mm covers this wall exactly and fits the bed, so it is the offer until the tab is counted.
    expect(recommendedTile(surface, 0, { bed })?.width).toBe(175)
    const presets = tilePresets(surface, 0, { bed, grow: 8 })
    expect(presets.recommended?.width).not.toBe(175)
    for (const fit of [presets.recommended, presets.square]) {
      if (!fit) continue
      expect(fit.width + 8, `${fit.width} × ${fit.height} printed`).toBeLessThanOrEqual(bed.width)
    }
  })
})

describe('edge helpers', () => {
  it('lists the sides an edge shapes, in side order', () => {
    expect(edgeSides({ boundary: 0, tabs: 0, profiled: {} })).toEqual([])
    expect(edgeSides({ boundary: 8, tabs: 0, profiled: { top: 0 } })).toEqual([2, 3])
    expect(edgeSides({ boundary: 1, tabs: 0, profiled: { bottom: 4, right: 10 } })).toEqual([0, 1])
  })

  it('finds the whole tile the plan is read from', () => {
    const plain = computeLayout(base({ surface: { width: 1000, height: 800 } }))
    expect(basePiece(plain.pieces)?.id).toBe('full')
    const edged = computeLayout(base({ surface: { width: 1200, height: 600 }, edges: { profiled: null, band: 0, boundaryMatters: true, tabs: null } }))
    expect(basePiece(edged.pieces)?.id).toBe('full')
    // One row profiled top and bottom: every whole tile is a border version, and none is the base.
    const strip = computeLayout(
      base({
        surface: { width: 900, height: 150 },
        edges: { profiled: { bottom: true, right: true, top: true, left: true }, band: 12, boundaryMatters: false, tabs: null },
      }),
    )
    expect(strip.pieces.filter((p) => p.kind === 'full').length).toBeGreaterThan(1)
    expect(basePiece(strip.pieces)).toBeUndefined()
    // A lone whole model is the base whatever shapes it.
    const single = computeLayout(
      base({ surface: { width: 900, height: 150 }, edges: { profiled: { bottom: true, right: false, top: true, left: false }, band: 12, boundaryMatters: false, tabs: null } }),
    )
    expect(single.pieces).toHaveLength(1)
    expect(basePiece(single.pieces)?.label).toBe('Full tile, top and bottom borders')
  })
})
