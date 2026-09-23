import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { FIXED_CONFIG, FIXED_PARTS } from '@/core/export/testFixings'
import { accessoryParts, buildAccessoryMesh, wallParts } from '@/core/fixing/accessories'
import { computeLayout, layoutInputOf } from '@/core/layout'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { estimateAccessoryBytes, estimateDownloadBytes, estimateUnpackedBytes, LARGE_DOWNLOAD_BYTES } from './sizes'

// The figures below are anchored on files this app really wrote: a 1130 x 870 mm wall with a
// 150 mm tile, which lays out as four models. The zips that arrived were 16.7 MB (STL, standard)
// and 16.1 MB (STEP, standard); a STEP export at fine detail finished in seconds.

const MB = 1_000_000

const config: DesignConfig = normalizeConfig({
  ...DEFAULT_CONFIG,
  surface: { width: 1130, height: 870 },
  tile: { ...DEFAULT_CONFIG.tile, width: 150, height: 150 },
})

const plan: LayoutPlan = computeLayout({
  surface: config.surface,
  tile: config.tile,
  joint: config.joint,
  layout: config.layout,
})

describe('what the download will weigh', () => {
  it('lays out the four models the measurements were taken from', () => {
    expect(plan.pieces).toHaveLength(4)
  })

  it('predicts the STL zip that actually arrives', () => {
    const bytes = estimateDownloadBytes(plan, config, 'stl', 'standard')
    expect(bytes).toBeGreaterThan(12 * MB)
    expect(bytes).toBeLessThan(22 * MB) // 16.7 MB delivered
  })

  it('meshes STEP on its own coarser grid instead of the STL one', () => {
    const bytes = estimateDownloadBytes(plan, config, 'step', 'standard')
    expect(bytes).toBeGreaterThan(8 * MB)
    expect(bytes).toBeLessThan(32 * MB) // 16.1 MB delivered, once said to be 540 MB

    // Per triangle STEP costs about 14x an STL, but its grid is 3x coarser on each axis, so the
    // whole export stays the same order of size rather than an order above it.
    const step = estimateUnpackedBytes(plan, config, 'step', 'standard')
    const stl = estimateUnpackedBytes(plan, config, 'stl', 'standard')
    expect(step).toBeLessThan(2 * stl)
  })

  it('does not call a few seconds of STEP a download that takes minutes', () => {
    expect(estimateDownloadBytes(plan, config, 'step', 'fine')).toBeLessThan(LARGE_DOWNLOAD_BYTES)
    expect(estimateDownloadBytes(plan, config, 'step', 'draft')).toBeLessThan(LARGE_DOWNLOAD_BYTES)
  })

  it('still warns about a download that really is heavy', () => {
    const wide = normalizeConfig({ ...config, surface: { width: 4000, height: 2000 }, tile: { width: 400, height: 400 } })
    const widePlan = computeLayout({
      surface: wide.surface,
      tile: wide.tile,
      joint: 3,
      layout: { origin: 'center', rowOffset: 0.5 },
    })
    expect(estimateDownloadBytes(widePlan, wide, 'stl', 'fine')).toBeGreaterThan(LARGE_DOWNLOAD_BYTES)
  })

  it('quotes the zip, which is smaller than the files it holds', () => {
    for (const format of ['stl', 'step'] as const) {
      expect(estimateDownloadBytes(plan, config, format, 'standard')).toBeLessThan(
        estimateUnpackedBytes(plan, config, format, 'standard'),
      )
    }
  })

  it('grows with detail, for both formats', () => {
    for (const format of ['stl', 'step'] as const) {
      const draft = estimateDownloadBytes(plan, config, format, 'draft')
      const standard = estimateDownloadBytes(plan, config, format, 'standard')
      const fine = estimateDownloadBytes(plan, config, format, 'fine')
      expect(draft).toBeLessThan(standard)
      expect(standard).toBeLessThan(fine)
    }
  })
})

