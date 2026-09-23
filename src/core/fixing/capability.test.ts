import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '../config'
import { perimeterDrop } from '../geometry/profiles'
import { computeLayout, layoutInputOf } from '../layout'
import type { DesignConfig } from '../types'
import {
  CLIP_SIDE_WALL,
  clipBandOffset,
  clipsPossible,
  KEY_CLEAR,
  KEY_NOTCH_REACH,
  keyNotchDepth,
  keysPossible,
  socketWidth,
  TAB_JOINT_MAX,
  TAB_MIN_DEPTH,
  TAB_MIN_WIDTH,
  TAB_REACH,
  tabDepth,
  tabLimits,
  tabsPossible,
} from './capability'
import { keyGeometry, keyPockets } from './joins'
import { POCKET_HALF_SHORT } from './mechanism'
import { SOCKET_CLEARANCE_RANGE, TAB_BELOW_RIM, TAB_DEPTH_STACK, tabGeometry } from './tabs'

// The one answer to "can this design cut its fixings at all", which the layout reads to decide whether
// border pieces are models of their own: a wrong yes splits one tile into nine identical files.

const design = (over: Partial<DesignConfig> = {}): DesignConfig => normalizeConfig({ ...DEFAULT_CONFIG, ...over })
const tile = (thickness: number) => ({ ...DEFAULT_CONFIG.tile, thickness })

describe('keyNotchDepth', () => {
  it('is the depth keyGeometry cuts, for every plate and joint edge', () => {
    for (const thickness of [3, 3.9, 4, 4.5, 5, 6, 12]) {
      for (const jointEdge of ['square', 'chamfer', 'round', 'pillow'] as const) {
        for (const bevel of [0, 0.5, 1.5, 2, 3]) {
          const config = design({ tile: tile(thickness), jointEdge, bevel })
          expect(keyNotchDepth(config), `${thickness} ${jointEdge} ${bevel}`).toBe(keyGeometry(config)?.depth ?? null)
        }
      }
    }
  })

  it('is 1.8 mm on the default plate, none under 4 mm or under a deep joint edge', () => {
    expect(keyNotchDepth(DEFAULT_CONFIG)).toBe(1.8)
    expect(keyNotchDepth(design({ tile: tile(3) }))).toBeNull()
    expect(keyNotchDepth(design({ jointEdge: 'round', bevel: 3 }))).toBeNull()
  })
})

describe('keysPossible and clipsPossible', () => {
  it('needs the fixing asked for and a plate that holds it', () => {
    expect(keysPossible(DEFAULT_CONFIG)).toBe(false)
    expect(keysPossible(design({ lock: 'keys' }))).toBe(true)
    expect(keysPossible(design({ lock: 'tabs' }))).toBe(false)
    expect(keysPossible(design({ lock: 'keys', tile: tile(3) }))).toBe(false)
    expect(keysPossible(design({ lock: 'keys', jointEdge: 'round', bevel: 3 }))).toBe(false)
    expect(clipsPossible(DEFAULT_CONFIG)).toBe(false)
    expect(clipsPossible(design({ mount: 'clips' }))).toBe(true)
    expect(clipsPossible(design({ mount: 'clips', tile: tile(3) }))).toBe(false)
    // A deep joint edge leaves the clip pockets alone: they sit away from the sides.
    expect(clipsPossible(design({ mount: 'clips', jointEdge: 'round', bevel: 3 }))).toBe(true)
    // No tile size rule: a small tile may still take clips, piece by piece.
    expect(clipsPossible(design({ mount: 'clips', tile: { width: 20, height: 20, thickness: 4 } }))).toBe(true)
  })
})

