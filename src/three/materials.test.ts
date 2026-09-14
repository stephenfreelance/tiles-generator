import { describe, expect, it } from 'vitest'
import { FILAMENTS, type Finish } from '@/core/filaments'
import { finishRecipe } from './materials'

describe('finishRecipe', () => {
  it('gives every catalog filament physically sane parameters', () => {
    for (const filament of FILAMENTS) {
      for (const tier of [0, 2] as const) {
        const r = finishRecipe(filament, tier, 5)
        expect(r.roughness).toBeGreaterThan(0)
        expect(r.roughness).toBeLessThanOrEqual(1)
        expect(r.metalness).toBeGreaterThanOrEqual(0)
        expect(r.metalness).toBeLessThan(1)
        // Translucent filaments lighten the albedo on purpose (attenuation carries the tint).
        expect(Math.max(r.color.r, r.color.g, r.color.b)).toBeLessThan(r.transmission > 0 ? 0.97 : 0.9)
        expect(r.structureKey).toContain(filament.finish)
      }
    }
  })

  it('keeps the shader structure when only the colour changes inside a finish', () => {
    const byFinish = new Map<Finish, string>()
    for (const filament of FILAMENTS.filter((f) => f.line === 'PLA Matte')) {
      const key = finishRecipe(filament, 2, 5).structureKey
      const seen = byFinish.get(filament.finish)
      if (seen) expect(key).toBe(seen)
      else byFinish.set(filament.finish, key)
    }
  })

  it('drops the physical extras on the low tier', () => {
    const silk = FILAMENTS.find((f) => f.finish === 'silk')
    expect(silk).toBeDefined()
    if (!silk) return
    const high = finishRecipe(silk, 2, 5)
    const low = finishRecipe(silk, 0, 5)
    expect(high.anisotropy).toBeGreaterThan(0)
    expect(low.anisotropy).toBe(0)
    expect(low.physical).toBe(false)
  })
})
