// One ledger for every chip the page holds at once. A shade is the color-independent part of a relief
// chip, so a color pick is a cheap tint only while the shades it needs are still in memory; past the
// ledger they are re-rendered from scratch. The two sizes below are what makes the whole page fit:
// 23 patterns and 4 pieces stand at 17,670,144 B against an 18,874,368 B budget.
import { reliefShadeBytes } from '@/core/textures/hillshade'

/** The 23 pattern samples: the largest size at which the whole grid still fits the ledger. */
export const PATTERN_CHIP_PX = 160

/** The corner detail and the kit. Both ask for this one number, so their four shades are one set, not two. */
export const PROOF_CHIP_PX = 192

// The number itself belongs to the ledger useTextureChips keeps, not to this page: passed through so
// the sizes above and the budget they answer to can never be sized against two different figures.
export { PAGE_SHADE_BUDGET_BYTES } from '@/core/textures/hillshade'

/** Shade memory the page stands on once every chip it shows has been rendered once. */
export function standingShadeBytes(patternCount: number, proofCount: number): number {
  return patternCount * reliefShadeBytes(PATTERN_CHIP_PX) + proofCount * reliefShadeBytes(PROOF_CHIP_PX)
}
