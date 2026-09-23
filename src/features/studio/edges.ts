// Steps 6 and 7 in words: what each edge is called, what step 6's heading says, what the edges and the
// fixings cost in files and plate, and the fit of the printed parts. Pure, so every line the maker reads is
// tested without a DOM. Step 7's own well ("What changes") is worded in mountingCopy.ts.

import { cutsRelief, MIN_FIXING_THICKNESS, PERIMETER_PROFILES, THICKNESS_PRESETS } from '@/core/config'
import { resolvePerimeter } from '@/core/geometry/profiles'
import { computeLayout, layoutInputOf, type PrinterBed } from '@/core/layout'
import type {
  DesignConfig,
  FitClass,
  JointEdgeProfile,
  LockKind,
  MountKind,
  PerimeterProfile,
  PerimeterSettings,
  SideName,
  SurfaceSides,
} from '@/core/types'
import { formatLength, formatNumber } from '@/core/units'

export interface EdgeCopy {
  /** On the card. */
  name: string
  /** One sentence under the cards once it is chosen. */
  line: string
}

/** The profiles in the order the cards show them: from nothing, through the cut edges, to the one that adds. */
export const PERIMETER_ORDER: readonly PerimeterProfile[] = ['none', 'margin', 'chamfer', 'bullnose', 'ogee', 'frame']

export const PERIMETER_COPY: Record<PerimeterProfile, EdgeCopy & { heading: string }> = {
  none: {
    name: 'None',
    heading: '',
    line: 'The pattern runs right up to the edge of the wall.',
  },
  margin: {
    name: 'Flat margin',
    heading: 'Flat margin',
    line: 'The pattern fades into a smooth flat band, like a mat around a picture.',
  },
  chamfer: {
    name: 'Chamfer',
    heading: 'Chamfered edge',
    line: 'A straight bevel down to the wall: crisp and modern.',
  },
  bullnose: {
    name: 'Rounded',
    heading: 'Rounded edge',
    line: 'A bullnose: the edge rolls over into the wall, like classic rounded tile trim.',
  },
  ogee: {
    name: 'Ogee',
    heading: 'Ogee edge',
    line: 'An S-curve moulding ending in a small lip, like a stone worktop.',
  },
  frame: {
    name: 'Raised frame',
    heading: 'Raised frame',
    line: 'A flat border standing proud of the pattern, mitred at the corners.',
  },
}

export const JOINT_ORDER: readonly JointEdgeProfile[] = ['square', 'chamfer', 'round', 'pillow']

export const JOINT_COPY: Record<JointEdgeProfile, EdgeCopy> = {
  square: { name: 'Square', line: 'Sharp edges: with no gap the relief reads as one continuous surface.' },
  chamfer: {
    name: 'Chamfer',
    line: 'A small 45° cut on every joint: it catches the light and hides a slightly uneven wall.',
  },
  round: { name: 'Round', line: 'A soft rounded edge, like a cushion-edge porcelain tile.' },
  pillow: {
    name: 'Pillow',
    line: 'A wide gentle roll, four times as wide as it is deep: each tile reads as a soft cushion.',
  },
}

export const FIT_ORDER: readonly FitClass[] = ['snug', 'standard', 'loose']

export const FIT_NAMES: Record<FitClass, string> = { snug: 'Snug', standard: 'Standard', loose: 'Loose' }

/** Clockwise from the top, the order a maker reads the sides of a wall (and tabs through them). */
export const SIDE_ORDER: readonly SideName[] = ['top', 'right', 'bottom', 'left']

export const SIDE_LABELS: Record<SideName, string> = { top: 'Top', right: 'Right', bottom: 'Bottom', left: 'Left' }

const plural = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many)

const count = (value: number) => formatNumber(value, 0)

export const anySide = (sides: SurfaceSides): boolean => sides.top || sides.right || sides.bottom || sides.left

/** True when a profile actually changes the wall: one is chosen and at least one side carries it. */
export const hasPerimeter = (config: Pick<DesignConfig, 'perimeter'>): boolean =>
  config.perimeter.profile !== 'none' && anySide(config.perimeter.sides)

/**
 * What the border lid says on its face, so a folded panel can never hide a change: the profile's own
 * heading, "None" while there is none, and the one state hasPerimeter calls off, a profile on no side.
 */
export function borderBadge(config: Pick<DesignConfig, 'perimeter'>): string {
  const { profile, sides } = config.perimeter
  if (profile === 'none') return 'None'
  return anySide(sides) ? PERIMETER_COPY[profile].heading : 'No side ticked'
}

