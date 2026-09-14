// The designs the front page draws with. Every one is a real config the studio could load.
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { computeLayout } from '@/core/layout'
import { textureById } from '@/core/textures/registry'
import type { DesignConfig, LayoutPlan } from '@/core/types'

export interface HeroSpecimen {
  textureId: string
  colorId: string
}

/** Five pairings, cycled on the board: a relief and a filament that suit each other. */
export const HERO_SPECIMENS: HeroSpecimen[] = [
  { textureId: 'zellige', colorId: 'pla-matte-terracotta' },
  { textureId: 'wavy', colorId: 'pla-matte-bone-white' },
  { textureId: 'fluted', colorId: 'pla-basic-blue-grey' },
  { textureId: 'fish-scale', colorId: 'pla-matte-ice-blue' },
  { textureId: 'moroccan-star', colorId: 'pla-marble-white-marble' },
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
  colorId: 'pla-matte-latte-brown',
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

/** The hero design for one specimen: the board's sizes, the specimen's relief and filament. */
export function heroConfig(specimen: HeroSpecimen): DesignConfig {
  const texture = textureById(specimen.textureId)
  return normalizeConfig({
    ...HERO_BASE,
    colorId: specimen.colorId,
    texture: {
      ...HERO_BASE.texture,
      id: texture.id,
      depth: texture.defaults.depth,
      scale: texture.defaults.scale,
      params: {},
    },
  })
}
