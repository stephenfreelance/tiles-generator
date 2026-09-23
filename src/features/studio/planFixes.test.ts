import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, MIN_FIXING_THICKNESS, normalizeConfig } from '@/core/config'
import { joinPlan, keyGeometry } from '@/core/fixing/joins'
import { mountPlan } from '@/core/fixing/mount'
import { tabPlan } from '@/core/fixing/tabs'
import { fixingWarnings } from '@/core/fixing/warnings'
import { resolvePerimeter } from '@/core/geometry/profiles'
import { computeLayout, layoutInputOf } from '@/core/layout'
import type { DesignConfig, FitWarning, LayoutPlan } from '@/core/types'
import { fixFor } from './planFixes'

// A fix speaks its result out loud, so what it says has to be what the plan then holds.

const oversizeTile: FitWarning = {
  code: 'tile-larger-than-surface',
  message: 'The tile is larger than the surface, so every piece is a cut. Check the sizes.',
}

function design(surface: { width: number; height: number }, tile: { width: number; height: number }): DesignConfig {
  return normalizeConfig({ ...DEFAULT_CONFIG, surface, tile: { ...DEFAULT_CONFIG.tile, ...tile } })
}

const layoutOf = (config: DesignConfig): LayoutPlan =>
  computeLayout({ surface: config.surface, tile: config.tile, joint: config.joint, layout: config.layout })

describe('make the tile fit', () => {
  it('says what the clamp really leaves when only one axis was oversized', () => {
    const config = design({ width: 300, height: 600 }, { width: 400, height: 400 })
    const fix = fixFor(oversizeTile, config, layoutOf(config))
    expect(fix).not.toBeNull()

    const fixed = fix!.apply(config)
    const plan = layoutOf(fixed)
    expect({ width: fixed.tile.width, height: fixed.tile.height }).toEqual({ width: 300, height: 400 })
    expect({ full: plan.fullCount, cut: plan.partialCount }).toEqual({ full: 1, cut: 1 })

    expect(fix!.done).toContain('1 whole tile and 1 cut piece')
    expect(fix!.done).not.toContain('one whole tile covers it')
  })

  it('keeps the promise when one tile really does cover the surface', () => {
    const config = design({ width: 300, height: 300 }, { width: 400, height: 400 })
    const fix = fixFor(oversizeTile, config, layoutOf(config))

    const plan = layoutOf(fix!.apply(config))
    expect(plan.exact).toBe(true)
    expect(plan.placements).toHaveLength(1)
    expect(fix!.done).toBe('Tile set to 300 mm by 300 mm: one whole tile covers it.')
  })

  it('counts the whole tiles when the clamped tile divides the surface', () => {
    const config = design({ width: 300, height: 600 }, { width: 400, height: 300 })
    const fix = fixFor(oversizeTile, config, layoutOf(config))

    const plan = layoutOf(fix!.apply(config))
    expect(plan.exact).toBe(true)
    expect(plan.placements).toHaveLength(2)
    expect(fix!.done).toBe('Tile set to 300 mm by 300 mm: 2 whole tiles cover it.')
  })
})

// The fixings' notes: each fix must clear what its note says, checked on the design it produces.

const note = (code: FitWarning['code']): FitWarning => ({ code, message: 'The checker said so.' })
const withOver = (over: Partial<DesignConfig>): DesignConfig => normalizeConfig({ ...DEFAULT_CONFIG, ...over })
const planOf = (config: DesignConfig): LayoutPlan => computeLayout(layoutInputOf(config))
const fixed = (code: FitWarning['code'], config: DesignConfig) => {
  const fix = fixFor(note(code), config, planOf(config))
  return { fix, after: fix ? fix.apply(config) : config }
}

