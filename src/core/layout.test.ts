import { describe, expect, it } from 'vitest'
import {
  axisStart,
  computeLayout,
  perfectFitSizes,
  recommendedTile,
  STANDARD_TILE_SIZES,
  THIN_CUT_MM,
  tilePresets,
  type LayoutInput,
} from './layout'

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
