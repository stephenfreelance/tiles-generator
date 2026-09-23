// What the fit test's own download weighs, and the one quality it is ever written at.
import type { AccessorySpec } from '@/core/fixing/types'
import type { DesignConfig, ExportFormat, ExportQuality, LayoutPlan } from '@/core/types'
import { estimateAccessoryBytes, estimateDownloadBytes, estimateUnpackedBytes } from '@/features/export/sizes'

/**
 * The fit test is always written at 'standard', and that is not a compromise: a coupon is meshed at
 * COUPON_CELL (0.4 mm, fixed inside buildCouponMesh, the same grid 'standard' asks for) and the clips and
 * keys are prisms and lofts, so the quality cannot reach a byte of this export. Pinning it makes the
 * estimate below exact.
 */
export const FIT_TEST_QUALITY: ExportQuality = 'standard'

/**
 * The zip the fit-test page offers, in bytes: its parts after deflate. The ratio is read off sizes.ts's own
 * pair (its unpacked figure over its zipped one) rather than restated here, so this page and the download
 * page can never quote two different measurements of the same deflate.
 */
export function estimateFitTestZipBytes(
  plan: LayoutPlan,
  config: DesignConfig,
  format: ExportFormat,
  parts: readonly AccessorySpec[],
): number {
  const unpacked = parts.reduce((sum, part) => sum + estimateAccessoryBytes(part, config, format, FIT_TEST_QUALITY), 0)
  const ratio =
    estimateUnpackedBytes(plan, config, format, FIT_TEST_QUALITY, []) /
    estimateDownloadBytes(plan, config, format, FIT_TEST_QUALITY, [])
  return unpacked / ratio
}
