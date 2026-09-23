// Anonymous usage counts for GoatCounter (EU-hosted, cookie-free, keeps no IP address): which screens open,
// which actions run and, for a downloaded wall, its choices by category. Never a design's name, its
// measurements, its color value or its share link. This speaks GoatCounter's own /count protocol (the
// parameters count.js sends) instead of loading its script, so no third-party code runs on the page.
// Counting is off unless the build names a site (VITE_GOATCOUNTER, set by the Pages job only), on a local
// host, inside a frame, in a browser that asks not to be tracked, and in one switched off by #toggle-goatcounter.
import { presetByHex } from '@/core/colors'
import type { FixingSystem } from '@/core/fixing/guide'
import type { DesignConfig, ExportFormat, ExportQuality } from '@/core/types'
import { DESIGN_PARAM } from './designLink'

/** The router's screens, with the title each is listed under. Any other path is one "not found" page. */
const SCREENS: Record<string, string> = {
  '/': 'Home',
  '/studio': 'Studio',
  '/download': 'Download',
  '/fit-test': 'Fit test',
  '/history': 'Saved designs',
}
const NOT_FOUND = '/not-found'

/** Every fixed event, with the title GoatCounter lists it under. The names are the dashboard's rows. */
export const EVENTS = {
  'link-opened': 'Arrived on a shared design link',
  'home-start': 'Home: opened the wall sized there',
  'home-continue': 'Home: continued the saved design',
  'home-texture': 'Home: opened a relief in the studio',
  'home-sized': 'Home: changed the wall size',
  'studio-get-files': 'Studio: Get my files',
  'studio-view-tile': 'Studio: switched to the single tile',
  'copy-link': 'Copied a design link',
  'download-zip': 'Downloaded the zip',
  'download-piece': 'Downloaded one piece',
  'download-part': 'Downloaded one printed part',
  'download-test-tile': 'Downloaded the test tile',
  'download-plan': 'Downloaded the plan only',
  'download-cancelled': 'Cancelled a download',
  'download-failed': 'A download failed',
  'fit-test-zip': 'Downloaded the fit test',
  'fit-test-part': 'Downloaded one fit-test part',
  'history-open': 'Saved designs: opened one in the studio',
  'history-files': 'Saved designs: went to the files',
  'history-duplicate': 'Saved designs: duplicated one',
  'history-delete': 'Saved designs: deleted one',
  'history-clear': 'Saved designs: deleted them all',
  'error-screen': 'A screen failed to load',
  'error-webgl-unsupported': 'No WebGL: the 3D view stayed off',
  'error-webgl-crashed': 'The 3D view crashed',
} as const satisfies Record<string, string>
export type EventName = keyof typeof EVENTS

/** Events named after a choice, `<kind>-<value>`, each listed as "<title>: <value>". */
export const CHOICES = {
  'studio-edit': 'Studio: first change to',
  'fit-test-chose': 'Fit test: chose',
  'zip-format': 'Zip: format',
  'zip-quality': 'Zip: quality',
  'zip-texture': 'Zip: relief',
  'zip-color': 'Zip: color',
  'zip-fixing': 'Zip: fixings placed',
  'zip-edge': 'Zip: joint edge',
  'zip-border': 'Zip: border',
  'zip-printer': 'Zip: printer',
  'zip-tiles': 'Zip: tiles on the wall',
} as const satisfies Record<string, string>
export type ChoiceKind = keyof typeof CHOICES

/** One count, in GoatCounter's terms. */
export interface Hit {
  /** A screen's path, or an event's name (GoatCounter refuses an event that starts with "/"). */
  path: string
  title: string
  event: boolean
  referrer?: string
  /** Campaign parameters only, as "?ref=...". */
  query?: string
}

