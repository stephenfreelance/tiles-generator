import { DEFAULT_COLOR, parseHex } from './colors'
import { LEGACY_COLOR_HEX } from './legacyColors'
import { DEFAULT_PRINTER_ID, printerById } from './printers'
import { ALL_SIDES } from './sides'
import type {
  DesignConfig,
  FitClass,
  JointEdgeProfile,
  LayoutOrigin,
  LengthUnit,
  LockKind,
  MountKind,
  PerimeterProfile,
  PerimeterSettings,
  RowOffset,
  SurfaceSides,
} from './types'

/** Hard limits for every numeric input, mm. The UI shows them as hints; normalizeConfig enforces them. */
export const LIMITS = {
  surface: { min: 50, max: 20000 },
  tile: { min: 20, max: 400 },
  thickness: { min: 1.2, max: 12 },
  joint: { min: 0, max: 10 },
  bevel: { min: 0, max: 3 },
  depth: { min: 0, max: 8 },
  scale: { min: 2, max: 200 },
  /** Perimeter fade band, mm (0 means automatic). */
  fade: { min: 0, max: 30 },
} as const

/**
 * Each perimeter profile's own starting values and ranges, mm. Picking a profile adopts its defaults,
 * as picking a texture does. `drop` is the frame's height above the relief for 'frame', and unused
 * ('margin' is flat). The geometry narrows these further against the plate (see geometry/profiles.ts).
 * The profiles that drop to the rim start out trimming the relief ('cut'), so none fills a valley.
 */
export const PERIMETER_PROFILES: Record<
  Exclude<PerimeterProfile, 'none'>,
  { width: number; drop: number; land: PerimeterSettings['land']; widthRange: [number, number]; dropRange: [number, number] }
> = {
  margin: { width: 8, drop: 0, land: 'valleys', widthRange: [2, 30], dropRange: [0, 0] },
  // A cut's drop counts from the peaks: 3 mm reaches the valleys of the default 2.6 mm relief, even on the Light plate.
  chamfer: { width: 4, drop: 3, land: 'cut', widthRange: [1, 30], dropRange: [0.5, 8] },
  bullnose: { width: 4, drop: 4, land: 'cut', widthRange: [1, 30], dropRange: [0.5, 8] },
  ogee: { width: 10, drop: 3, land: 'cut', widthRange: [3, 30], dropRange: [0.5, 8] },
  frame: { width: 10, drop: 1, land: 'valleys', widthRange: [3, 30], dropRange: [0, 4] },
}

/** The profiles that drop to the rim: the only ones whose edge can trim the relief ('cut') instead of flattening it. */
export const cutsRelief = (profile: PerimeterProfile): boolean =>
  profile === 'chamfer' || profile === 'bullnose' || profile === 'ogee'

/** The perimeter as a new design has it: no profile, every side ready for one. */
export const DEFAULT_PERIMETER: PerimeterSettings = {
  profile: 'none',
  sides: { ...ALL_SIDES },
  width: PERIMETER_PROFILES.margin.width,
  drop: PERIMETER_PROFILES.margin.drop,
  fade: 0,
  land: 'valleys',
}

