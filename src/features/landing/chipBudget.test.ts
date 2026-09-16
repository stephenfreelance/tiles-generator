import { describe, expect, it } from 'vitest'
import { CHIP_SHADE_BUDGET_BYTES, reliefShadeBytes } from '@/core/textures/hillshade'
import { PAGE_SHADE_BUDGET_BYTES, PATTERN_CHIP_PX, PROOF_CHIP_PX, standingShadeBytes } from './chipBudget'

/** What the page stands on: 23 pattern samples, and four pieces shared by the corner detail and the kit. */
const PATTERNS = 23
const PIECES = 4

describe('chipBudget', () => {
  it('is the ledger useTextureChips already keeps, not a second one', () => {
    expect(PAGE_SHADE_BUDGET_BYTES).toBe(18_874_368)
    // The fraction lives beside the worker budget it is taken from, so neither side can drift.
    expect(PAGE_SHADE_BUDGET_BYTES).toBe(CHIP_SHADE_BUDGET_BYTES * 0.75)
  })

  it('fits the whole page in the ledger', () => {
    expect(standingShadeBytes(PATTERNS, PIECES)).toBe(17_670_144)
    expect(standingShadeBytes(PATTERNS, PIECES)).toBeLessThanOrEqual(PAGE_SHADE_BUDGET_BYTES)
  })

  it('leaves room for one more cut shade, so a new wall size does not evict the grid', () => {
    const headroom = PAGE_SHADE_BUDGET_BYTES - standingShadeBytes(PATTERNS, PIECES)
    expect(headroom).toBe(1_204_224)
    expect(headroom).toBeGreaterThanOrEqual(reliefShadeBytes(PROOF_CHIP_PX))
  })

  it('counts each set at its own size', () => {
    expect(reliefShadeBytes(PATTERN_CHIP_PX)).toBe(614_400)
    expect(reliefShadeBytes(PROOF_CHIP_PX)).toBe(884_736)
    expect(standingShadeBytes(1, 0)).toBe(reliefShadeBytes(PATTERN_CHIP_PX))
    expect(standingShadeBytes(0, 1)).toBe(reliefShadeBytes(PROOF_CHIP_PX))
    expect(standingShadeBytes(0, 0)).toBe(0)
  })

  it('would not fit at the sizes the page used to ask for', () => {
    // 23 x 176 px plus 4 x 320 px: 25.69 MiB against an 18 MiB ledger, which is why a color pick
    // re-shaded every chip instead of tinting it.
    const before = PATTERNS * reliefShadeBytes(176) + PIECES * reliefShadeBytes(320)
    expect(before).toBeGreaterThan(PAGE_SHADE_BUDGET_BYTES)
  })
})
