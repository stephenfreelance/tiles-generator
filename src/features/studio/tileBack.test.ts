import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import { computeLayout, layoutInputOf } from '@/core/layout'
import type { DesignConfig } from '@/core/types'
import { backHasPockets } from './tileBack'

// The Front / Back switch offers the back only when there is something cut into it to look at.

const design = (over: Partial<DesignConfig>): DesignConfig => normalizeConfig({ ...DEFAULT_CONFIG, ...over })
const back = (config: DesignConfig) => backHasPockets(config, computeLayout(layoutInputOf(config)))

describe('backHasPockets', () => {
  it('turns over a tile with key slots, sockets and a tab, or clip pockets', () => {
    expect(back(design({ lock: 'keys' }))).toBe(true)
    expect(back(design({ mount: 'clips' }))).toBe(true)
    expect(back(design({ mount: 'clips', lock: 'keys' }))).toBe(true)
    // A tab is no pocket, but a tabbed tile's back is not flat either and the view must offer it.
    expect(back(design({ lock: 'tabs' }))).toBe(true)
    expect(back(design({ mount: 'clips', lock: 'tabs' }))).toBe(true)
  })

  it('keeps a plain glued tile face up', () => {
    expect(back(DEFAULT_CONFIG)).toBe(false)
  })

  it('keeps it face up when keys are on but none is cut', () => {
    // A 3 mm base is too thin for a notch, and so is 4 mm under a 3 mm edge between tiles.
    expect(back(design({ lock: 'keys', tile: { width: 150, height: 150, thickness: 3 } }))).toBe(false)
    expect(back(design({ lock: 'keys', jointEdge: 'round', bevel: 3 }))).toBe(false)
    // One tile covers the wall: no joint for a key to cross.
    expect(back(design({ lock: 'keys', surface: { width: 150, height: 150 } }))).toBe(false)
  })

  it('keeps it face up when tabs are on but none is cut', () => {
    // A 3 mm base is too thin for a socket, and so is 4 mm under a 3 mm edge between tiles.
    expect(back(design({ lock: 'tabs', tile: { width: 150, height: 150, thickness: 3 } }))).toBe(false)
    expect(back(design({ lock: 'tabs', jointEdge: 'round', bevel: 3 }))).toBe(false)
    // A joint wider than a tab sits below the rim would show it, so nothing is cut.
    expect(back(design({ lock: 'tabs', joint: 3 }))).toBe(false)
  })

  it('keeps it face up when clips are on but none fits', () => {
    // A 3 mm base cannot hold a clip pocket, and a 32 mm tile has no room for one.
    expect(back(design({ mount: 'clips', tile: { width: 150, height: 150, thickness: 3 } }))).toBe(false)
    expect(back(design({ mount: 'clips', tile: { width: 32, height: 32, thickness: 4 } }))).toBe(false)
  })
})
