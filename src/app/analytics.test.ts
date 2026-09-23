import { describe, expect, it } from 'vitest'
import { COLOR_PRESETS } from '@/core/colors'
import { DEFAULT_CONFIG } from '@/core/config'
import type { DesignConfig } from '@/core/types'
import {
  campaignQuery,
  CHOICES,
  countUrl,
  editedArea,
  endpointFrom,
  EVENTS,
  screenPath,
  slug,
  tileBand,
  zipChoices,
} from './analytics'
import { toSearch } from './designLink'

const ENDPOINT = 'https://tessera.goatcounter.com/count'
const DEVICE = { width: 1440, bot: 0 }

const custom: DesignConfig = {
  ...DEFAULT_CONFIG,
  name: 'Anna’s bathroom, 12 Rue Example',
  surface: { width: 2437, height: 1219 },
  color: '#123456',
}

describe('analytics', () => {
  it('reads a site code or a full endpoint, and nothing else', () => {
    expect(endpointFrom('tessera')).toBe(ENDPOINT)
    expect(endpointFrom('  Tessera ')).toBe(ENDPOINT)
    expect(endpointFrom('https://stats.example.org/count')).toBe('https://stats.example.org/count')
    expect(endpointFrom(undefined)).toBeNull()
    expect(endpointFrom('')).toBeNull()
    expect(endpointFrom('http://stats.example.org/count')).toBeNull()
    expect(endpointFrom('tessera.goatcounter.com')).toBeNull()
    expect(endpointFrom('https://stats.example.org/count?x=1')).toBeNull()
  })

  it('counts the router’s screens and folds every other path into one', () => {
    expect(screenPath('/')).toBe('/')
    expect(screenPath('/studio')).toBe('/studio')
    expect(screenPath('/studio/')).toBe('/studio')
    expect(screenPath('/fit-test')).toBe('/fit-test')
    expect(screenPath('/history')).toBe('/history')
    expect(screenPath('/download')).toBe('/download')
    expect(screenPath('/my-private-note')).toBe('/not-found')
    expect(screenPath('/constructor')).toBe('/not-found')
  })

  it('keeps the campaign parameters and never the design link', () => {
    const search = `?${toSearch(custom)}&utm_source=reddit&ref=hn&other=1`
    expect(campaignQuery(search)).toBe('?ref=hn&utm_source=reddit')
    expect(campaignQuery(`?${toSearch(custom)}`)).toBe('')
    expect(campaignQuery('')).toBe('')
    expect(campaignQuery(`?ref=${'x'.repeat(500)}`)).toBe(`?ref=${'x'.repeat(100)}`)
  })

  it('writes the parameters count.js sends', () => {
    const page = new URL(countUrl(ENDPOINT, { path: '/studio', title: 'Studio', event: false, referrer: 'https://news.ycombinator.com/', query: '?ref=hn' }, DEVICE, 'abcde'))
    expect(`${page.origin}${page.pathname}`).toBe(ENDPOINT)
    expect(Object.fromEntries(page.searchParams)).toEqual({
      p: '/studio',
      r: 'https://news.ycombinator.com/',
      t: 'Studio',
      s: '1440',
      b: '0',
      q: '?ref=hn',
      rnd: 'abcde',
    })

    const event = new URL(countUrl(ENDPOINT, { path: 'download-zip', title: EVENTS['download-zip'], event: true }, DEVICE, 'fghij'))
    expect(event.searchParams.get('e')).toBe('true')
    expect(event.searchParams.get('p')).toBe('download-zip')
    expect(event.searchParams.has('r')).toBe(false)
    expect(event.searchParams.has('q')).toBe(false)
  })

  it('names every event so GoatCounter takes it as one', () => {
    for (const name of [...Object.keys(EVENTS), ...Object.keys(CHOICES)]) expect(name).toMatch(/^[a-z][a-z0-9-]*$/)
    expect(slug('Terracotta')).toBe('terracotta')
    expect(slug('clips-tabs')).toBe('clips-tabs')
    expect(slug(' Deep Sea Blue! ')).toBe('deep-sea-blue')
    expect(slug('')).toBe('none')
  })

  it('names the area the maker touched, not the fields that followed it', () => {
    const edit = (patch: Partial<DesignConfig>) => editedArea(DEFAULT_CONFIG, { ...DEFAULT_CONFIG, ...patch })
    expect(edit({})).toBeNull()
    // A wall carrying its Recommended tile along is still a wall edit.
    expect(edit({ surface: { width: 900, height: 600 }, tile: { ...DEFAULT_CONFIG.tile, width: 100, height: 100 } })).toBe('wall')
    // A new relief brings its own depth and scale: the pick is the edit.
    expect(edit({ texture: { ...DEFAULT_CONFIG.texture, id: 'fluted', depth: 3, scale: 30 } })).toBe('texture')
    expect(edit({ texture: { ...DEFAULT_CONFIG.texture, depth: 3.4 } })).toBe('relief')
    expect(edit({ lock: 'keys', tile: { ...DEFAULT_CONFIG.tile, thickness: 6 } })).toBe('lock')
    expect(edit({ tile: { ...DEFAULT_CONFIG.tile, thickness: 6 } })).toBe('thickness')
    expect(edit({ tile: { ...DEFAULT_CONFIG.tile, width: 120 } })).toBe('tile-size')
    expect(edit({ color: '#123456' })).toBe('color')
    expect(edit({ perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'ogee' } })).toBe('edges')
    // The name is the maker's own words: renaming is not counted at all.
    expect(edit({ name: 'Hall' })).toBeNull()
  })

  it('bands the tile count', () => {
    expect([1, 9, 10, 49, 50, 99, 100, 249, 250, 4000].map(tileBand)).toEqual([
      '1-9', '1-9', '10-49', '10-49', '50-99', '50-99', '100-249', '100-249', '250-plus', '250-plus',
    ])
  })

  it('describes a downloaded wall by category, never by name, size or color value', () => {
    const facts = { format: 'stl', quality: 'standard', fixing: 'glue', tiles: 32 } as const
    const choices = zipChoices(custom, facts)
    expect(Object.fromEntries(choices)).toEqual({
      'zip-format': 'stl',
      'zip-quality': 'standard',
      'zip-texture': 'wavy',
      'zip-color': 'custom',
      'zip-fixing': 'glue',
      'zip-edge': 'chamfer',
      'zip-border': 'none',
      'zip-printer': DEFAULT_CONFIG.printerId,
      'zip-tiles': '10-49',
    })
    const sent = JSON.stringify(choices)
    for (const secret of ['Anna', '2437', '1219', '123456']) expect(sent).not.toContain(secret)

    const preset = COLOR_PRESETS[2]
    expect(Object.fromEntries(zipChoices({ ...custom, color: preset.hex }, facts))['zip-color']).toBe(preset.name)
    // A profile on no side borders nothing.
    const unsided = { ...custom, perimeter: { ...custom.perimeter, profile: 'ogee' as const, sides: { bottom: false, right: false, top: false, left: false } } }
    expect(Object.fromEntries(zipChoices(unsided, facts))['zip-border']).toBe('none')
  })
})