/** The /count endpoint for a GoatCounter site code, or a full https URL ending in /count (a counter of your own). */
export function endpointFrom(setting: string | undefined): string | null {
  const value = (setting ?? '').trim()
  if (/^[a-z0-9-]+$/i.test(value)) return `https://${value.toLowerCase()}.goatcounter.com/count`
  if (/^https:\/\/[^\s?#]+\/count$/.test(value)) return value
  return null
}

/** The screen a router path is counted as: a mistyped path is never sent as typed, whatever it holds. */
export function screenPath(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return Object.hasOwn(SCREENS, path) ? path : NOT_FOUND
}

/** The parameters GoatCounter reads a campaign from. Everything else stays behind, the design link above all. */
const CAMPAIGN_PARAMS = ['ref', 'src', 'utm_source', 'utm_medium', 'utm_campaign', 'campaign']
const CAMPAIGN_MAX = 100

export function campaignQuery(search: string): string {
  const params = new URLSearchParams(search)
  const kept = new URLSearchParams()
  for (const name of CAMPAIGN_PARAMS) {
    const value = params.get(name)
    if (value) kept.set(name, value.slice(0, CAMPAIGN_MAX))
  }
  const query = kept.toString()
  return query ? `?${query}` : ''
}

/** The URL of one count: path, referrer, title, event flag, screen width, bot flag, query and a cache nonce. */
export function countUrl(endpoint: string, hit: Hit, device: { width: number; bot: number }, nonce: string): string {
  const params = new URLSearchParams()
  params.set('p', hit.path)
  if (hit.referrer) params.set('r', hit.referrer)
  params.set('t', hit.title)
  if (hit.event) params.set('e', 'true')
  params.set('s', String(device.width))
  params.set('b', String(device.bot))
  if (hit.query) params.set('q', hit.query)
  params.set('rnd', nonce)
  return `${endpoint}?${params}`
}

/** A choice as it reads in an event name: lower case, words joined by hyphens. */
export function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'none'
  )
}

/**
 * What the maker changed, cause first: one control can move later fields along with it (a wall carries a
 * Recommended tile, a lock can raise the base), so the first area that differs is the one they touched.
 */
const EDIT_AREAS: readonly (readonly [area: string, read: (config: DesignConfig) => unknown])[] = [
  ['wall', (c) => [c.surface, c.surfaceUnit]],
  ['texture', (c) => c.texture.id],
  ['relief', (c) => c.texture],
  ['color', (c) => c.color],
  ['printer', (c) => c.printerId],
  ['edges', (c) => [c.bevel, c.jointEdge, c.perimeter]],
  ['lock', (c) => c.lock],
  ['mount', (c) => c.mount],
  ['fit', (c) => c.fit],
  ['layout', (c) => [c.joint, c.layout]],
  ['thickness', (c) => c.tile.thickness],
  ['tile-size', (c) => [c.tile.width, c.tile.height]],
]

export function editedArea(before: DesignConfig, after: DesignConfig): string | null {
  const found = EDIT_AREAS.find(([, read]) => JSON.stringify(read(before)) !== JSON.stringify(read(after)))
  return found ? found[0] : null
}

/** A tile count as a band: enough to tell a splashback from a feature wall, never the wall's size. */
export function tileBand(tiles: number): string {
  if (tiles < 10) return '1-9'
  if (tiles < 50) return '10-49'
  if (tiles < 100) return '50-99'
  if (tiles < 250) return '100-249'
  return '250-plus'
}

export interface ZipFacts {
  format: ExportFormat
  quality: ExportQuality
  /** What the plans place, never the switches (see guide.ts). */
  fixing: FixingSystem
  tiles: number
}

/** A downloaded wall by category: its relief, a preset's name or "custom", never the name, a size or a hex. */
export function zipChoices(config: DesignConfig, facts: ZipFacts): (readonly [ChoiceKind, string])[] {
  const bordered = config.perimeter.profile !== 'none' && Object.values(config.perimeter.sides).some(Boolean)
  return [
    ['zip-format', facts.format],
    ['zip-quality', facts.quality],
    ['zip-texture', config.texture.id],
    ['zip-color', presetByHex(config.color)?.name ?? 'custom'],
    ['zip-fixing', facts.fixing],
    ['zip-edge', config.jointEdge],
    ['zip-border', bordered ? config.perimeter.profile : 'none'],
    ['zip-printer', config.printerId],
    ['zip-tiles', tileBand(facts.tiles)],
  ]
}

// Everything below runs in the browser only; the pure helpers above are what the tests reach.

const ENDPOINT = endpointFrom(import.meta.env.VITE_GOATCOUNTER)
/** GoatCounter's own switch and the key its script keeps it under, so its documented toggle works here too. */
export const TOGGLE_HASH = '#toggle-goatcounter'
const SKIP_KEY = 'skipgc'
const LOCAL_HOST = /(localhost$|^127\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^192\.168\.|^0\.0\.0\.0$|^\[::1\]$)/