describe('a base too thin for the pockets', () => {
  it('moves up to the Standard base for wall clips on a Light plate', () => {
    const config = withOver({ mount: 'clips', tile: { width: 150, height: 150, thickness: 3 } })
    const { fix, after } = fixed('thin-base', config)
    expect(fix?.label).toBe('Use the Standard base')
    expect(fix?.done).toBe('Base set to 4 mm (Standard): the pockets fit now.')
    expect(after.tile.thickness).toBe(MIN_FIXING_THICKNESS)
    expect(after.mount).toBe('clips')
  })

  it('takes the Sturdy base when a deep joint edge leaves no room over a key slot at 4 mm', () => {
    const config = withOver({ lock: 'keys', jointEdge: 'round', bevel: 3 })
    expect(keyGeometry(config)).toBeNull()
    const { fix, after } = fixed('thin-base', config)
    expect(fix?.label).toBe('Use the Sturdy base')
    expect(after.tile.thickness).toBe(6)
    expect(keyGeometry(after)).not.toBeNull()
  })

  it('has nothing to offer once the base holds the pockets', () => {
    expect(fixFor(note('thin-base'), withOver({ lock: 'keys' }), planOf(withOver({ lock: 'keys' })))).toBeNull()
  })
})

describe('an edge profile held back', () => {
  const bullnose = (drop: number): DesignConfig =>
    withOver({ perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'bullnose', width: 4, drop, land: 'valleys' } })

  it('offers the Sturdy base when it gives the profile its whole drop', () => {
    const config = bullnose(3)
    expect(resolvePerimeter(config)).toMatchObject({ clamped: true, reason: 'plate' })
    const { fix, after } = fixed('profile-clamped', config)
    expect(fix?.label).toBe('Use the Sturdy base')
    expect(fix?.done).toBe('Base set to 6 mm (Sturdy): the edge drops the full 3 mm.')
    expect(resolvePerimeter(after)?.clamped).toBe(false)
  })

  it('offers the deepest drop the base allows when even the Sturdy base is not enough', () => {
    const config = bullnose(8)
    const { fix, after } = fixed('profile-clamped', config)
    expect(fix?.label).toBe('Drop the edge 2.3 mm')
    expect(after.perimeter.drop).toBe(2.3)
    expect(resolvePerimeter(after)?.clamped).toBe(false)
  })

  it('offers a drop that really clears the note, where floating point leaves the room a hair short', () => {
    // 4 mm plate, 2.6 mm relief at the peaks, 0.5 mm joint edge: the room is 6.6 - 1.2 - 0.5, which
    // floating point makes 4.8999999999999995 mm.
    const config = withOver({ perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'bullnose', width: 6, drop: 8, fade: 0, land: 'peaks' } })
    expect(config.tile.thickness).toBe(4)
    expect(config.texture.depth).toBe(2.6)
    expect(config.bevel).toBe(0.5)
    expect(resolvePerimeter(config)).toMatchObject({ clamped: true, reason: 'plate' })
    const { fix, after } = fixed('profile-clamped', config)
    expect(fix?.label).toBe('Drop the edge 4.9 mm')
    expect(after.perimeter.drop).toBe(4.9)
    expect(resolvePerimeter(after)?.clamped).toBe(false)
    // Nothing is left to fix once it lands.
    expect(fixFor(note('profile-clamped'), after, planOf(after))).toBeNull()
  })

  it('narrows a profile too wide for a small wall until the whole of it fits', () => {
    const config = withOver({ surface: { width: 60, height: 60 }, perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'chamfer', width: 30, drop: 2 } })
    expect(resolvePerimeter(config)).toMatchObject({ clamped: true, reason: 'surface' })
    const { fix, after } = fixed('profile-clamped', config)
    expect(fix?.label).toBe('Narrow the edge to 22.5 mm')
    expect(resolvePerimeter(after)?.clamped).toBe(false)
    // Half a millimetre wider would not fit whole.
    const wider = { ...after, perimeter: { ...after.perimeter, width: after.perimeter.width + 0.5 } }
    expect(resolvePerimeter(wider)?.clamped).toBe(true)
  })
})

