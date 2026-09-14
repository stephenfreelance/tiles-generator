import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { computeLayout } from '@/core/layout'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { estimateDownloadBytes, estimateUnpackedBytes, LARGE_DOWNLOAD_BYTES } from './sizes'

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
