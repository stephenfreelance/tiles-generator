import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import { computeLayout, layoutInputOf } from '@/core/layout'
import type { DesignConfig } from '@/core/types'
import { geometryKey } from './geometryKey'
import { heroPiece, previewPasses, SURFACE_TRIANGLE_BUDGET, TILE_TRIANGLE_BUDGET, topTriangles } from './previewLod'

const design = (over: Partial<DesignConfig> = {}): DesignConfig => ({ ...structuredClone(DEFAULT_CONFIG), ...over })
const planFor = (config: DesignConfig) =>
  computeLayout({ surface: config.surface, tile: config.tile, joint: config.joint, layout: config.layout })

describe('previewPasses', () => {
  it('keeps the whole surface under the triangle budget with a normal map for detail', () => {
    const config = design({ surface: { width: 1200, height: 600 } })
    const plan = planFor(config)
    const passes = previewPasses(config, plan, 'surface')
    expect(passes).toHaveLength(2)
    const [coarse, final] = passes
    expect(coarse.cellMm).toBeGreaterThan(final.cellMm)
    expect(coarse.normalMapTexelMm).toBe(0)
    expect(final.pieces).toEqual(plan.pieces)
    expect(final.normalMapTexelMm).toBeCloseTo(150 / 512, 2)
    const byId = new Map(plan.pieces.map((p) => [p.id, p]))
    const triangles = plan.placements.reduce((s, pl) => {
      const piece = byId.get(pl.pieceId)!
      return s + topTriangles(piece.width, piece.height, final.cellMm)
    }, 0)
    expect(triangles).toBeLessThan(SURFACE_TRIANGLE_BUDGET * 1.1)
  })

  it('clamps the cell size on huge walls and skips the coarse pass', () => {
    const config = design({ surface: { width: 20000, height: 20000 } })
    const passes = previewPasses(config, planFor(config), 'surface')
    expect(passes).toHaveLength(1)
    expect(passes[0].cellMm).toBe(4)
  })

  it('builds only the hero piece, finely and without a normal map, in the tile view', () => {
    const config = design({ surface: { width: 1000, height: 800 }, layout: { origin: 'corner', rowOffset: 0 } })
    const passes = previewPasses(config, planFor(config), 'tile')
    const final = passes.at(-1)!
    expect(final.pieces.map((p) => p.id)).toEqual(['full'])
    expect(final.cellMm).toBe(0.25)
    expect(final.normalMapTexelMm).toBe(0)
    expect(topTriangles(150, 150, final.cellMm)).toBeLessThanOrEqual(TILE_TRIANGLE_BUDGET)

    const big = design({ tile: { width: 400, height: 400, thickness: 4 }, surface: { width: 1200, height: 800 } })
    const bigFinal = previewPasses(big, planFor(big), 'tile').at(-1)!
    expect(topTriangles(400, 400, bigFinal.cellMm)).toBeLessThanOrEqual(TILE_TRIANGLE_BUDGET * 1.01)
  })
})

describe('heroPiece', () => {
  it('shows the interior whole tile when keys or a border profile make versions of it', () => {
    const keyed = design({ surface: { width: 1000, height: 800 }, lock: 'keys' })
    const plan = computeLayout(layoutInputOf(keyed))
    expect(plan.pieces.filter((p) => p.kind === 'full').length).toBeGreaterThan(1)
    expect(heroPiece(plan)?.id).toBe('full')
    expect(previewPasses(keyed, plan, 'tile').at(-1)!.pieces.map((p) => p.id)).toEqual(['full'])
  })

  it('shows the whole tile laid most often when every one is a border version', () => {
    // Two rows profiled top and bottom: every whole tile touches a profiled edge.
    const strip = design({
      surface: { width: 1200, height: 300 },
      perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'chamfer', sides: { top: true, bottom: true, left: true, right: true } },
    })
    const plan = computeLayout(layoutInputOf(strip))
    const hero = heroPiece(plan)!
    expect(hero.kind).toBe('full')
    expect(hero.count).toBe(Math.max(...plan.pieces.filter((p) => p.kind === 'full').map((p) => p.count)))
  })

  it('falls back to the largest cut when no whole tile is laid', () => {
    const tiny = design({ surface: { width: 100, height: 120 } })
    const plan = planFor(tiny)
    expect(plan.fullCount).toBe(0)
    expect(heroPiece(plan)?.kind).not.toBe('full')
  })
})

describe('geometryKey', () => {
  it('ignores fields that do not shape the mesh', () => {
    const a = design()
    expect(geometryKey({ ...a, name: 'Other', color: '#D7263D', printerId: 'bambu-a1', surface: { width: 900, height: 900 } })).toBe(
      geometryKey(a),
    )
  })

  it('changes with the relief and the tile', () => {
    const a = design()
    expect(geometryKey({ ...a, texture: { ...a.texture, depth: 3 } })).not.toBe(geometryKey(a))
    expect(geometryKey({ ...a, texture: { ...a.texture, params: { amplitude: 2 } } })).not.toBe(geometryKey(a))
    expect(geometryKey({ ...a, tile: { ...a.tile, thickness: 5 } })).not.toBe(geometryKey(a))
    expect(geometryKey({ ...a, layout: { ...a.layout, rowOffset: 0.5 } })).not.toBe(geometryKey(a))
  })

  it('changes with the lock and the clips, reads the joint under either lock, and the fit only with tabs', () => {
    const a = design({ tile: { width: 150, height: 150, thickness: 4 } })
    const keyed = { ...a, lock: 'keys' as const }
    const tabbed = { ...a, lock: 'tabs' as const }
    const clipped = { ...a, mount: 'clips' as const }
    expect(new Set([a, keyed, tabbed, clipped].map(geometryKey)).size).toBe(4)
    // Keys space their notches by the pitch in a running bond and a tab reaches across the joint; the clip
    // pockets alone never look at it.
    expect(geometryKey({ ...keyed, joint: 3 })).not.toBe(geometryKey(keyed))
    expect(geometryKey({ ...tabbed, joint: 3 })).not.toBe(geometryKey(tabbed))
    expect(geometryKey({ ...clipped, joint: 3 })).toBe(geometryKey(clipped))
    expect(geometryKey({ ...a, joint: 3 })).toBe(geometryKey(a))
    // The printed keys and clips carry their clearance, so choosing a fit leaves every tile alone.
    expect(geometryKey({ ...keyed, mount: 'clips', fit: 'loose' })).toBe(geometryKey({ ...keyed, mount: 'clips', fit: 'snug' }))
    // A tab's socket is cut into the tile itself, so a new fit remakes every one of them.
    expect(geometryKey({ ...tabbed, fit: 'loose' })).not.toBe(geometryKey({ ...tabbed, fit: 'snug' }))
  })

  it('does not depend on the order of texture params', () => {
    const a = design()
    expect(geometryKey({ ...a, texture: { ...a.texture, params: { x: 1, y: 2 } } })).toBe(
      geometryKey({ ...a, texture: { ...a.texture, params: { y: 2, x: 1 } } }),
    )
  })
})
