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
    expect(fromBase64Url(toSearch(custom).slice(2)).split('|')).toEqual(expect.arrayContaining(['2', '%2312AB34']))
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
    expect(design).not.toHaveProperty('colorId')
  })

  it('refuses a link of an unknown version', () => {
    const [, ...rest] = fromBase64Url(toSearch(busy).slice(2)).split('|')
    for (const version of ['0', '3', '', 'v2']) {
      expect(fromSearch(new URLSearchParams(`d=${toBase64Url([version, ...rest].join('|'))}`))).toBeNull()
    }
  })

  it('clamps a hand-edited link back into a valid design', () => {
    const tampered = toSearch({ ...busy, tile: { ...busy.tile, width: 99_999 } })
    const design = fromSearch(new URLSearchParams(tampered))
    expect(design).not.toBeNull()
    expect(design?.tile.width).toBe(400)
  })
})
