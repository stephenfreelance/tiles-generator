import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './config'
import { estimateFilament, INFILL_RANGE, pieceMaterialMm3, PLA_DENSITY_G_PER_CM3, PRINT_SETTINGS } from './estimate'
import { computeLayout } from './layout'
import type { DesignConfig } from './types'

const design = (over: Partial<DesignConfig> = {}): DesignConfig => ({ ...structuredClone(DEFAULT_CONFIG), ...over })

const planFor = (config: DesignConfig) =>
  computeLayout({ surface: config.surface, tile: config.tile, joint: config.joint, layout: config.layout })

describe('pieceMaterialMm3', () => {
  it('fills a plate the way a slicer does: skins, then walls around sparse infill', () => {
    // 150 x 150 x 5 mm: footprint 22 500 mm², 9 solid layers = 1.8 mm of skin (40 500 mm³),
    // 3.2 mm left, of which 3 walls take 600 x 1.26 = 756 mm² (2 419.2 mm³) and the rest is sparse.
    const volume = 150 * 150 * 5
    expect(pieceMaterialMm3(volume, 150, 150, 0.15)).toBeCloseTo(40500 + 2419.2 + 21744 * 3.2 * 0.15, 6)
    expect(pieceMaterialMm3(volume, 150, 150, 0.15)).toBeCloseTo(53356.32, 6)
  })

  it('rises with the infill density and reaches the solid volume at 100 %', () => {
    const volume = 150 * 150 * 5
    const densities = [0, 0.1, 0.15, 0.2, 0.4, 1]
    const material = densities.map((d) => pieceMaterialMm3(volume, 150, 150, d))
    for (let i = 1; i < material.length; i += 1) expect(material[i]).toBeGreaterThan(material[i - 1])
    expect(material.at(-1)).toBeCloseTo(volume, 6)
  })

  it('never reports more than a solid piece, nor less than the skins alone', () => {
    const skinMm = (PRINT_SETTINGS.bottomLayers + PRINT_SETTINGS.topLayers) * PRINT_SETTINGS.layerHeightMm
    for (const [width, height] of [
      [150, 150],
      [42.5, 150],
      [300, 200],
      [20, 20],
    ]) {
      for (const heightMm of [1, 1.8, 3, 4, 6.6, 12]) {
        const volume = width * height * heightMm
        const material = pieceMaterialMm3(volume, width, height, 0.15)
        expect(material).toBeLessThanOrEqual(volume)
        expect(material).toBeGreaterThanOrEqual(width * height * Math.min(heightMm, skinMm) - 1e-6)
      }
    }
  })

  it('prints a piece no taller than its own skins solid', () => {
    const volume = 150 * 150 * 1.2
    expect(pieceMaterialMm3(volume, 150, 150, 0.15)).toBeCloseTo(volume, 6)
  })

  it('returns nothing for an empty piece', () => {
    expect(pieceMaterialMm3(0, 150, 150, 0.15)).toBe(0)
    expect(pieceMaterialMm3(1000, 0, 150, 0.15)).toBe(0)
  })
})