describe('a cut too thin to glue', () => {
  const cutsLeft = (config: DesignConfig) => planOf(config).warnings.filter((w) => w.code === 'thin-cut').length

  it('evens out the edges only when that leaves no thin cut, else offers what does', () => {
    // A half bond on a 1210 × 605 mm wall: balancing it leaves a 5 mm piece of its own.
    const bond = withOver({
      surface: { width: 1210, height: 605 },
      layout: { origin: 'corner', rowOffset: 0.5 },
      lock: 'keys',
      perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'chamfer', width: 20, drop: 2, fade: 0, land: 'peaks' },
    })
    expect(cutsLeft(bond)).toBeGreaterThan(0)
    expect(cutsLeft({ ...bond, layout: { ...bond.layout, origin: 'balanced' } })).toBeGreaterThan(0)
    const { fix, after } = fixed('thin-cut', bond)
    expect(fix?.label).not.toBe('Even out the edges')
    expect(fix?.label).toBe('Use 151.3 mm tiles')
    expect(cutsLeft(after)).toBe(0)
  })

  it('evens out the edges when that clears every thin cut', () => {
    const thin = withOver({ surface: { width: 1210, height: 600 } })
    expect(cutsLeft(thin)).toBeGreaterThan(0)
    const { fix, after } = fixed('thin-cut', thin)
    expect(fix?.label).toBe('Even out the edges')
    expect(cutsLeft(after)).toBe(0)
  })
})

describe('joints and pieces the fixings cannot reach', () => {
  it('evens out the edges when that gives every joint a key, and only then', () => {
    const thin = withOver({ lock: 'keys', surface: { width: 910, height: 600 } })
    expect(joinPlan(thin, planOf(thin)).unkeyedSeams).toBeGreaterThan(0)
    const { fix, after } = fixed('no-key', thin)
    expect(fix?.label).toBe('Even out the edges')
    expect(joinPlan(after, planOf(after)).unkeyedSeams).toBe(0)
    // A 20 mm tile keeps its row joints unkeyed whatever the origin.
    const tiny = withOver({ lock: 'keys', tile: { width: 20, height: 20, thickness: 4 }, surface: { width: 200, height: 100 } })
    expect(fixFor(note('no-key'), tiny, planOf(tiny))).toBeNull()
  })

  it('evens out the edges when that gives every tile a tab to lock to, and says so', () => {
    // A 1205 mm wall ends in a 5 mm cut: too narrow for a socket, so nothing locks it or its left neighbour.
    const cut = withOver({ lock: 'tabs', surface: { width: 1205, height: 600 } })
    expect(tabPlan(cut, planOf(cut)).unlockedPieceIds.length).toBeGreaterThan(0)
    const { fix, after } = fixed('no-lock', cut)
    expect(fix?.label).toBe('Even out the edges')
    expect(fix?.done).toBe('Edges evened out: every tile locks to the one beside it.')
    const locked = tabPlan(after, planOf(after))
    expect(locked.unlockedPieceIds).toEqual([])
    expect(locked.tabs).toBeGreaterThan(0)
  })

  it('closes a joint too wide to hide a tab, which is the move that really places them', () => {
    const wide = withOver({ lock: 'tabs', joint: 3 })
    expect(tabPlan(wide, planOf(wide)).tabs).toBe(0)
    const { fix, after } = fixed('no-lock', wide)
    expect(fix?.label).toBe('Close the joint to 2 mm')
    expect(after.joint).toBe(2)
    expect(after.lock).toBe('tabs')
    expect(tabPlan(after, planOf(after)).tabs).toBeGreaterThan(0)
  })

  it('leaves the tabs out only when no joint of the wall can take one', () => {
    // One tile wide: there is no joint within a row at all, and no layout makes one.
    const single = withOver({ lock: 'tabs', surface: { width: 150, height: 600 } })
    expect(tabPlan(single, planOf(single)).tabs).toBe(0)
    const { fix, after } = fixed('no-lock', single)
    expect(fix?.label).toBe('Leave the tabs out')
    expect(fix?.done).toBe('Tabs left out: the tiles go up side by side.')
    expect(after.lock).toBe('none')
    // A wall that already locks everything needs no fix at all.
    const whole = withOver({ lock: 'tabs' })
    expect(tabPlan(whole, planOf(whole)).unlockedPieceIds).toEqual([])
    expect(fixFor(note('no-lock'), whole, planOf(whole))).toBeNull()
  })

  it('evens out the edges when that gives every piece a wall clip', () => {
    // A 12 mm strip along the bottom is too narrow for a clip; balanced, the cuts are shared and deep enough.
    const strip = withOver({ mount: 'clips', surface: { width: 1200, height: 612 } })
    expect(mountPlan(strip, planOf(strip)).unmountedPieceIds.length).toBeGreaterThan(0)
    const { fix, after } = fixed('no-mount', strip)
    expect(fix).not.toBeNull()
    expect(mountPlan(after, planOf(after)).unmountedPieceIds).toEqual([])
    expect(after.mount).toBe('clips')
    // Keys are never the answer: a piece with no clip is glued with or without them.
    expect(after.lock).toBe('none')
  })

  it('offers nothing once every piece takes a clip', () => {
    const clips = withOver({ mount: 'clips' })
    expect(fixFor(note('no-mount'), clips, planOf(clips))).toBeNull()
  })
})