/** Thinnest base plate that can hold the pockets of keys and clips, mm (the Standard preset). */
export const MIN_FIXING_THICKNESS = 4

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
  jointEdge: 'chamfer',
  // Every addition below is off by default, so a new design is the plain glued wall it always was.
  perimeter: DEFAULT_PERIMETER,
  lock: 'none',
  mount: 'glue',
  fit: 'standard',
  // Tiling starts at the top-left corner, the way a wall is read: the cuts land at the right and the
  // bottom. Centred and balanced layouts are a choice in the advanced settings, not the default.
  layout: { origin: 'corner', rowOffset: 0 },
  // Depth and scale are the default texture's OWN recommended values: picking a texture adopts its
  // defaults, so starting anywhere else would show the design as already modified before a first click.
  texture: { id: 'wavy', depth: 2.6, scale: 22, params: {}, seed: 1, invert: false, rotate: false },
  color: DEFAULT_COLOR,
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
const JOINT_EDGES: JointEdgeProfile[] = ['square', 'chamfer', 'round', 'pillow']
const PERIMETERS: PerimeterProfile[] = ['none', 'margin', 'chamfer', 'bullnose', 'ogee', 'frame']
const LOCKS: LockKind[] = ['none', 'keys', 'tabs']
const MOUNTS: MountKind[] = ['glue', 'clips']
const FITS: FitClass[] = ['snug', 'standard', 'loose']
const oneOf = <T extends string>(value: unknown, options: T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback

/** The perimeter settings from anything that looks like them, clamped to the chosen profile's own ranges. */
function normalizePerimeter(input: unknown): PerimeterSettings {
  const p = (input && typeof input === 'object' ? input : {}) as Partial<PerimeterSettings>
  const d = DEFAULT_PERIMETER
  const profile = oneOf(p.profile, PERIMETERS, d.profile)
  const ranges = PERIMETER_PROFILES[profile === 'none' ? 'margin' : profile]
  const rawSides = (p.sides && typeof p.sides === 'object' ? p.sides : {}) as Partial<SurfaceSides>
  const side = (key: keyof SurfaceSides) => (typeof rawSides[key] === 'boolean' ? (rawSides[key] as boolean) : d.sides[key])
  return {
    profile,
    sides: { bottom: side('bottom'), right: side('right'), top: side('top'), left: side('left') },
    width: clamp(p.width, ranges.widthRange[0], ranges.widthRange[1], ranges.width),
    drop: clamp(p.drop, ranges.dropRange[0], ranges.dropRange[1], ranges.drop),
    fade: clamp(p.fade, LIMITS.fade.min, LIMITS.fade.max, d.fade),
    // A cut on a profile that cannot trim (or on none) falls back to that profile's own land.
    land: p.land === 'peaks' || p.land === 'valleys' || (p.land === 'cut' && cutsRelief(profile)) ? p.land : ranges.land,
  }
}

const OFFSETS: RowOffset[] = [0, 0.5, 0.3333]
const UNITS: LengthUnit[] = ['mm', 'cm', 'm']

/** The hex of a retired filament id, for designs and links saved before colors were plain hexes. */
function legacyColor(input: unknown): string | undefined {
  const id = input && typeof input === 'object' ? (input as { colorId?: unknown }).colorId : undefined
  return typeof id === 'string' && Object.hasOwn(LEGACY_COLOR_HEX, id) ? LEGACY_COLOR_HEX[id] : undefined
}

/** The keys switch of a design saved before the tabs: `joins: true` was Keys, `false` was Side by side. */
function legacyLock(input: unknown): LockKind | undefined {
  const joins = input && typeof input === 'object' ? (input as { joins?: unknown }).joins : undefined
  return typeof joins === 'boolean' ? (joins ? 'keys' : 'none') : undefined
}

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
    // A design saved before edge shapes existed with no softened edge was square, and still is.
    jointEdge: oneOf(c.jointEdge, JOINT_EDGES, c.jointEdge === undefined && c.bevel === 0 ? 'square' : d.jointEdge),
    perimeter: normalizePerimeter(c.perimeter),
    lock: oneOf(c.lock, LOCKS, legacyLock(input) ?? d.lock),
    mount: oneOf(c.mount, MOUNTS, d.mount),
    fit: oneOf(c.fit, FITS, d.fit),
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
    color: (typeof c.color === 'string' ? parseHex(c.color) : null) ?? legacyColor(input) ?? d.color,
    printerId: printerById(typeof c.printerId === 'string' ? c.printerId : d.printerId).id,
  }
}

/** Structural equality for configs (they are plain JSON). */
export function sameConfig(a: DesignConfig, b: DesignConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
