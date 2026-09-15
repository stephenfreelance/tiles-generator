import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import { computeLayout } from '@/core/layout'
import type { DesignConfig } from '@/core/types'
import { geometryKey } from './geometryKey'
import { previewPasses, SURFACE_TRIANGLE_BUDGET, TILE_TRIANGLE_BUDGET, topTriangles } from './previewLod'

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

  it('does not depend on the order of texture params', () => {
    const a = design()
    expect(geometryKey({ ...a, texture: { ...a.texture, params: { x: 1, y: 2 } } })).toBe(
      geometryKey({ ...a, texture: { ...a.texture, params: { y: 2, x: 1 } } }),
    )
  })
})