describe('too many models from the border versions', () => {
  const edged = (over: Partial<DesignConfig>) =>
    withOver({
      surface: { width: 1210, height: 610 },
      perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'chamfer', width: 4, drop: 2, fade: 16 },
      ...over,
    })

  it('offers the way out that leaves the fewest models, by the numbers', () => {
    for (const config of [edged({}), edged({ lock: 'keys' }), withOver({ lock: 'keys', surface: { width: 1250, height: 640 }, tile: { width: 100, height: 100, thickness: 4 }, layout: { origin: 'corner', rowOffset: 0.5 } })]) {
      const plan = planOf(config)
      const fix = fixFor(note('many-pieces'), config, plan)
      expect(fix).not.toBeNull()
      const after = planOf(fix!.apply(config)).pieces.length
      expect(after).toBeLessThan(plan.pieces.length)
      // No single other move does better.
      const others: DesignConfig[] = [
        { ...config, lock: 'none' },
        { ...config, layout: { ...config.layout, rowOffset: 0 } },
        ...(['top', 'right', 'bottom', 'left'] as const).map((side) => ({
          ...config,
          perimeter: { ...config.perimeter, sides: { ...config.perimeter.sides, [side]: false } },
        })),
      ]
      for (const other of others) expect(after).toBeLessThanOrEqual(planOf(other).pieces.length)
    }
  })

  it('says how many models remain', () => {
    const config = withOver({ lock: 'keys', surface: { width: 1250, height: 640 }, tile: { width: 100, height: 100, thickness: 4 }, layout: { origin: 'corner', rowOffset: 0.5 } })
    const fix = fixFor(note('many-pieces'), config, planOf(config))!
    const count = planOf(fix.apply(config)).pieces.length
    expect(fix.done).toContain(`${count} different tiles to print`)
  })

  it('keeps the old advice for a wall without border versions', () => {
    const config = withOver({ surface: { width: 1250, height: 640 }, tile: { width: 100, height: 100, thickness: 4 }, layout: { origin: 'center', rowOffset: 0.5 } })
    expect(fixFor(note('many-pieces'), config, planOf(config))?.label).toBe('Use straight rows')
  })
})

