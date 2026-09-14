import { DEFAULT_FILAMENT_ID, filamentById } from './filaments'
import { DEFAULT_PRINTER_ID, printerById } from './printers'
import type { DesignConfig, LayoutOrigin, LengthUnit, RowOffset } from './types'

/** Hard limits for every numeric input, mm. The UI shows them as hints; normalizeConfig enforces them. */
export const LIMITS = {
  surface: { min: 50, max: 20000 },
  tile: { min: 20, max: 400 },
  thickness: { min: 1.2, max: 12 },
  joint: { min: 0, max: 10 },
  bevel: { min: 0, max: 3 },
  depth: { min: 0, max: 8 },
  scale: { min: 2, max: 200 },
} as const

export const DEFAULT_CONFIG: DesignConfig = {
  version: 1,
  name: 'Kitchen splashback',
  surface: { width: 1200, height: 600 },
  surfaceUnit: 'cm',
  tile: { width: 150, height: 150, thickness: 4 },
  joint: 0,
  // Two chamfers meet at every closed joint, so the valley they open is twice this number. At 0.5 mm
  // that valley is 1 mm, the width the layout itself absorbs (SLIVER_MM), and the raking key light
  // still draws its line along each joint: the wall reads as a grid of touching tiles. At 1.2 mm the
  // same pair opened a 2.4 mm V, wider than the grout a tiler leaves, so a gap of 0 looked like a gap.
  bevel: 0.5,
  // Tiling starts at the top-left corner, the way a wall is read: the cuts land at the right and the
  // bottom. Centred and balanced layouts are a choice in the advanced settings, not the default.
  layout: { origin: 'corner', rowOffset: 0 },
  // Depth and scale are the default texture's OWN recommended values: picking a texture adopts its
  // defaults, so starting anywhere else would show the design as already modified before a first click.
  texture: { id: 'wavy', depth: 2.6, scale: 22, params: {}, seed: 1, invert: false, rotate: false },
  colorId: DEFAULT_FILAMENT_ID,
  printerId: DEFAULT_PRINTER_ID,
}

/** Base plate under the relief, mm. Three choices cover what a maker actually prints. */
export const THICKNESS_PRESETS: { label: string; value: number; hint: string }[] = [
  { label: 'Light', value: 3, hint: 'Uses the least filament' },
  { label: 'Standard', value: 4, hint: 'Stiff enough to glue flat' },
  { label: 'Sturdy', value: 6, hint: 'Takes a knock, weighs more' },
]

const clamp = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return Math.min(max, Math.max(min, n))
}

const ORIGINS: LayoutOrigin[] = ['corner', 'center', 'balanced']
const OFFSETS: RowOffset[] = [0, 0.5, 0.3333]
const UNITS: LengthUnit[] = ['mm', 'cm', 'm']

/**
 * Returns a complete, valid config from anything that looks like one (localStorage, URL, history).
 * Unknown texture ids are kept as-is here; the texture registry resolves them to its default.
 */
export function normalizeConfig(input: unknown): DesignConfig {
  const c = (input && typeof input === 'object' ? input : {}) as Partial<DesignConfig>
  const d = DEFAULT_CONFIG
  const tileW = clamp(c.tile?.width, LIMITS.tile.min, LIMITS.tile.max, d.tile.width)
  const tileH = clamp(c.tile?.height, LIMITS.tile.min, LIMITS.tile.max, d.tile.height)
  const params: Record<string, number> = {}
  for (const [k, v] of Object.entries(c.texture?.params ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v)) params[k] = v
  }
  return {
    version: 1,
    name: typeof c.name === 'string' && c.name.trim() ? c.name.slice(0, 80) : d.name,
    surface: {
      width: clamp(c.surface?.width, LIMITS.surface.min, LIMITS.surface.max, d.surface.width),
      height: clamp(c.surface?.height, LIMITS.surface.min, LIMITS.surface.max, d.surface.height),
    },
    surfaceUnit: UNITS.includes(c.surfaceUnit as LengthUnit) ? (c.surfaceUnit as LengthUnit) : d.surfaceUnit,
    tile: {
      width: tileW,
      height: tileH,
      thickness: clamp(c.tile?.thickness, LIMITS.thickness.min, LIMITS.thickness.max, d.tile.thickness),
    },
    joint: clamp(c.joint, LIMITS.joint.min, LIMITS.joint.max, d.joint),
    bevel: clamp(c.bevel, LIMITS.bevel.min, Math.min(LIMITS.bevel.max, Math.min(tileW, tileH) / 8), d.bevel),
    layout: {
      origin: ORIGINS.includes(c.layout?.origin as LayoutOrigin) ? (c.layout?.origin as LayoutOrigin) : d.layout.origin,
      rowOffset: OFFSETS.includes(c.layout?.rowOffset as RowOffset) ? (c.layout?.rowOffset as RowOffset) : d.layout.rowOffset,
    },
    texture: {
      id: typeof c.texture?.id === 'string' ? c.texture.id : d.texture.id,
      depth: clamp(c.texture?.depth, LIMITS.depth.min, LIMITS.depth.max, d.texture.depth),
      scale: clamp(c.texture?.scale, LIMITS.scale.min, LIMITS.scale.max, d.texture.scale),
      params,
      seed: Math.round(clamp(c.texture?.seed, 0, 999_999, d.texture.seed)),
      invert: typeof c.texture?.invert === 'boolean' ? c.texture.invert : d.texture.invert,
      rotate: typeof c.texture?.rotate === 'boolean' ? c.texture.rotate : d.texture.rotate,
    },
    colorId: filamentById(typeof c.colorId === 'string' ? c.colorId : d.colorId).id,
    printerId: printerById(typeof c.printerId === 'string' ? c.printerId : d.printerId).id,
  }
}

/** Structural equality for configs (they are plain JSON). */
export function sameConfig(a: DesignConfig, b: DesignConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
