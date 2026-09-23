// The slicer settings the app advises, for the tiles and for every printed part that is not a tile. One
// table, read by the weights (estimate.ts) and by each part's print note (core/fixing), so the advice a
// maker reads and the grams the page quotes cannot drift apart. Its own module because the fixings and
// the estimate import each other's neighbours: a table in either would close an import cycle.
import type { AccessoryKind } from './fixing/types'

/** Slicer settings a weight is quoted at. */
export interface PrintSettings {
  readonly layerHeightMm: number
  readonly walls: number
  /** Sparse infill density, 0 to 1. */
  readonly infill: number
  readonly wallLineWidthMm: number
  readonly bottomLayers: number
  readonly topLayers: number
  /** The settings as the pages say them, so the copy and the arithmetic cannot drift apart. */
  readonly summary: string
}

/** "0.2 mm layers, 3 walls, 15 % infill"; a solid part has no walls worth naming. */
export function settingsSummary(s: Omit<PrintSettings, 'summary'>): string {
  const infill = `${Math.round(s.infill * 100)} % infill`
  return s.infill >= 1 ? `${s.layerHeightMm} mm layers, ${infill}` : `${s.layerHeightMm} mm layers, ${s.walls} walls, ${infill}`
}

/**
 * What this app advises everywhere (the notes on the download page, the README in the zip) and what
 * every weight assumes. Nobody prints these tiles solid, so nothing here may be raised to make a number
 * look safer: buy the spools this describes and the print comes out.
 */
export const PRINT_SETTINGS = {
  layerHeightMm: 0.2,
  walls: 3,
  infill: 0.15,
  /** One wall line from a 0.4 mm nozzle. */
  wallLineWidthMm: 0.42,
  /** Solid layers under and over the piece: 0.8 mm down, 1.0 mm up, as slicers ship by default. */
  bottomLayers: 4,
  topLayers: 5,
  summary: '0.2 mm layers, 3 walls, 15 % infill',
} as const satisfies PrintSettings

const settings = (over: Partial<Omit<PrintSettings, 'summary'>>): PrintSettings => {
  const base = { ...PRINT_SETTINGS, ...over }
  return { ...base, summary: settingsSummary(base) }
}

/**
 * How the printed parts that are not tiles are advised to print, per kind, and what their weights assume.
 * Clips and keys carry the load and flex (a clip's tines are springs), so they print solid. The fit test's
 * coupon is a piece of tile, so it prints like the tiles, or it would not test their pockets (its clips and
 * keys keep their own kinds).
 */
export const PART_PRINT_SETTINGS: Record<AccessoryKind, PrintSettings> = {
  clip: settings({ infill: 1 }),
  key: settings({ infill: 1 }),
  'fit-test': PRINT_SETTINGS,
}

/** A part's one line of print advice: how it lies on the plate, then the settings its weight assumes. */
export function partPrintNote(kind: AccessoryKind, how: string): string {
  return `${how}: ${PART_PRINT_SETTINGS[kind].summary}.`
}

/**
 * The first layer spreads a little (elephant foot), and on a wall with keys or clips that bulge sits right
 * where two tiles meet at the back. Said the same way in the README and on the download page.
 */
export const ELEPHANT_FOOT_NOTE =
  "Turn on your slicer's elephant-foot compensation: the first layer's bulge can hold a 0 mm joint open at the back."