describe('tiles too small for a wall clip', () => {
  it('offers glue or tape, which is what the plans already do', () => {
    const small = withOver({ mount: 'clips', tile: { width: 32, height: 32, thickness: 4 } })
    expect(mountPlan(small, planOf(small)).clips).toBe(0)
    const { fix, after } = fixed('no-mount', small)
    expect(fix?.label).toBe('Use glue or tape')
    expect(after.mount).toBe('glue')
    expect(fixingWarnings(small, planOf(small)).some((w) => w.code === 'no-mount')).toBe(true)
    expect(fixingWarnings(after, planOf(after)).some((w) => w.code === 'no-mount')).toBe(false)
  })

  it('leaves the keys out when their slots, not the tile size, take the room a clip needs', () => {
    // 56 mm tiles with a margin edge: with keys, no piece of the wall has room left for a pocket.
    const keyed = withOver({
      mount: 'clips',
      lock: 'keys',
      tile: { width: 56, height: 56, thickness: 4 },
      surface: { width: 600, height: 400 },
      perimeter: { ...DEFAULT_CONFIG.perimeter, profile: 'margin' },
    })
    expect(mountPlan(keyed, planOf(keyed)).clips).toBe(0)
    const { fix, after } = fixed('no-mount', keyed)
    expect(fix?.label).toBe('Leave the keys out')
    expect({ lock: after.lock, mount: after.mount }).toEqual({ lock: 'none', mount: 'clips' })
    const clips = mountPlan(after, planOf(after)).clips
    expect(clips).toBeGreaterThan(0)
    expect(fix?.done).toBe(`Keys left out: ${clips} wall clips to fit.`)
    // The wall-wide note is answered: what is left, if anything, is the note that names single pieces.
    const left = fixingWarnings(after, planOf(after)).find((w) => w.code === 'no-mount')
    expect(mountPlan(after, planOf(after)).unmountedPieceIds.length).toBeLessThan(planOf(after).pieces.length)
    if (left) expect(left.pieceId).toBeDefined()
  })

  it('offers nothing for a thin base: its own note moves the plate', () => {
    const thin = withOver({ mount: 'clips', tile: { width: 150, height: 150, thickness: 3 } })
    expect(fixFor(note('no-mount'), thin, planOf(thin))).toBeNull()
  })

  it('leaves the tabs out when their sockets, not the tile size, take the room a clip needs', () => {
    // A 56 x 28 tile is wide enough for a socket and short enough that the socket reaches the clip band.
    const tabbed = withOver({ mount: 'clips', lock: 'tabs', tile: { width: 56, height: 28, thickness: 4 }, surface: { width: 336, height: 168 } })
    const before = mountPlan(tabbed, planOf(tabbed))
    expect(before.unmountedPieceIds.length).toBeGreaterThan(0)
    const { fix, after } = fixed('no-mount', tabbed)
    expect(fix?.label).toBe('Leave the tabs out')
    expect({ lock: after.lock, mount: after.mount }).toEqual({ lock: 'none', mount: 'clips' })
    const clips = mountPlan(after, planOf(after)).clips
    expect(clips).toBeGreaterThan(before.clips)
    expect(fix?.done).toBe(`Tabs left out: ${clips} wall clips to fit.`)
    expect(mountPlan(after, planOf(after)).unmountedPieceIds).toEqual([])
  })
})

describe('a thin base under the sockets', () => {
  it('raises the plate and names what fits now', () => {
    const thin = withOver({ lock: 'tabs', tile: { width: 150, height: 150, thickness: 3 } })
    const { fix, after } = fixed('thin-base', thin)
    expect(fix?.label).toBe('Use the Standard base')
    expect(fix?.done).toBe(`Base set to ${MIN_FIXING_THICKNESS} mm (Standard): the sockets fit now.`)
    expect(after.tile.thickness).toBe(MIN_FIXING_THICKNESS)
    expect(tabPlan(after, planOf(after)).tabs).toBeGreaterThan(0)
  })
})