describe('clip bands', () => {
  it('keeps the keyed bands clear of the slots across a row joint', () => {
    // The notch reach is joins.ts's own: REACH plus the mouth chamfer.
    const g = keyGeometry(design({ lock: 'keys' }))
    expect(g).not.toBeNull()
    expect(KEY_NOTCH_REACH).toBe((g?.reach ?? 0) + (g?.mouth ?? 0))
    const keyed = clipBandOffset(design({ mount: 'clips', lock: 'keys' }))
    expect(keyed - POCKET_HALF_SHORT - KEY_NOTCH_REACH).toBeGreaterThanOrEqual(KEY_CLEAR)
    expect(keyed).toBe(19.5)
  })

  it('sits a pocket and a side wall in without keys, further past a wide joint edge', () => {
    const plain = clipBandOffset(design({ mount: 'clips' }))
    expect(plain - POCKET_HALF_SHORT).toBeGreaterThanOrEqual(CLIP_SIDE_WALL)
    expect(plain - POCKET_HALF_SHORT).toBeLessThan(CLIP_SIDE_WALL + 0.1)
    const pillow = design({ mount: 'clips', jointEdge: 'pillow', bevel: 2 })
    expect(clipBandOffset(pillow)).toBeGreaterThan(plain)
    // Keys asked for but no slot cut: the bands stay where they were.
    expect(clipBandOffset(design({ mount: 'clips', lock: 'keys', jointEdge: 'round', bevel: 3 }))).toBe(
      clipBandOffset(design({ mount: 'clips', jointEdge: 'round', bevel: 3 })),
    )
    // Tabs put nothing across a row joint, so they never push a band out the way keys do.
    expect(clipBandOffset(design({ mount: 'clips', lock: 'tabs' }))).toBe(plain)
  })
})