describe('what the printed parts add', () => {
  const fixedPlan = computeLayout(layoutInputOf(FIXED_CONFIG))
  const clip = FIXED_PARTS.find((p) => p.kind === 'clip' && p.group === 'mount')!
  const key = FIXED_PARTS.find((p) => p.kind === 'key' && p.group === 'join')!
  const coupon = FIXED_PARTS.find((p) => p.kind === 'fit-test')!

  it('adds nothing for a glued design without keys', () => {
    expect(accessoryParts(config, plan)).toEqual([])
    for (const format of ['stl', 'step'] as const) {
      expect(estimateUnpackedBytes(plan, config, format, 'standard')).toBe(estimateUnpackedBytes(plan, config, format, 'standard', []))
    }
  })

  it("counts the wall's parts by default, never the fit test the download does not hold", () => {
    for (const format of ['stl', 'step'] as const) {
      const byDefault = estimateUnpackedBytes(fixedPlan, FIXED_CONFIG, format, 'standard')
      expect(byDefault).toBe(estimateUnpackedBytes(fixedPlan, FIXED_CONFIG, format, 'standard', wallParts(FIXED_CONFIG, fixedPlan)))
      expect(byDefault).toBeLessThan(estimateUnpackedBytes(fixedPlan, FIXED_CONFIG, format, 'standard', FIXED_PARTS))
    }
  })

  it('adds every part, copies aside (one file each), and nothing else', () => {
    for (const format of ['stl', 'step'] as const) {
      const tiles = estimateUnpackedBytes(fixedPlan, FIXED_CONFIG, format, 'standard', [])
      const parts = FIXED_PARTS.reduce((sum, p) => sum + estimateAccessoryBytes(p, FIXED_CONFIG, format, 'standard'), 0)
      expect(estimateUnpackedBytes(fixedPlan, FIXED_CONFIG, format, 'standard', FIXED_PARTS) - tiles).toBeCloseTo(parts, 3)
      expect(estimateDownloadBytes(fixedPlan, FIXED_CONFIG, format, 'standard', FIXED_PARTS)).toBeGreaterThan(
        estimateDownloadBytes(fixedPlan, FIXED_CONFIG, format, 'standard', []),
      )
    }
  })

  it('weighs a clip or a key within a tenth of the STL its builder writes', () => {
    // Binary STL is exact arithmetic on the triangle count, so the real mesh is the measure.
    const stlBytes = (triangles: number) => 84 + 50 * triangles
    for (const spec of accessoryParts(FIXED_CONFIG, fixedPlan).filter((p) => p.kind !== 'fit-test')) {
      const real = stlBytes(buildAccessoryMesh(FIXED_CONFIG, spec).indices.length / 3)
      const estimate = estimateAccessoryBytes(spec, FIXED_CONFIG, 'stl', 'standard')
      expect(Math.abs(estimate - real) / real, spec.id).toBeLessThan(0.1)
    }
  })

  it('weighs a part at a few tens of kB, whatever the detail, and the fit-test coupon like a small tile', () => {
    const clipBytes = estimateAccessoryBytes(clip, FIXED_CONFIG, 'stl', 'standard')
    expect(clipBytes).toBeGreaterThan(20_000)
    expect(clipBytes).toBeLessThan(100_000)
    expect(estimateAccessoryBytes(key, FIXED_CONFIG, 'stl', 'standard')).toBeLessThan(clipBytes)
    // Parts are prisms: detail does not change them.
    expect(estimateAccessoryBytes(clip, FIXED_CONFIG, 'stl', 'fine')).toBe(clipBytes)
    // The coupon is meshed like a tile, so it follows the quality.
    const draft = estimateAccessoryBytes(coupon, FIXED_CONFIG, 'stl', 'draft')
    const fine = estimateAccessoryBytes(coupon, FIXED_CONFIG, 'stl', 'fine')
    expect(fine).toBeGreaterThan(draft)
    expect(draft).toBeGreaterThan(clipBytes)
  })
})
