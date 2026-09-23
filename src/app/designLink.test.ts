import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import type { DesignConfig } from '@/core/types'
import { fromSearch, toSearch } from './designLink'

const toBase64Url = (text: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromBase64Url = (text: string): string =>
  new TextDecoder().decode(Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0)))

const roundTrip = (config: DesignConfig): DesignConfig | null => fromSearch(new URLSearchParams(toSearch(config)))

const busy: DesignConfig = normalizeConfig({
  ...DEFAULT_CONFIG,
  name: 'Hall floor | rev 2, "north" side',
  surface: { width: 2437, height: 1219 },
  surfaceUnit: 'm',
  tile: { width: 97.5, height: 143.25, thickness: 5.5 },
  joint: 2.5,
  bevel: 0.8,
  layout: { origin: 'corner', rowOffset: 0.3333 },
  texture: { id: 'hex-lattice', depth: 3.7, scale: 42, params: { angle: 22.5, ridge: 0.4 }, seed: 918_273, invert: true, rotate: true },
})

describe('designLink', () => {
  it('round-trips the default design', () => {
    expect(roundTrip(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG)
  })

  it('round-trips a design with texture parameters, odd sizes and punctuation in its name', () => {
    expect(roundTrip(busy)).toEqual(busy)
  })

  it('keeps a full link well under the 2000 character practical limit', () => {
    expect(toSearch(busy).length).toBeLessThan(600)
  })

  it('has no design when the parameter is missing', () => {
    expect(fromSearch(new URLSearchParams('x=1'))).toBeNull()
  })

  it('never produces an invalid design from a truncated payload', () => {
    const search = toSearch(busy)
    for (const cut of [4, 12, 28, 40, 64, 120]) {
      const design = fromSearch(new URLSearchParams(search.slice(0, search.length - cut)))
      // Either the link is unreadable, or what comes back has already been through normalizeConfig.
      if (design) expect(normalizeConfig(design)).toEqual(design)
    }
  })

  it('refuses a payload that is not a link at all', () => {
    expect(fromSearch(new URLSearchParams('d=not-a-payload'))).toBeNull()
  })

  it('carries the color hex, # included, through the link', () => {
    const custom = normalizeConfig({ ...DEFAULT_CONFIG, color: '#12AB34' })
    expect(roundTrip(custom)?.color).toBe('#12AB34')
    expect(fromBase64Url(toSearch(custom).slice(2)).split('|')).toEqual(expect.arrayContaining(['4', '%2312AB34']))
  })

  it('still opens a version 1 link, with the color its filament id stood for', () => {
    // Written by hand in the version 1 shape: the same 21 fields, a filament id in slot 18.
    const tuple = [
      '1', 'Hall%20floor', '2437', '1219', 'm', '97.5', '143.25', '5.5', '2.5', '0.8', 'corner', '0.3333',
      'hex-lattice', '3.7', '42', '918273', '1', '1', 'pla-matte-terracotta', DEFAULT_CONFIG.printerId, 'angle~22.5,ridge~0.4',
    ].join('|')
    const design = fromSearch(new URLSearchParams(`d=${toBase64Url(tuple)}`))
    expect(design).not.toBeNull()
    expect(design?.color).toBe('#B15533')
    expect(design).toEqual(normalizeConfig({ ...busy, name: 'Hall floor', color: '#B15533' }))
    expect(design?.lock).toBe('none')
    expect(design).not.toHaveProperty('colorId')
  })

  it('refuses a link of an unknown version', () => {
    const [, ...rest] = fromBase64Url(toSearch(busy).slice(2)).split('|')
    for (const version of ['0', '5', '', 'v4']) {
      expect(fromSearch(new URLSearchParams(`d=${toBase64Url([version, ...rest].join('|'))}`))).toBeNull()
    }
  })

  it('round-trips the edges and the fixings', () => {
    const fixed = normalizeConfig({
      ...busy,
      jointEdge: 'pillow',
      perimeter: {
        profile: 'ogee',
        sides: { bottom: false, right: true, top: true, left: false },
        width: 12.5,
        drop: 2.2,
        fade: 6,
        land: 'valleys',
      },
      lock: 'keys',
      mount: 'clips',
      fit: 'snug',
    })
    expect(fixed.mount).toBe('clips')
    expect(roundTrip(fixed)).toEqual(fixed)
    // The mount rides in slot 29, and the wall clips need no new version.
    expect(fromBase64Url(toSearch(fixed).slice(2)).split('|')[29]).toBe('clips')
  })

  it('round-trips the tabs, named in slot 28 of a version 4 tuple', () => {
    const tabbed = normalizeConfig({ ...busy, joint: 1, lock: 'tabs' })
    expect(tabbed.lock).toBe('tabs')
    expect(roundTrip(tabbed)).toEqual(tabbed)
    const parts = fromBase64Url(toSearch(tabbed).slice(2)).split('|')
    expect(parts[0]).toBe('4')
    expect(parts[28]).toBe('tabs')
  })

  it('opens a version 4 link whose lock it does not know as a wall of tiles side by side', () => {
    const parts = fromBase64Url(toSearch(normalizeConfig({ ...busy, lock: 'tabs' })).slice(2)).split('|')
    parts[28] = 'dowels'
    expect(fromSearch(new URLSearchParams(`d=${toBase64Url(parts.join('|'))}`))?.lock).toBe('none')
  })

  it("still reads a version 3 link's keys boolean as a lock", () => {
    const parts = fromBase64Url(toSearch(normalizeConfig({ ...busy, lock: 'keys' })).slice(2)).split('|')
    const v3 = (slot28: string) => {
      const tuple = ['3', ...parts.slice(1)]
      tuple[28] = slot28
      return fromSearch(new URLSearchParams(`d=${toBase64Url(tuple.join('|'))}`))
    }
    expect(v3('1')?.lock).toBe('keys')
    expect(v3('0')?.lock).toBe('none')
    // A version 3 link knew no third value, so anything else there is the boolean's false.
    expect(v3('tabs')?.lock).toBe('none')
  })

  it('opens a version 3 link whose mount it does not know as a glued wall', () => {
    const parts = fromBase64Url(toSearch(normalizeConfig({ ...busy, mount: 'clips' })).slice(2)).split('|')
    parts[0] = '3'
    parts[28] = '1'
    parts[29] = 'rails'
    expect(fromSearch(new URLSearchParams(`d=${toBase64Url(parts.join('|'))}`))?.mount).toBe('glue')
  })

  it('round-trips an edge that cuts the relief in the version 4 tuple', () => {
    for (const profile of ['chamfer', 'bullnose', 'ogee'] as const) {
      const cut = normalizeConfig({
        ...busy,
        perimeter: { profile, sides: { bottom: true, right: false, top: true, left: true }, width: 7.5, drop: 1.8, fade: 0, land: 'cut' },
      })
      expect(cut.perimeter.land).toBe('cut')
      expect(roundTrip(cut)).toEqual(cut)
      // The land rides in slot 27, as the flat lands do.
      expect(fromBase64Url(toSearch(cut).slice(2)).split('|')[27]).toBe('cut')
    }
  })

  it('opens a version 2 link with the edges and fixings of a new design', () => {
    // Version 2 is the version 4 tuple cut after the texture parameters.
    const [, ...rest] = fromBase64Url(toSearch(busy).slice(2)).split('|')
    const tuple = ['2', ...rest.slice(0, 20)].join('|')
    const design = fromSearch(new URLSearchParams(`d=${toBase64Url(tuple)}`))
    expect(design).toEqual(busy)
    expect(design?.lock).toBe('none')
  })

  it('refuses a link cut short before its fixings, at either version that carries them', () => {
    const parts = fromBase64Url(toSearch(busy).slice(2)).split('|')
    for (const version of ['4', '3']) {
      const cut = [version, ...parts.slice(1, 25)].join('|')
      expect(fromSearch(new URLSearchParams(`d=${toBase64Url(cut)}`))).toBeNull()
    }
  })

  it('clamps a hand-edited link back into a valid design', () => {
    const tampered = toSearch({ ...busy, tile: { ...busy.tile, width: 99_999 } })
    const design = fromSearch(new URLSearchParams(tampered))
    expect(design).not.toBeNull()
    expect(design?.tile.width).toBe(400)
  })
})
