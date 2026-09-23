// The showroom habit: print one small sample before committing forty plates.
import { normalizeConfig } from '@/core/config'
import { computeLayout, layoutInputOf } from '@/core/layout'
import type { DesignConfig, LayoutPlan } from '@/core/types'

export const SWATCH_MM = 60

/**
 * A single 60 x 60 mm tile carrying the same relief, depth and color as the design.
 * The pattern repeats fewer times over a smaller tile, but every feature keeps its size in mm.
 * It is a plain tile: no key slots, no clip pockets, no border profile, so it never grows pockets or a rim
 * (the fit test is where those get tried).
 */
export function testSwatch(config: DesignConfig): { config: DesignConfig; plan: LayoutPlan } {
  const swatch = normalizeConfig({
    ...config,
    name: `${config.name} test swatch`,
    surface: { width: SWATCH_MM, height: SWATCH_MM },
    tile: { ...config.tile, width: SWATCH_MM, height: SWATCH_MM },
    joint: 0,
    perimeter: { ...config.perimeter, profile: 'none' },
    lock: 'none',
    mount: 'glue',
    layout: { origin: 'corner', rowOffset: 0 },
  })
  // One tile has every side on the wall's edge, so it is told nothing about edges: it is the interior tile.
  const plan = computeLayout({ ...layoutInputOf(swatch), edges: undefined })
  return { config: swatch, plan }
}
