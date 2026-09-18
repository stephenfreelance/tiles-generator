// The one wall the front page draws with. The visitor sizes it in the hero, and every section below
// is a computeLayout result for that wall. Pure, so the page's rules are tested without a DOM.
import { COLOR_PRESETS, DEFAULT_COLOR, parseHex } from '@/core/colors'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { computeLayout } from '@/core/layout'
import { printerById } from '@/core/printers'
import { DEFAULT_TEXTURE_ID, textureById } from '@/core/textures/registry'
import type { DesignConfig, LayoutPlan } from '@/core/types'

/** What the visitor can change on the front page. Everything else comes from LANDING_BASE. */
export interface LandingDesign {
  widthMm: number
  heightMm: number
  textureId: string
  /** '#RRGGBB', uppercase. */
  color: string
  /** Set once the visitor nudged an exact fit, so "Back to an exact fit" can undo it. */
  nudgedMm: number
}

export type LandingEvent =
  | { type: 'wall'; widthMm?: number; heightMm?: number }
  | { type: 'example'; index: number }
  /** widthMm + 10, recorded so it can be taken back off. */
  | { type: 'nudge' }
  | { type: 'unnudge' }
  | { type: 'texture'; textureId: string }
  | { type: 'color'; hex: string }
  /** A hero key: its relief and its color together. */
  | { type: 'specimen'; index: number }

/** What the hero fields offer, mm. Tighter than LIMITS.surface: below 300 the board has nothing to lay. */
export const LANDING_WALL_LIMITS = { min: 300, max: 2500 } as const

/** One centimeter: the smallest change that turns an exact fit into a wall with cuts. */
const NUDGE_MM = 10

export interface LandingSpecimen {
  textureId: string
  /** '#RRGGBB', always one of the studio's presets. */
  color: string
}

export interface ExampleWall {
  label: string
  widthMm: number
  heightMm: number
}

/** A preset's hex by name, so a renamed or retuned preset fails loudly here instead of drifting. */
function preset(name: string): string {
  const found = COLOR_PRESETS.find((entry) => entry.name === name)
  if (!found) throw new Error(`No color preset named ${name}`)
  return found.hex
}

/**
 * The five keys under the board. Wavy in Green leads because it is the app's own default design, so
 * the poster is the first render and the accent never flashes green to terracotta at boot. Charcoal
 * is not offered: its accent stays #2F3033, which drags the primary action to near-black.
 */
export const LANDING_SPECIMENS: readonly LandingSpecimen[] = [
  { textureId: DEFAULT_TEXTURE_ID, color: preset('Green') },
  { textureId: 'zellige', color: preset('Terracotta') },
  { textureId: 'fluted', color: preset('Blue') },
  { textureId: 'fish-scale', color: preset('Teal') },
  { textureId: 'moroccan-star', color: preset('Orange') },
]

/**
 * The wall before the visitor touches it: 1,000 x 700 mm of 150 mm tiles read from the corner.
 * Seven columns by five rows, so 35 tiles, 24 whole and 11 cut, printed from four models, and its
 * 1.43 aspect nearly matches the board's 16/11 so the framing is tight and the joints read.
 */
export const LANDING_BASE: DesignConfig = normalizeConfig({
  ...DEFAULT_CONFIG,
  name: 'Your wall',
  surface: { width: 1000, height: 700 },
  surfaceUnit: 'cm',
  tile: { width: 150, height: 150, thickness: 4 },
  // No joint, as the studio defaults: the tiles butt and the bevel draws the line along each one. A
  // grout line would read better on the board, but it would also stop 240 x 120 dividing exactly, and
  // the exact-fit wall is what the nudge in section 2 is built on.
  joint: 0,
  // A wider chamfer than the studio's default 0.5 mm. Two tiles meet chamfer to chamfer, so this
  // opens a 2 mm valley along every joint: at the size the hero shows the wall that is the line that
  // makes 35 separate printed tiles read as 35 separate printed tiles rather than as one sheet. Not
  // wider: the key rakes this wall at 18 degrees, so the far wall of every horizontal valley is a
  // face the key cannot reach, and every millimetre of chamfer is another millimetre of it.
  bevel: 1,
  layout: { origin: 'corner', rowOffset: 0 },
  texture: { ...DEFAULT_CONFIG.texture, id: DEFAULT_TEXTURE_ID },
  color: DEFAULT_COLOR,
})