describe('the tabs', () => {
  // capability.ts may not import tabs.ts (it would put layout.ts inside the fixings' own import cycle), so
  // each of its tab numbers is written out there and held equal to tabs.ts's derivation here, exactly as
  // KEY_NOTCH_REACH is held equal to the notch joins.ts cuts.
  it('carries the same numbers tabs.ts derives', () => {
    const g = tabGeometry(design({ lock: 'tabs' }))
    expect(g).not.toBeNull()
    expect(TAB_MIN_DEPTH).toBeCloseTo(TAB_DEPTH_STACK.reduce((sum, v) => sum + v, 0), 10)
    expect(TAB_JOINT_MAX).toBeCloseTo(TAB_BELOW_RIM, 10)
    expect(TAB_MIN_WIDTH).toBeCloseTo(g?.minWidth ?? 0, 10)
    expect(TAB_REACH).toBeCloseTo((g?.reach ?? 0) - DEFAULT_CONFIG.joint, 10)
    // The width is the widest fit's, so which piece carries a socket never moves with Fit.
    for (const fit of ['snug', 'standard', 'loose'] as const) {
      expect(tabGeometry(design({ lock: 'tabs', fit }))?.minWidth, fit).toBeCloseTo(TAB_MIN_WIDTH, 10)
    }
    // Read off the ring, not added up: the loosest fit's socket outline, plus the wall the notch margin keeps
    // beyond it. A socket reaches further into its tile than a key notch by its own clearance.
    expect(TAB_MIN_WIDTH).toBeCloseTo((g?.socketReachMax ?? 0) + 3, 10)
    expect(g?.socketReachMax ?? 0).toBeGreaterThan(KEY_NOTCH_REACH)
    expect(SOCKET_CLEARANCE_RANGE[1]).toBeCloseTo(0.45, 10)
  })

  it('cuts a socket at the key notch depth, but needs more plate under the joint edge than a key', () => {
    for (const thickness of [3, 3.9, 4, 4.5, 5, 6, 12]) {
      for (const bevel of [0, 0.5, 0.8, 1, 1.5, 3]) {
        const config = design({ tile: tile(thickness), bevel, lock: 'tabs' })
        const depth = tabDepth(config)
        const label = `${thickness} ${bevel}`
        if (depth === null) {
          // Either no notch at all, or one too shallow for the tab's depth stack.
          expect((keyNotchDepth(config) ?? 0) < TAB_MIN_DEPTH, label).toBe(true)
        } else {
          expect(depth, label).toBe(keyNotchDepth(config))
          expect(depth, label).toBeGreaterThanOrEqual(TAB_MIN_DEPTH)
        }
      }
    }
    // The gap between the two rules: a 1 mm edge between tiles leaves a key its notch and a tab none.
    expect(keyNotchDepth(design({ bevel: 1 }))).toBe(1.4)
    expect(tabDepth(design({ bevel: 1 }))).toBeNull()
  })

  it('needs the tabs asked for, a joint that hides them, and a plate that holds their sockets', () => {
    expect(tabsPossible(DEFAULT_CONFIG)).toBe(false)
    expect(tabsPossible(design({ lock: 'keys' }))).toBe(false)
    expect(tabsPossible(design({ lock: 'tabs' }))).toBe(true)
    expect(tabsPossible(design({ lock: 'tabs', tile: tile(3) }))).toBe(false)
    expect(tabsPossible(design({ lock: 'tabs', bevel: 1 }))).toBe(false)
    expect(tabsPossible(design({ lock: 'tabs', joint: TAB_JOINT_MAX }))).toBe(true)
    expect(tabsPossible(design({ lock: 'tabs', joint: TAB_JOINT_MAX + 0.2 }))).toBe(false)
    // No tile size rule, as with the clips: which piece really takes one is the layout's answer.
    expect(tabsPossible(design({ lock: 'tabs', tile: { width: 20, height: 20, thickness: 4 } }))).toBe(true)
  })

  it('tells the layout the least width and how far a tab stands out, or nothing at all', () => {
    expect(tabLimits(DEFAULT_CONFIG)).toBeNull()
    expect(tabLimits(design({ lock: 'keys' }))).toBeNull()
    expect(tabLimits(design({ lock: 'tabs', tile: tile(3) }))).toBeNull()
    expect(tabLimits(design({ lock: 'tabs' }))).toEqual({ minWidth: TAB_MIN_WIDTH, projection: TAB_REACH })
    expect(tabLimits(design({ lock: 'tabs', joint: 1.5 }))).toEqual({ minWidth: TAB_MIN_WIDTH, projection: 9.5 })
  })

  it('asks a piece under a dropping border profile for the drop beyond its socket, not just the margin', () => {
    const profiled = (over: Partial<DesignConfig['perimeter']>): DesignConfig =>
      design({ lock: 'tabs', perimeter: { ...DEFAULT_CONFIG.perimeter, drop: 2, width: 25, ...over } })
    // A dropping profile takes the top away as far as its own reach, and no socket may sit under it, so the
    // piece needs that instead of the margin: the drop, plus the socket ring it has to clear.
    for (const profile of ['chamfer', 'bullnose', 'ogee'] as const) {
      const config = profiled({ profile })
      expect(perimeterDrop(config), profile).toBeCloseTo(25, 10)
      expect(socketWidth(config), profile).toBeCloseTo(TAB_MIN_WIDTH + 25 - 3, 10)
      expect(tabLimits(config)?.minWidth, profile).toBeCloseTo(socketWidth(config), 10)
    }
    // A profile that keeps the top at full height drops nothing, so the plain width still holds.
    for (const profile of ['none', 'margin', 'frame'] as const) {
      expect(perimeterDrop(profiled({ profile })), profile).toBe(0)
      expect(socketWidth(profiled({ profile })), profile).toBeCloseTo(TAB_MIN_WIDTH, 10)
    }
    // And tabs.ts derives the same two numbers off the ring, as it does for every other one of them.
    for (const profile of ['none', 'margin', 'chamfer', 'bullnose', 'ogee', 'frame'] as const) {
      for (const width of [8, 15, 25, 40]) {
        const config = profiled({ profile, width })
        expect(tabGeometry(config)?.socketWidth, `${profile} ${width}`).toBeCloseTo(socketWidth(config), 10)
        expect(tabGeometry(config)?.minWidth, `${profile} ${width}`).toBeCloseTo(TAB_MIN_WIDTH, 10)
      }
    }
  })
})

describe('layoutInputOf', () => {
  const modelsOf = (config: DesignConfig) => computeLayout(layoutInputOf(config)).pieces.map((p) => p.id)

  it('tells border pieces apart only when keys can really be cut', () => {
    const plain = modelsOf(DEFAULT_CONFIG)
    expect(plain).toHaveLength(1)
    expect(layoutInputOf(design({ lock: 'keys' })).edges?.boundaryMatters).toBe(true)
    expect(modelsOf(design({ lock: 'keys' }))).toHaveLength(9)
    // Keys on, but a 3 mm round edge on the Standard plate, or the Light plate: no notch anywhere.
    for (const config of [design({ lock: 'keys', jointEdge: 'round', bevel: 3 }), design({ lock: 'keys', tile: tile(3) })]) {
      expect(layoutInputOf(config).edges?.boundaryMatters).toBe(false)
      expect(modelsOf(config)).toEqual(plain)
      for (const piece of computeLayout(layoutInputOf(config)).pieces) expect(keyPockets(config, piece)).toEqual([])
    }
  })
})
