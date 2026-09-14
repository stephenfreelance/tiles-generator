import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import type { DesignConfig } from '@/core/types'
import { fromSearch, toSearch } from './designLink'

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

  it('clamps a hand-edited link back into a valid design', () => {
    const tampered = toSearch({ ...busy, tile: { ...busy.tile, width: 99_999 } })
    const design = fromSearch(new URLSearchParams(tampered))
    expect(design).not.toBeNull()
    expect(design?.tile.width).toBe(400)
  })
})
