// The showroom habit: print one small sample before committing forty plates.
import { normalizeConfig } from '@/core/config'
import { computeLayout } from '@/core/layout'
import type { DesignConfig, LayoutPlan } from '@/core/types'

export const SWATCH_MM = 60

/**
 * A single 60 x 60 mm tile carrying the same relief, depth and filament as the design.
 * The pattern repeats fewer times over a smaller tile, but every feature keeps its size in mm.
 */
export function testSwatch(config: DesignConfig): { config: DesignConfig; plan: LayoutPlan } {
  const swatch = normalizeConfig({
    ...config,
    name: `${config.name} test swatch`,
    surface: { width: SWATCH_MM, height: SWATCH_MM },
    tile: { ...config.tile, width: SWATCH_MM, height: SWATCH_MM },
    joint: 0,
    layout: { origin: 'corner', rowOffset: 0 },
  })
  const plan = computeLayout({
    surface: swatch.surface,
    tile: swatch.tile,
    joint: swatch.joint,
    layout: swatch.layout,
  })
  return { config: swatch, plan }
}