/** The address the visit arrived at, read at startup, before a design link is stripped from the bar. */
const arrival = ((): { search: string; referrer: string } | null => {
  try {
    return { search: window.location.search, referrer: document.referrer }
  } catch {
    // No page here: the tests, some with a stand-in window that has no address.
    return null
  }
})()

function skipped(): boolean {
  try {
    return window.localStorage.getItem(SKIP_KEY) === 't'
  } catch {
    return false
  }
}

function silenced(): boolean {
  const nav = navigator as Navigator & { doNotTrack?: string | null; globalPrivacyControl?: boolean }
  if (nav.doNotTrack === '1' || nav.globalPrivacyControl === true) return true
  if (LOCAL_HOST.test(window.location.hostname) || window.location.protocol === 'file:') return true
  if (window.top !== window.self) return true
  return skipped()
}

function send(hit: Hit): void {
  const endpoint = ENDPOINT
  if (!endpoint || typeof window === 'undefined' || silenced()) return
  const nonce = Math.random().toString(36).slice(2, 7)
  const url = countUrl(endpoint, hit, { width: window.screen.width, bot: navigator.webdriver ? 153 : 0 }, nonce)
  // No cookies, and a count that fails is nobody's business: it must never disturb the page.
  fetch(url, { mode: 'no-cors', credentials: 'omit', keepalive: true, cache: 'no-store' }).catch(() => undefined)
}

function externalReferrer(): string {
  const referrer = arrival?.referrer ?? ''
  try {
    return referrer && new URL(referrer).host !== window.location.host ? referrer : ''
  } catch {
    return ''
  }
}

let lastScreen: string | null = null
let arrived = false
const sentOnce = new Set<string>()

/** Counts a screen as it opens. A repeat of the same screen (the bar losing its design link) is not a new view. */
export function trackPageview(pathname: string): void {
  const path = screenPath(pathname)
  if (path === lastScreen) return
  lastScreen = path
  const first = !arrived
  arrived = true
  const referrer = first ? externalReferrer() : ''
  send({
    path,
    title: SCREENS[path] ?? 'Not found',
    event: false,
    referrer,
    query: first && arrival ? campaignQuery(arrival.search) : '',
  })
  // Only a link from outside counts: the home page's own invitations carry a design link too.
  const outside = referrer !== '' || !arrival?.referrer
  if (first && outside && arrival && new URLSearchParams(arrival.search).has(DESIGN_PARAM)) track('link-opened')
}

function countEvent(path: string, title: string, once: boolean): void {
  if (once) {
    if (sentOnce.has(path)) return
    sentOnce.add(path)
  }
  send({ path, title, event: true })
}

/** Counts an action. `once` counts it the first time in a visit only, for things done over and over. */
export function track(name: EventName, options?: { once?: boolean }): void {
  countEvent(name, EVENTS[name], options?.once ?? false)
}

export function trackChoice(kind: ChoiceKind, value: string, options?: { once?: boolean }): void {
  const choice = slug(value)
  countEvent(`${kind}-${choice}`, `${CHOICES[kind]}: ${choice}`, options?.once ?? false)
}

/** The first change to each area of the studio in a visit: which steps makers really use. */
export function trackEdit(before: DesignConfig, after: DesignConfig): void {
  const area = editedArea(before, after)
  if (area) trackChoice('studio-edit', area, { once: true })
}

export function trackZip(config: DesignConfig, facts: ZipFacts): void {
  track('download-zip')
  for (const [kind, value] of zipChoices(config, facts)) trackChoice(kind, value)
}

/** A failed or cancelled download, from either page that writes files. */
export function trackDownloadFailure(error: unknown): void {
  track(error instanceof Error && error.name === 'AbortError' ? 'download-cancelled' : 'download-failed')
}

let toggled = false

/** GoatCounter's documented switch: a page opened with #toggle-goatcounter stops (or restarts) counting this browser. */
export function toggleFromHash(): 'off' | 'on' | null {
  if (toggled || typeof window === 'undefined' || window.location.hash !== TOGGLE_HASH) return null
  toggled = true
  try {
    if (skipped()) {
      window.localStorage.removeItem(SKIP_KEY)
      return 'on'
    }
    window.localStorage.setItem(SKIP_KEY, 't')
    return 'off'
  } catch {
    return null
  }
}