/** A joint edge of no size is square whatever its shape says, so the heading says what prints. */
export function jointHeading(config: Pick<DesignConfig, 'jointEdge' | 'bevel'>): string {
  const shape = config.bevel > 0 ? config.jointEdge : 'square'
  return `${JOINT_COPY[shape].name} joints`
}

/**
 * What step 6 says at the end of its heading: the look only, "Chamfer joints" or "Rounded edge · chamfer
 * joints". Both halves, because the border now folds away and the heading is where it shows at a glance.
 * How the wall goes up is step 7's to say.
 */
export function edgesNow(config: Pick<DesignConfig, 'perimeter' | 'jointEdge' | 'bevel'>): string {
  const joints = jointHeading(config)
  if (!hasPerimeter(config)) return joints
  return `${PERIMETER_COPY[config.perimeter.profile].heading} · ${joints.toLowerCase()}`
}

/** Picking a profile adopts its own width, drop and land, as picking a texture adopts its defaults. */
export function withPerimeterProfile(design: DesignConfig, profile: PerimeterProfile): DesignConfig {
  if (profile === 'none') return { ...design, perimeter: { ...design.perimeter, profile } }
  const defaults = PERIMETER_PROFILES[profile]
  return {
    ...design,
    perimeter: { ...design.perimeter, profile, width: defaults.width, drop: defaults.drop, land: defaults.land },
  }
}

export type PerimeterLand = PerimeterSettings['land']

/**
 * How the pattern meets the edge, as the control names and explains each way. Cut trims the relief with
 * the edge's own shape; the other two flatten it first into a band at one of its two levels.
 */
export const LAND_COPY: Record<PerimeterLand, EdgeCopy> = {
  cut: {
    name: 'Cut',
    line: 'The edge shape trims the pattern as it goes: every dip stays open right to the edge, and nothing is added.',
  },
  valleys: {
    name: 'Valleys',
    line: 'The pattern first flattens into a smooth band, level with its valleys. Suits bumps.',
  },
  peaks: {
    name: 'Peaks',
    line: 'The pattern first flattens into a smooth band, level with its peaks, so the dips near the edge fill in. Suits grooves and flutes.',
  },
}

/** The ways a profile can meet the pattern: only an edge that drops to the rim can trim it. */
export const landOrder = (profile: PerimeterProfile): readonly PerimeterLand[] =>
  cutsRelief(profile) ? ['cut', 'valleys', 'peaks'] : ['valleys', 'peaks']

/** The land the geometry prints: a cut on a profile that cannot trim reads as the valleys (resolvePerimeter). */
export const effectiveLand = (perimeter: Pick<PerimeterSettings, 'profile' | 'land'>): PerimeterLand =>
  perimeter.land === 'cut' && !cutsRelief(perimeter.profile) ? 'valleys' : perimeter.land

/**
 * What the Drop or Height slider measures. A cut and a band at the peaks both start the edge from the
 * tops of the pattern, so that is where the drop is measured from; a band at the valleys starts lower.
 */
export function dropHelp(perimeter: Pick<PerimeterSettings, 'profile' | 'land'>, depth: number): string {
  if (perimeter.profile === 'frame') return 'How far the frame stands above the tops of the pattern.'
  if (depth > 0 && effectiveLand(perimeter) !== 'valleys') {
    return 'How far the edge falls by the time it reaches the rim, measured down from the tops of the pattern.'
  }
  return 'How far the edge falls towards the wall by the time it reaches the rim.'
}

/**
 * The fade the geometry picks when the maker leaves it on automatic (resolvePerimeter): twice the relief depth,
 * kept between 3 and 16 mm, so a deep relief gets room to settle and a shallow one does not eat the tile.
 */
export const autoFade = (depth: number): number => Math.min(16, Math.max(3, 2 * depth))

/** What the automatic fade does for this relief, said truthfully at either end of its range. */
export function autoFadeText(depth: number): string {
  const fade = autoFade(depth)
  const why =
    fade > 2 * depth + 0.001 ? 'the shortest it goes' : fade < 2 * depth - 0.001 ? 'the longest it goes' : 'twice its depth'
  return `The pattern settles into a flat band over ${formatLength(fade)}, ${why}.`
}

/**
 * A profile length as the studio reports or offers it: floored to 0.1 mm, so it never promises more
 * than fits. The note and its fix both read it, and the tolerance is resolvePerimeter's own, so a room
 * of 4.8999999999999995 mm reads, and is offered, as the 4.9 mm the profile then takes whole.
 */
export const floorTenth = (mm: number): number => Math.floor((mm + 1e-6) * 10) / 10

/** floorTenth's mirror for a drop the studio asks for: rounded up to the slider's 0.1 mm, so it does reach. */
const ceilTenth = (mm: number): number => Math.ceil((mm - 1e-6) * 10) / 10