describe('estimateFilament', () => {
  const config = design({
    surface: { width: 900, height: 600 },
    layout: { origin: 'corner', rowOffset: 0 },
    color: '#2F3033',
    printerId: 'bambu-p1s',
  })
  const plan = planFor(config)

  it('weighs mesh volumes with the PLA density and the advised settings', () => {
    const volume = 150 * 150 * 5
    const estimate = estimateFilament(config, plan, { full: volume })
    const [full] = estimate.perPiece
    expect(full.count).toBe(24)
    expect(full.fromMesh).toBe(true)
    expect(full.materialMm3).toBeCloseTo(53356.32, 6)
    expect(full.gramsEach).toBeCloseTo(53356.32 * 0.00124, 6)
    expect(full.gramsEachLow).toBeCloseTo(pieceMaterialMm3(volume, 150, 150, INFILL_RANGE.low) * 0.00124, 6)
    expect(full.gramsEachHigh).toBeCloseTo(pieceMaterialMm3(volume, 150, 150, INFILL_RANGE.high) * 0.00124, 6)
    // 15 % sits halfway between the two ends, and the model is linear in the density.
    expect(full.gramsEach).toBeCloseTo((full.gramsEachLow + full.gramsEachHigh) / 2, 6)
    expect(full.effectiveFill).toBeCloseTo(53356.32 / volume, 6)
    expect(estimate.totalGrams).toBeCloseTo(full.gramsEach * 24, 6)
    expect(estimate.totalGramsLow).toBeCloseTo(full.gramsEachLow * 24, 6)
    expect(estimate.totalGramsHigh).toBeCloseTo(full.gramsEachHigh * 24, 6)
    expect(estimate.totalSolidGrams).toBeCloseTo(volume * 24 * 0.00124, 6)
    expect(estimate.spools).toBe(Math.ceil(estimate.totalGramsHigh / 1000))
    expect(estimate.approximate).toBe(false)
  })

  it('carries the settings the weight assumes', () => {
    const estimate = estimateFilament(config, plan, {})
    expect(estimate.settings.summary).toBe('0.2 mm layers, 3 walls, 15 % infill')
    expect(estimate.settings).toMatchObject({ layerHeightMm: 0.2, walls: 3, infill: 0.15 })
    expect(estimate.infillRange).toEqual({ low: 0.1, high: 0.2 })
    expect(estimate.fillFactor.low).toBeLessThan(estimate.effectiveFill)
    expect(estimate.fillFactor.high).toBeGreaterThan(estimate.effectiveFill)
  })

  it('reports a plausible weight for the default splashback', () => {
    // 1200 x 600 mm, 32 tiles of 150 mm on a 4 mm plate under 2.6 mm of relief. Printed solid that
    // is about 4.6 kg; at the advised settings a real print lands between 2 and 3 kg.
    const estimate = estimateFilament(DEFAULT_CONFIG, planFor(DEFAULT_CONFIG), {})
    expect(estimate.totalSolidGrams).toBeGreaterThan(4000)
    expect(estimate.effectiveFill).toBeGreaterThan(0.4)
    expect(estimate.effectiveFill).toBeLessThan(0.75)
    expect(estimate.totalGrams).toBeGreaterThan(1800)
    expect(estimate.totalGrams).toBeLessThan(3000)
    expect(estimate.spools).toBe(3)
  })

  it('uses a smaller share of the solid volume as the plate gets thicker', () => {
    const fillAt = (thickness: number) => {
      const thick = design({ tile: { ...DEFAULT_CONFIG.tile, thickness } })
      return estimateFilament(thick, planFor(thick), {}).effectiveFill
    }
    expect(fillAt(3)).toBeGreaterThan(fillAt(4))
    expect(fillAt(4)).toBeGreaterThan(fillAt(6))
    expect(fillAt(12)).toBeLessThan(0.4)
  })

  it('counts plates per piece for the chosen printer', () => {
    const p1s = estimateFilament(config, plan, {})
    expect(p1s.perPiece[0]).toMatchObject({ perPlate: 1, platesNeeded: 24, fitsBed: true })
    expect(p1s.totalPlates).toBe(24)
    expect(p1s.printerName).toContain('P1S')

    const h2d = estimateFilament({ ...config, printerId: 'bambu-h2d' }, plan, {})
    expect(h2d.perPiece[0]).toMatchObject({ perPlate: 4, platesNeeded: 6 })
  })

  it('flags pieces that do not fit the bed', () => {
    const big = design({
      surface: { width: 900, height: 600 },
      tile: { width: 300, height: 300, thickness: 4 },
      printerId: 'bambu-a1-mini',
    })
    const estimate = estimateFilament(big, planFor(big), {})
    expect(estimate.fitsBed).toBe(false)
    expect(estimate.perPiece[0]).toMatchObject({ perPlate: 0, platesNeeded: 0, fitsBed: false })
  })

  it('falls back to a slab volume until the meshes are measured', () => {
    const estimate = estimateFilament(config, plan, {})
    const expected = 150 * 150 * (config.tile.thickness + config.texture.depth / 2)
    expect(estimate.perPiece[0].volumeMm3).toBeCloseTo(expected, 6)
    expect(estimate.perPiece[0].fromMesh).toBe(false)
    expect(estimate.approximate).toBe(true)
  })

  it('uses the PLA density for any color and sums cut pieces', () => {
    const cut = design({ surface: { width: 1000, height: 800 }, layout: { origin: 'corner', rowOffset: 0 }, color: '#12AB34' })
    const cutPlan = planFor(cut)
    const volumes = Object.fromEntries(cutPlan.pieces.map((p) => [p.id, p.width * p.height * 5]))
    const estimate = estimateFilament(cut, cutPlan, volumes)
    expect(estimate.densityGPerCm3).toBe(PLA_DENSITY_G_PER_CM3)
    expect(PLA_DENSITY_G_PER_CM3).toBe(1.24)
    const expected = cutPlan.pieces.reduce(
      (sum, p) => sum + pieceMaterialMm3(p.width * p.height * 5, p.width, p.height, INFILL_RANGE.high) * p.count,
      0,
    )
    expect(estimate.totalGramsHigh).toBeCloseTo(expected * 0.00124, 4)
    expect(estimate.perPiece.map((p) => p.mark)).toEqual(cutPlan.pieces.map((p) => p.mark))
    // The color never moves the weight.
    expect(estimateFilament({ ...cut, color: '#F4F2EC' }, cutPlan, volumes).totalGrams).toBe(estimate.totalGrams)
  })
})
