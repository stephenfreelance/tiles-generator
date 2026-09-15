// The designs the front page draws with. Every one is a real config the studio could load.
import { COLOR_PRESETS } from '@/core/colors'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { computeLayout } from '@/core/layout'
import { textureById } from '@/core/textures/registry'
import type { DesignConfig, LayoutPlan } from '@/core/types'

export interface HeroSpecimen {
  textureId: string
  /** '#RRGGBB', always one of the studio's presets. */
  color: string
}

/** A preset's hex by name, so a renamed or retuned preset fails loudly here instead of drifting. */
function preset(name: string): string {
  const found = COLOR_PRESETS.find((entry) => entry.name === name)
  if (!found) throw new Error(`No color preset named ${name}`)
  return found.hex
}

/** Five pairings, cycled on the board: a relief and one of the studio's preset colors that suit each other. */
export const HERO_SPECIMENS: HeroSpecimen[] = [
  { textureId: 'zellige', color: preset('Terracotta') },
  { textureId: 'wavy', color: preset('Green') },
  { textureId: 'fluted', color: preset('Blue') },
  { textureId: 'fish-scale', color: preset('Charcoal') },
  { textureId: 'moroccan-star', color: preset('Orange') },
]

/** Six by four full tiles: no cuts on the board, and quick to mesh between specimens. */
export const HERO_BASE: DesignConfig = normalizeConfig({
  ...DEFAULT_CONFIG,
  name: 'Specimen wall',
  surface: { width: 900, height: 600 },
  surfaceUnit: 'mm',
  tile: { width: 150, height: 150, thickness: 4 },
  layout: { origin: 'corner', rowOffset: 0 },
})

/** A small wall that needs a right-hand cut, a top cut and a corner: four models, one pattern. */
export const CUT_DEMO: DesignConfig = normalizeConfig({
  ...DEFAULT_CONFIG,
  name: 'Cut demonstration',
  surface: { width: 380, height: 260 },
  surfaceUnit: 'mm',
  tile: { width: 150, height: 150, thickness: 4 },
  layout: { origin: 'corner', rowOffset: 0 },
  texture: { ...DEFAULT_CONFIG.texture, id: 'herringbone', depth: 2.2, scale: 26, params: {} },
  // Not a red-family color: the cut marks drawn over these pieces are red, and must stand apart.
  color: preset('Yellow'),
})

/** A kitchen-sized wall, used to show the file list the download hands over. */
export const WALL_DEMO: DesignConfig = normalizeConfig({
  ...DEFAULT_CONFIG,
  name: 'Feature wall',
  surface: { width: 1200, height: 800 },
  tile: { width: 150, height: 150, thickness: 4 },
  layout: { origin: 'balanced', rowOffset: 0 },
})

export function demoPlan(config: DesignConfig): LayoutPlan {
  return computeLayout({
    surface: config.surface,
    tile: config.tile,
    joint: config.joint,
    layout: config.layout,
  })
}

/** The hero design for one specimen: the board's sizes, the specimen's relief and color. */
export function heroConfig(specimen: HeroSpecimen): DesignConfig {
  const texture = textureById(specimen.textureId)
  return normalizeConfig({
    ...HERO_BASE,
    color: specimen.color,
    texture: {
      ...HERO_BASE.texture,
      id: texture.id,
      depth: texture.defaults.depth,
      scale: texture.defaults.scale,
      params: {},
    },
  })
}
