import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config'
import type { DesignConfig } from '../types'
import { FLAT_SLOPE, LAYER_MM, layerStats, STEP_LIMIT_MM } from './printability'
import { createHeightField, TEXTURES, textureById } from './registry'

const WINDOW = { x0: 0, y0: 0, width: 40, height: 40 }

describe('layerStats', () => {
  it('reads an exact flat as one clean skin', () => {
    const stats = layerStats(() => 1.4, WINDOW)
    expect(stats.flat).toBe(1)
    expect(stats.shallow).toBe(0)
    expect(stats.caps).toBe(0)
  })

  it('puts a gentle tilt in the stair-step zone and a steep one out of it', () => {
    // 5 degrees prints 2.3 mm treads at 0.2 mm layers; 20 degrees prints 0.55 mm ones.
    const gentle = layerStats((x) => x * Math.tan((5 * Math.PI) / 180), WINDOW)
    const steep = layerStats((x) => (x % 10) * Math.tan((20 * Math.PI) / 180), WINDOW)
    expect(gentle.shallow).toBeGreaterThan(0.99)
    expect(gentle.medianStepMm).toBeCloseTo(LAYER_MM / Math.tan((5 * Math.PI) / 180), 1)
    expect(steep.shallow).toBeLessThan(0.02)
    expect(steep.medianStepMm).toBeLessThan(STEP_LIMIT_MM)
  })

  it('finds the flat disc a low dome prints at its top, and none on a flat-faced button', () => {
    const r = 6
    const low = (x: number, y: number) => {
      const d = Math.hypot(x - 20, y - 20) / r
      return d >= 1 ? 0 : 2 * Math.sqrt(1 - d * d)
    }
    // Flat face out to 4 mm, then a 1 mm per mm flank: the face is a plateau the model asked for.
    const button = (x: number, y: number) => Math.max(0, Math.min(2, 2 - (Math.hypot(x - 20, y - 20) - 4)))
    expect(layerStats(low, WINDOW).caps).toBeGreaterThan(0)
    expect(layerStats(button, WINDOW).caps).toBe(0)
  })

  it('reads a small plateau as flat, though its top layer also takes in a band of its flank', () => {
    // A 1.5 mm square top on 17 degree sides: the top layer holds a third of a millimetre of flank all round.
    const stud = (x: number, y: number) => Math.max(0, Math.min(2, 2 - 0.3 * (Math.max(Math.abs(x - 20), Math.abs(y - 20)) - 0.75)))
    expect(layerStats(stud, WINDOW).caps).toBe(0)
  })

  it('counts the bottom of a shallow dish as a cap too', () => {
    const dish = (x: number, y: number) => Math.min(3, 3 * ((x - 20) ** 2 + (y - 20) ** 2) / 225)
    expect(layerStats(dish, WINDOW).caps).toBeGreaterThan(0)
    expect(FLAT_SLOPE).toBeLessThan(LAYER_MM / STEP_LIMIT_MM)
  })
})

/** Every texture at its own defaults, as a maker who picks it and prints it gets it. */
const atDefaults = (id: string): DesignConfig => {
  const def = TEXTURES.find((t) => t.id === id)
  if (!def) throw new Error(id)
  return { ...DEFAULT_CONFIG, texture: { ...DEFAULT_CONFIG.texture, id, depth: def.defaults.depth, scale: def.defaults.scale, params: {} } }
}

const middle = (config: DesignConfig) => ({ x0: config.tile.width / 2 - 22.5, y0: config.tile.height / 2 - 22.5, width: 45, height: 45 })

/**
 * Most of a relief is flat or steep. The textures that were not (fish scale printed 85% of itself as
 * wide treads, tumbling blocks all of itself) now sit at 12% at most, where a ridge has to round over.
 */
const SHALLOW_CEILING = 0.2
/** At the shallowest depth a texture offers, a quarter of its face at most: past that a print reads striped. */
const FLOOR_CEILING = 0.25
/**
 * Reliefs whose printed steps are the look itself. Real prints of T-10 read as a topographic map, the
 * reason makers pick it, so it keeps the long gentle slopes every other texture is held away from.
 */
const CONTOURS_BY_DESIGN: ReadonlySet<string> = new Set(['dune-wave'])

describe('a relief kept gentle on purpose', () => {
  it('says so, so nobody picks it expecting a smooth face', () => {
    for (const id of CONTOURS_BY_DESIGN) expect(textureById(id).blurb).toMatch(/contour lines/)
  })

  it('really does print as contour lines, or it would not need the exception', () => {
    for (const id of CONTOURS_BY_DESIGN) {
      const config = atDefaults(id)
      expect(layerStats(createHeightField(config), middle(config), { pitchMm: 0.2 }).shallow).toBeGreaterThan(SHALLOW_CEILING)
    }
  })
})

const HELD = TEXTURES.filter((def) => !CONTOURS_BY_DESIGN.has(def.id))

describe.each(HELD.map((def) => [def.mark, def.id] as const))('%s %s printed face up', (_mark, id) => {
  const config = atDefaults(id)
  const stats = layerStats(createHeightField(config), middle(config), { pitchMm: 0.2 })

  it('prints no curved top or bottom as a flat disc ringed by steps', () => {
    expect(stats.caps).toBe(0)
  })

  it('keeps its gentle slopes, which print as wide stripes, to a small share of its face', () => {
    expect(stats.shallow).toBeLessThan(SHALLOW_CEILING)
  })

  it('stops its depth range where its slopes would start to print as stripes', () => {
    // The studio's depth slider ends at the range, so its shallowest end is a setting a maker picks.
    const def = TEXTURES.find((t) => t.id === id) as (typeof TEXTURES)[number]
    const floor = { ...config, texture: { ...config.texture, depth: def.depthRange[0] } }
    expect(layerStats(createHeightField(floor), middle(floor), { pitchMm: 0.2 }).shallow).toBeLessThan(FLOOR_CEILING)
  })
})