/**
 * Said under a cut's Drop slider while its edge stops above the valleys: a cut's drop counts from the peaks,
 * so one shorter than the relief leaves the valleys running out to the rim. It reads the drop the geometry
 * prints (a thin base lowers it) and names a drop only when the base really takes it. Null otherwise.
 */
export function cutDropNote(config: DesignConfig): string | null {
  const resolved = resolvePerimeter(config)
  const depth = config.texture.depth
  if (!resolved?.cut || !(depth > 0) || resolved.h >= depth - 1e-6) return null
  const reach = ceilTenth(depth)
  const reached = resolvePerimeter({ ...config, perimeter: { ...config.perimeter, drop: reach } })
  if (reached && reached.h >= depth - 1e-6) {
    return `At this drop the edge stops above the valleys of the pattern: a drop of ${formatLength(reach)} or more reaches them.`
  }
  return `The edge stops above the valleys of the pattern: a ${formatLength(config.tile.thickness)} base has no room for a drop that reaches them.`
}

/**
 * Tile models to print as designed, and with the edge profile off, the tile-to-tile lock off, or both.
 * Either one makes the edge tiles models of their own, so each line below reads its own cost off these
 * counts: neither a key slot nor a tab is ever cut on the boundary of the wall.
 */
export interface TileModels {
  now: number
  noProfile: number
  noLock: number
  neither: number
}

/** Lays the wall out once per variant the design has switched on: a choice that is off costs nothing. */
export function tileModels(config: DesignConfig, bed?: PrinterBed): TileModels {
  const models = (design: DesignConfig) => computeLayout(layoutInputOf(design, bed)).pieces.length
  const profiled = config.perimeter.profile !== 'none'
  const locked = config.lock !== 'none'
  const plain: DesignConfig = { ...config, perimeter: { ...config.perimeter, profile: 'none' } }
  const now = models(config)
  const noProfile = profiled ? models(plain) : now
  const noLock = locked ? models({ ...config, lock: 'none' }) : now
  const neither = profiled && locked ? models({ ...plain, lock: 'none' }) : profiled ? noProfile : noLock
  return { now, noProfile, noLock, neither }
}

const files = (n: number) => `${count(n)} ${plural(n, 'file')}`

/**
 * The profile and the lock split the very same edge tiles: each alone makes every model the pair does,
 * so neither line can say the jump is its own, and blaming the other on both sounds circular.
 */
const splitAlike = (models: TileModels): boolean =>
  models.now > models.neither && models.now === models.noProfile && models.now === models.noLock

/**
 * What one choice costs in files, given the other as it is: the models it adds, or, when the other
 * choice already split the edge tiles off, that it adds none, so a jump is never left unexplained.
 */
function filesCost(now: number, without: number, neither: number, otherAlready: string): string {
  if (now > without) return `Edge tiles become models of their own: ${files(without)} to print, now ${count(now)}.`
  if (now > neither) return `${otherAlready} the edge tiles models of their own: still ${files(now)} to print.`
  return `Still ${files(now)} to print.`
}

/**
 * The consequence of a profile, in files to print: border tiles become models of their own. When the lock
 * splits the same tiles, the lock's own line states the pair's cost, so this one only says the count.
 */
export function profileFilesLine(models: TileModels, config: Pick<DesignConfig, 'lock'>): string {
  if (splitAlike(models)) return `Edge tiles become models of their own: ${files(models.now)} to print.`
  return filesCost(models.now, models.noProfile, models.neither, `The ${lockWord(config)} already make`)
}

// Keys sit in slots, tabs in sockets and wall clips in pockets in the back, none of which a thin plate holds.

export const needsFixingPlate = (config: Pick<DesignConfig, 'lock' | 'mount'>): boolean =>
  config.lock !== 'none' || config.mount === 'clips'

/** "keys" or "tabs": the tile-to-tile lock, in the word step 7's own card gives it. */
const lockWord = (config: Pick<DesignConfig, 'lock'>): string => (config.lock === 'tabs' ? 'tabs' : 'keys')

/** "Keys", "Tabs", "Wall clips", "Tabs and wall clips": whichever of the two asks for the plate. */
function fixingsName(config: Pick<DesignConfig, 'lock' | 'mount'>): string {
  const lock = config.lock === 'tabs' ? 'Tabs' : 'Keys'
  if (config.lock !== 'none' && config.mount === 'clips') return `${lock} and wall clips`
  return config.lock !== 'none' ? lock : 'Wall clips'
}

