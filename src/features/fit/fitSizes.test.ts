import { describe, expect, it } from 'vitest'
import { FIXED_CONFIG, FIXED_FIT_PARTS, FIXED_PLAN } from '@/core/export/testFixings'
import type { ExportFormat } from '@/core/types'
import { estimateAccessoryBytes, estimateDownloadBytes, estimateUnpackedBytes } from '@/features/export/sizes'
import { estimateFitTestZipBytes, FIT_TEST_QUALITY } from './fitSizes'

/** The fit test's parts before deflate: the sum the download page would make of the same parts. */
const unpacked = (format: ExportFormat) =>
  FIXED_FIT_PARTS.reduce((sum, part) => sum + estimateAccessoryBytes(part, FIXED_CONFIG, format, FIT_TEST_QUALITY), 0)

/** The ratio sizes.ts measured, read the same way the helper reads it. */
const ratio = (format: ExportFormat) =>
  estimateUnpackedBytes(FIXED_PLAN, FIXED_CONFIG, format, FIT_TEST_QUALITY, []) /
  estimateDownloadBytes(FIXED_PLAN, FIXED_CONFIG, format, FIT_TEST_QUALITY, [])

describe('estimateFitTestZipBytes', () => {
  it("deflates the parts at sizes.ts's own measured ratio, for each format", () => {
    for (const format of ['stl', 'step'] as const) {
      expect(estimateFitTestZipBytes(FIXED_PLAN, FIXED_CONFIG, format, FIXED_FIT_PARTS)).toBeCloseTo(
        unpacked(format) / ratio(format),
        6,
      )
    }
    // STEP is the bigger file of the two, whatever the ratio does to it.
    expect(estimateFitTestZipBytes(FIXED_PLAN, FIXED_CONFIG, 'step', FIXED_FIT_PARTS)).toBeGreaterThan(
      estimateFitTestZipBytes(FIXED_PLAN, FIXED_CONFIG, 'stl', FIXED_FIT_PARTS),
    )
  })

  it('counts the parts and nothing else: no tile, no plan and no wall README', () => {
    const whole = estimateDownloadBytes(FIXED_PLAN, FIXED_CONFIG, 'stl', FIT_TEST_QUALITY, FIXED_FIT_PARTS)
    const test = estimateFitTestZipBytes(FIXED_PLAN, FIXED_CONFIG, 'stl', FIXED_FIT_PARTS)
    expect(test).toBeGreaterThan(0)
    // The whole download is this design's nine models and its documents on top of the very same parts.
    expect(test).toBeLessThan(whole / 10)
  })

  it('is nothing at all for a design with no fit test', () => {
    expect(estimateFitTestZipBytes(FIXED_PLAN, FIXED_CONFIG, 'stl', [])).toBe(0)
  })
})
