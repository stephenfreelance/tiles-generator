import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import { computeLayout, layoutInputOf } from '@/core/layout'
import type { DesignConfig, ExportFormat, ExportQuality } from '@/core/types'
import { heavyDownloadFix } from './heavyDownload'
import { estimateDownloadBytes } from './sizes'

const config: DesignConfig = structuredClone(DEFAULT_CONFIG)
const plan = computeLayout(layoutInputOf(config))
const fixFor = (format: ExportFormat, quality: ExportQuality) =>
  heavyDownloadFix(format, quality, {
    chosen: estimateDownloadBytes(plan, config, format, quality),
    standardStl: estimateDownloadBytes(plan, config, 'stl', 'standard'),
  })

describe('heavyDownloadFix', () => {
  it('never offers standard STL to a design already on it', () => {
    expect(fixFor('stl', 'standard')).toBe('one-at-a-time')
    // Even when the estimates say otherwise: the switch would change nothing.
    expect(heavyDownloadFix('stl', 'standard', { chosen: 2, standardStl: 1 })).toBe('one-at-a-time')
  })

  it('offers standard STL when it makes the download lighter', () => {
    expect(fixFor('step', 'standard')).toBe('standard-stl')
    expect(fixFor('step', 'fine')).toBe('standard-stl')
    expect(fixFor('stl', 'fine')).toBe('standard-stl')
  })

  it('does not offer it when it would make the download heavier', () => {
    // Fastest is lighter than standard STL, even as STEP: switching would add bytes, not remove them.
    expect(fixFor('stl', 'draft')).toBe('one-at-a-time')
    expect(fixFor('step', 'draft')).toBe('one-at-a-time')
  })
})