function pocketsName(config: Pick<DesignConfig, 'lock' | 'mount'>): string {
  // A socket is cut into the same plate a key slot is, and needs it deeper still: hence the same floor.
  const recess = config.lock === 'tabs' ? 'the sockets' : 'the key slots'
  if (config.lock !== 'none' && config.mount === 'clips') return `${recess} and clip pockets`
  return config.lock !== 'none' ? recess : 'the clip pockets'
}

/** The words on a thickness card too thin for the fixings: "Wall clips need 4 mm". Null while none is on. */
export function fixingPlateReason(config: Pick<DesignConfig, 'lock' | 'mount'>): string | null {
  if (!needsFixingPlate(config)) return null
  return `${fixingsName(config)} need ${formatLength(MIN_FIXING_THICKNESS)}`
}

/** Why a typed thickness stops at the fixings' minimum, in the field's "Kept to 4 mm, ..." notice. */
export const fixingLimitReason = (config: Pick<DesignConfig, 'lock' | 'mount'>): string =>
  `${pocketsName(config)} need it`

/**
 * Applies a lock or wall clips choice. A plate too thin for their recesses moves up to the thinnest that
 * holds them inside the same edit, so one undo takes back both the choice and the thicker plate.
 */
export function withFixings(design: DesignConfig, patch: { lock?: LockKind; mount?: MountKind }): DesignConfig {
  const next = { ...design, ...patch }
  if (!needsFixingPlate(next) || next.tile.thickness >= MIN_FIXING_THICKNESS - 0.001) return next
  return { ...next, tile: { ...next.tile, thickness: MIN_FIXING_THICKNESS } }
}

/** Said once the plate has moved for the fixings, so the change to step 3 is never silent. */
export function plateRaisedNote(from: number, config: Pick<DesignConfig, 'lock' | 'mount'>): string {
  const preset = THICKNESS_PRESETS.find((candidate) => Math.abs(candidate.value - MIN_FIXING_THICKNESS) < 0.05)
  const mm = formatLength(MIN_FIXING_THICKNESS)
  const plate = preset ? `the ${preset.label} ${mm} plate` : mm
  return `Thickness moved from ${formatLength(from)} to ${plate}: ${pocketsName(config)} need it.`
}

/**
 * What carries the fit, as the download really holds it: keys switched on can still print none (a thin
 * base, a deep edge between tiles, no joint long enough), and wall clips none on tiles too small for a
 * pocket. The fit test's own keys and clips are not counted: they come with these. Nothing at all is
 * printed for a tab, so the tabs are not in the parts list and are read off the wall's own plan instead.
 */
export interface FittedParts {
  keys: boolean
  clips: boolean
  tabs: boolean
}

/** Reads what carries the fit off the design's printed parts, the tabs off whether the wall places any. */
export function fittedParts(parts: readonly { kind: string; group: string }[], tabs = false): FittedParts {
  const wall = parts.filter((p) => p.group !== 'fit-test')
  return { keys: wall.some((p) => p.kind === 'key'), clips: wall.some((p) => p.kind === 'clip'), tabs }
}

/** "keys and clips", "keys", "clips": the fitted parts a design prints. */
export const fittedName = (parts: FittedParts): string =>
  parts.keys && parts.clips ? 'keys and clips' : parts.keys ? 'keys' : 'clips'

/**
 * The Fit control's accessible name: "Fit of the printed keys", whichever parts it sets. A tab is printed
 * as part of its tile, so a tabbed wall's row is named after what the fit really shapes instead.
 */
export const fitLabel = (parts: FittedParts): string => {
  if (!parts.tabs) return `Fit of the printed ${fittedName(parts)}`
  return parts.clips ? 'Fit of the clips and the tabs' : 'Fit of the tabs and their sockets'
}

/**
 * The plate the last edit moved for the fixings, read off the undo history so that undo and redo bring
 * the note back with the change. Only an edit that turned a lock or wall clips on and moved nothing but it
 * and the plate counts: a design opened from a link or the shelf moved nothing. Null otherwise.
 */
export function plateRaisedFrom(previous: DesignConfig | undefined, config: DesignConfig): number | null {
  if (!previous || !needsFixingPlate(config)) return null
  if (previous.lock === config.lock && previous.mount === config.mount) return null
  if (previous.tile.thickness >= MIN_FIXING_THICKNESS - 0.001) return null
  if (Math.abs(config.tile.thickness - MIN_FIXING_THICKNESS) >= 0.05) return null
  const moved: DesignConfig = {
    ...previous,
    lock: config.lock,
    mount: config.mount,
    tile: { ...previous.tile, thickness: config.tile.thickness },
  }
  return JSON.stringify(moved) === JSON.stringify(config) ? previous.tile.thickness : null
}
