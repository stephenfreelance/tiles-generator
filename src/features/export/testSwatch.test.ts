import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import { pieceFeatures } from '@/core/fixing/features'
import type { DesignConfig } from '@/core/types'
import { SWATCH_MM, testSwatch } from './testSwatch'

describe('testSwatch', () => {
  it('is one plain 60 mm tile of the design relief and color', () => {
    const { config, plan } = testSwatch(DEFAULT_CONFIG)
    expect(plan.pieces).toHaveLength(1)
    expect(plan.pieces[0]).toMatchObject({ id: 'full', width: SWATCH_MM, height: SWATCH_MM, count: 1 })
    expect(plan.pieces[0].edges).toEqual({ boundary: 0, tabs: 0, profiled: {} })
    expect(config.texture).toEqual(DEFAULT_CONFIG.texture)
    expect(config.color).toBe(DEFAULT_CONFIG.color)
  })

  it('never grows key slots, clip pockets or a border profile, whatever the design has on', () => {
    const fitted: DesignConfig = {
      ...structuredClone(DEFAULT_CONFIG),
      lock: 'keys',
      mount: 'clips',
      fit: 'loose',
      jointEdge: 'round',
      perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'frame', width: 10, drop: 2 },
    }
    const { config, plan } = testSwatch(fitted)
    expect(config).toMatchObject({ lock: 'none', mount: 'glue' })
    expect(config.perimeter.profile).toBe('none')
    // The edge between tiles is every tile's, so the swatch keeps it.
    expect(config.jointEdge).toBe('round')
    expect(plan.pieces[0].id).toBe('full')
    expect(pieceFeatures(config, plan.pieces[0])).toEqual([])
    // Not for want of room: with the design's own switches, the same 60 mm tile would take slots and a clip.
    const roles = new Set(pieceFeatures(fitted, plan.pieces[0]).map((feature) => feature.role))
    expect([...roles].sort()).toEqual(['clip-pocket', 'key-pocket'])
  })
})