/**
 * One tap each. The first is the page's own starting wall; the third divides exactly, which is what
 * makes reaching the exact-fit state a choice the visitor makes rather than one imposed on them.
 */
export const EXAMPLE_WALLS: readonly ExampleWall[] = [
  { label: 'Splashback 100 × 70', widthMm: 1000, heightMm: 700 },
  { label: 'Niche 60 × 40', widthMm: 600, heightMm: 400 },
  { label: 'Feature wall 240 × 120', widthMm: 2400, heightMm: 1200 },
]

export const LANDING_DESIGN_START: LandingDesign = {
  widthMm: LANDING_BASE.surface.width,
  heightMm: LANDING_BASE.surface.height,
  textureId: LANDING_BASE.texture.id,
  color: LANDING_BASE.color,
  nudgedMm: 0,
}

/** A side of the wall in mm, clamped to what the fields offer; anything unusable leaves it alone. */
function wallSide(mm: number | undefined, current: number): number {
  if (typeof mm !== 'number' || !Number.isFinite(mm)) return current
  return Math.min(LANDING_WALL_LIMITS.max, Math.max(LANDING_WALL_LIMITS.min, mm))
}

const known = (index: number, length: number): boolean => Number.isInteger(index) && index >= 0 && index < length

/** Resizing is picking a new wall, so whatever was added to nudge the old one no longer applies. */
function sizedTo(state: LandingDesign, widthMm: number, heightMm: number): LandingDesign {
  const same = widthMm === state.widthMm && heightMm === state.heightMm && state.nudgedMm === 0
  return same ? state : { ...state, widthMm, heightMm, nudgedMm: 0 }
}

export function landingDesignStep(state: LandingDesign, event: LandingEvent): LandingDesign {
  switch (event.type) {
    case 'wall':
      return sizedTo(state, wallSide(event.widthMm, state.widthMm), wallSide(event.heightMm, state.heightMm))
    case 'example': {
      if (!known(event.index, EXAMPLE_WALLS.length)) return state
      const wall = EXAMPLE_WALLS[event.index]
      return sizedTo(state, wall.widthMm, wall.heightMm)
    }
    case 'nudge': {
      // The clamp can swallow the centimeter at the top of the range; record what it actually added.
      const widthMm = wallSide(state.widthMm + NUDGE_MM, state.widthMm)
      const added = widthMm - state.widthMm
      return added === 0 ? state : { ...state, widthMm, nudgedMm: state.nudgedMm + added }
    }
    case 'unnudge':
      return state.nudgedMm === 0
        ? state
        : { ...state, widthMm: wallSide(state.widthMm - state.nudgedMm, state.widthMm), nudgedMm: 0 }
    case 'texture': {
      // The registry answers its default for an id it does not know, which would silently swap the
      // relief under the visitor; an unknown id is a caller bug, so leave the board as it is.
      const real = textureById(event.textureId).id === event.textureId
      return real && event.textureId !== state.textureId ? { ...state, textureId: event.textureId } : state
    }
    case 'color': {
      const hex = parseHex(event.hex)
      return hex && hex !== state.color ? { ...state, color: hex } : state
    }
    case 'specimen': {
      if (!known(event.index, LANDING_SPECIMENS.length)) return state
      const { textureId, color } = LANDING_SPECIMENS[event.index]
      const same = textureId === state.textureId && color === state.color
      return same ? state : { ...state, textureId, color }
    }
  }
}

/** The design the whole page draws with: the base wall resized, wearing this relief and this color. */
export function landingConfig(state: LandingDesign): DesignConfig {
  const texture = textureById(state.textureId)
  return normalizeConfig({
    ...LANDING_BASE,
    surface: { width: state.widthMm, height: state.heightMm },
    color: state.color,
    // Picking a relief adopts its own recommended depth and scale, exactly as the studio does.
    texture: {
      ...LANDING_BASE.texture,
      id: texture.id,
      depth: texture.defaults.depth,
      scale: texture.defaults.scale,
      params: {},
    },
  })
}

/** The wall's layout, costed against the design's printer bed so the page fits what the studio says. */
export function landingPlan(config: DesignConfig): LayoutPlan {
  return computeLayout({
    surface: config.surface,
    tile: config.tile,
    joint: config.joint,
    layout: config.layout,
    bed: printerById(config.printerId),
  })
}
