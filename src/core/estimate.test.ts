import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './config'
import { estimateFilament, INFILL_RANGE, PART_PRINT_SETTINGS, pieceMaterialMm3, PLA_DENSITY_G_PER_CM3, PRINT_SETTINGS } from './estimate'
import { accessoryParts } from './fixing/accessories'
import { buildClipMesh, clipSpec } from './fixing/mount'
import type { AccessorySpec } from './fixing/types'
import { meshVolume } from './geometry/meshChecks'
import { computeLayout, layoutInputOf } from './layout'
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

  it('packs a tabbed piece by its printed box, and everything else by the nominal tile', () => {
    // 120 mm tiles, four to a 256 mm plate. With the 8 mm tab the column of two is all that is left.
    const tile = { width: 120, height: 120, thickness: 4 }
    const surface = { width: 480, height: 360 }
    const plain = design({ tile, surface })
    const tabs = design({ tile, surface, lock: 'tabs' })
    const perPlate = (config: DesignConfig, id: string) =>
      estimateFilament(config, computeLayout(layoutInputOf(config)), {}).perPiece.find((p) => p.pieceId === id)?.perPlate
    expect(perPlate(plain, 'full')).toBe(4)
    expect(perPlate(tabs, 'full-t2')).toBe(2)
    // The right column carries no tab, so its own files still print four to a plate.
    expect(perPlate(tabs, 'full-b2-t0')).toBe(4)
    // The schedule and the weights are the tile's own: only the packing knows about the tab.
    const tabbed = estimateFilament(tabs, computeLayout(layoutInputOf(tabs)), {})
    const line = tabbed.perPiece.find((p) => p.pieceId === 'full-t2')!
    expect(line.volumeMm3).toBeCloseTo(120 * 120 * (tile.thickness + tabs.texture.depth / 2), 6)
    expect(line.gramsEach).toBeCloseTo(estimateFilament(plain, computeLayout(layoutInputOf(plain)), {}).perPiece[0].gramsEach, 6)
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

/** A small keyed wall on clips: 450 x 300 mm of 100 mm tiles on the 4 mm plate. */
const PARTS_CONFIG: DesignConfig = {
  ...design(),
  surface: { width: 450, height: 300 },
  tile: { width: 100, height: 100, thickness: 4 },
  layout: { origin: 'corner', rowOffset: 0 },
  lock: 'keys',
  mount: 'clips',
}

const part = (over: Partial<AccessorySpec> & Pick<AccessorySpec, 'id' | 'kind' | 'mark' | 'label' | 'group'>): AccessorySpec => ({
  count: 1,
  size: { x: 20, y: 10, z: 3 },
  printNote: 'Print flat.',
  shape: {},
  ...over,
})

/** Synthetic parts in accessoryParts order (fit test, clips, keys), so the weights are tested apart from the part builders. */
const PARTS: AccessorySpec[] = [
  part({ id: 'fit-coupon', kind: 'fit-test', mark: 'F1', label: 'Test coupon', group: 'fit-test', size: { x: 64, y: 23, z: 6.6 } }),
  part({ id: 'fit-clip', kind: 'clip', mark: 'F2', label: 'Test clip 1, snug', group: 'fit-test', size: { x: 48, y: 14.7, z: 2.8 } }),
  part({ id: 'fit-key', kind: 'key', mark: 'F3', label: 'Test key 1, snug', group: 'fit-test', size: { x: 16, y: 12, z: 1.4 } }),
  part({ id: 'clip-standard', kind: 'clip', mark: 'C1', label: 'Wall clip, standard fit', group: 'mount', count: 42, size: { x: 48, y: 14.54, z: 2.8 } }),
  part({ id: 'key-standard', kind: 'key', mark: 'K1', label: 'Key, 16 mm', group: 'join', count: 20, size: { x: 16, y: 12, z: 1.6 } }),
]

describe('estimateFilament with printed parts', () => {
  const plan = computeLayout(layoutInputOf(PARTS_CONFIG))
  const byId = (estimate: ReturnType<typeof estimateFilament>, id: string) => estimate.accessories.find((a) => a.accessoryId === id)!

  it('weighs every part at its own settings, as a line of its own', () => {
    const volumes = Object.fromEntries(PARTS.map((p) => [p.id, p.size.x * p.size.y * p.size.z * 0.5]))
    const estimate = estimateFilament(PARTS_CONFIG, plan, volumes, PARTS)
    expect(estimate.accessories.map((a) => a.mark)).toEqual(PARTS.map((p) => p.mark))
    // Keys and clips print solid: every mm³ is plastic.
    const key = byId(estimate, 'key-standard')
    expect(key).toMatchObject({ kind: 'key', group: 'join', count: 20, fromMesh: true })
    expect(key.settings.summary).toBe(PART_PRINT_SETTINGS.key.summary)
    expect(key.materialMm3).toBeCloseTo(key.volumeMm3, 9)
    expect(key.grams).toBeCloseTo(key.volumeMm3 * 20 * PLA_DENSITY_G_PER_CM3 / 1000, 9)
    const clip = byId(estimate, 'clip-standard')
    expect(clip).toMatchObject({ kind: 'clip', group: 'mount', count: 42 })
    expect(clip.materialMm3).toBeCloseTo(clip.volumeMm3, 9)
    // The coupon prints like a tile: lighter than solid.
    const coupon = byId(estimate, 'fit-coupon')
    expect(coupon.settings).toBe(PRINT_SETTINGS)
    expect(coupon.materialMm3).toBeLessThan(coupon.volumeMm3)
    expect(coupon.materialMm3).toBeCloseTo(pieceMaterialMm3(coupon.volumeMm3, 64, 23, PRINT_SETTINGS.infill), 9)
  })

  it('adds the parts to the totals, the spools and the plates, and keeps the tiles apart', () => {
    const tilesOnly = estimateFilament(PARTS_CONFIG, plan, {}, [])
    const estimate = estimateFilament(PARTS_CONFIG, plan, {}, PARTS)
    expect(estimate.tileGrams).toBeCloseTo(tilesOnly.totalGrams, 9)
    expect(estimate.accessoryGrams).toBeCloseTo(estimate.accessories.reduce((s, a) => s + a.grams, 0), 9)
    expect(estimate.accessoryGrams).toBeGreaterThan(0)
    expect(estimate.totalGrams).toBeCloseTo(estimate.tileGrams + estimate.accessoryGrams, 9)
    expect(estimate.totalGramsLow).toBeCloseTo(tilesOnly.totalGramsLow + estimate.accessoryGrams, 9)
    expect(estimate.totalGramsHigh).toBeCloseTo(tilesOnly.totalGramsHigh + estimate.accessoryGrams, 9)
    expect(estimate.spools).toBe(Math.ceil(estimate.totalGramsHigh / 1000))
    expect(estimate.totalPlates).toBe(tilesOnly.totalPlates + estimate.accessoryGroups.reduce((s, g) => s + g.plates, 0))
    // Until the meshes are measured the parts are an approximation too.
    expect(estimate.approximate).toBe(true)
    const measured = Object.fromEntries([...plan.pieces, ...PARTS].map((p) => [p.id, 1000]))
    expect(estimateFilament(PARTS_CONFIG, plan, measured, PARTS).approximate).toBe(false)
  })

  it('sums the parts per folder, fit test first, small parts sharing plates', () => {
    const estimate = estimateFilament(PARTS_CONFIG, plan, {}, PARTS)
    expect(estimate.accessoryGroups.map((g) => g.group)).toEqual(['fit-test', 'mount', 'join'])
    const join = estimate.accessoryGroups[2]
    expect(join.count).toBe(20)
    // Twenty 16 x 12 mm keys fit one 256 mm plate.
    expect(join.plates).toBe(1)
    const mount = estimate.accessoryGroups[1]
    const clip = byId(estimate, 'clip-standard')
    expect(clip.perPlate).toBeGreaterThan(1)
    expect(mount.plates).toBe(Math.ceil(42 / clip.perPlate))
    expect(mount.grams).toBeCloseTo(estimate.accessories.filter((a) => a.group === 'mount').reduce((s, a) => s + a.grams, 0), 9)
  })

  it('lays parts square to the bed, never corner to corner, and flags one that does not fit', () => {
    const mini = { ...PARTS_CONFIG, printerId: 'bambu-a1-mini' }
    const long = part({ id: 'long', kind: 'clip', mark: 'C1', label: 'Long part', group: 'mount', size: { x: 224.5, y: 19, z: 3 } })
    // 224.5 x 19 mm would only fit a 180 mm bed across its diagonal: it is not counted as fitting.
    const estimate = estimateFilament(mini, plan, {}, [long])
    expect(byId(estimate, 'long')).toMatchObject({ perPlate: 0, fitsBed: false })
    expect(estimate.fitsBed).toBe(false)
    const short = { ...long, id: 'short', size: { ...long.size, x: 170 } }
    // Cut to the 170 mm the plate leaves, several lie side by side.
    expect(byId(estimateFilament(mini, plan, {}, [short]), 'short')).toMatchObject({ perPlate: 7, fitsBed: true })
  })

  it('weighs every real part at the settings its print note quotes', () => {
    const config = design({ mount: 'clips', lock: 'keys' })
    const realPlan = computeLayout(layoutInputOf(config))
    // The whole catalogue, fit test included: what each kind weighs is asked here, whatever a screen hands in.
    const estimate = estimateFilament(config, realPlan, {}, accessoryParts(config, realPlan))
    expect(estimate.accessories.map((a) => a.kind)).toContain('clip')
    for (const spec of accessoryParts(config, realPlan)) {
      const line = byId(estimate, spec.id)
      expect(line.settings).toBe(PART_PRINT_SETTINGS[spec.kind])
      expect(spec.printNote, spec.id).toContain(`: ${line.settings.summary}.`)
      expect(line.fitsBed, spec.id).toBe(true)
    }
  })

  it("approximates a clip by its own share of its box until its mesh is measured", () => {
    for (const fit of ['snug', 'loose'] as const) {
      const spec = { ...clipSpec(fit), mark: 'C1', label: 'Wall clip', count: 1, group: 'mount' as const }
      const approx = byId(estimateFilament(PARTS_CONFIG, plan, {}, [spec]), spec.id).volumeMm3
      const real = meshVolume(buildClipMesh(spec))
      expect(Math.abs(approx - real) / real).toBeLessThan(0.05)
    }
  })

  it('has no part lines for a glued design without keys', () => {
    const estimate = estimateFilament(DEFAULT_CONFIG, planFor(DEFAULT_CONFIG), {})
    expect(estimate.accessories).toEqual([])
    expect(estimate.accessoryGroups).toEqual([])
    expect(estimate.accessoryGrams).toBe(0)
    expect(estimate.totalGrams).toBe(estimate.tileGrams)
  })

  it('counts a raised frame taller, and a dropping edge lower, until the meshes are measured', () => {
    const framed = design({
      surface: { width: 600, height: 450 },
      perimeter: { profile: 'frame', sides: { top: true, right: true, bottom: true, left: true }, width: 10, drop: 3, fade: 0, land: 'valleys' },
    })
    const framedPlan = computeLayout(layoutInputOf(framed))
    const pieces = estimateFilament(framed, framedPlan, {}, []).perPiece
    const slab = 150 * 150 * (framed.tile.thickness + framed.texture.depth / 2)
    const interior = pieces.find((p) => p.pieceId === 'full')!
    const corner = pieces.find((p) => p.pieceId !== 'full' && p.label.includes('corner'))!
    expect(interior.volumeMm3).toBeCloseTo(slab, 6)
    expect(corner.volumeMm3).toBeGreaterThan(slab)

    const chamfered = { ...framed, perimeter: { ...framed.perimeter, profile: 'chamfer' as const, width: 6, drop: 3 } }
    const chamferedPieces = estimateFilament(chamfered, computeLayout(layoutInputOf(chamfered)), {}, []).perPiece
    expect(chamferedPieces.find((p) => p.pieceId !== 'full')!.volumeMm3).toBeLessThan(slab)
  })

  it('never counts an edge that cuts the relief above the relief itself', () => {
    const base = design({ surface: { width: 600, height: 450 } })
    const slab = 150 * 150 * (base.tile.thickness + base.texture.depth / 2)
    const border = (land: 'cut' | 'peaks', drop: number) => {
      const config = {
        ...base,
        perimeter: { profile: 'chamfer' as const, sides: { top: true, right: true, bottom: true, left: true }, width: 6, drop, fade: 0, land },
      }
      const pieces = estimateFilament(config, computeLayout(layoutInputOf(config)), {}, []).perPiece
      return pieces.find((p) => p.pieceId !== 'full' && p.label.includes('corner'))!.volumeMm3
    }
    // A shallow drop from the peaks stays above the relief's middle: the peaks land counts filled
    // valleys, the cut at most the relief it trims.
    expect(border('peaks', 0.5)).toBeGreaterThan(slab)
    expect(border('cut', 0.5)).toBeLessThanOrEqual(slab + 1e-6)
    // A deep one drops below the middle, where the two read the same.
    expect(border('cut', 4)).toBeCloseTo(border('peaks', 4), 6)
    expect(border('cut', 4)).toBeLessThan(slab)
  })
})
