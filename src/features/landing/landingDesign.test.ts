import { describe, expect, it } from 'vitest'
import { DEFAULT_COLOR, presetByHex } from '@/core/colors'
import { normalizeConfig } from '@/core/config'
import { computeLayout } from '@/core/layout'
import { DEFAULT_TEXTURE_ID, textureById } from '@/core/textures/registry'
import type { LayoutPlan } from '@/core/types'
import { cornerDetail } from './cornerDetail'
import {
  conceptConfig,
  EXAMPLE_WALLS,
  LANDING_BASE,
  LANDING_DESIGN_START,
  LANDING_SPECIMENS,
  LANDING_WALL_LIMITS,
  landingConfig,
  landingDesignStep,
  landingPlan,
  type LandingDesign,
  type LandingEvent,
} from './landingDesign'

const START = LANDING_DESIGN_START
const step = (state: LandingDesign, ...events: LandingEvent[]) => events.reduce(landingDesignStep, state)
const planOf = (state: LandingDesign): LayoutPlan => landingPlan(landingConfig(state))
const shape = (plan: LayoutPlan) => plan.pieces.map((piece) => [piece.mark, piece.label, piece.width, piece.height, piece.count])

describe('the landing wall', () => {
  it('starts on the wall the page owns: the base size, the default relief and the default color', () => {
    expect(START).toEqual({ widthMm: 1000, heightMm: 700, textureId: DEFAULT_TEXTURE_ID, color: DEFAULT_COLOR })
    expect(LANDING_BASE.surface).toEqual({ width: 1000, height: 700 })
    expect(LANDING_BASE.surfaceUnit).toBe('cm')
    expect(LANDING_BASE.tile).toEqual({ width: 150, height: 150, thickness: 4 })
    expect(LANDING_BASE.joint).toBe(0)
    expect(LANDING_BASE.layout).toEqual({ origin: 'corner', rowOffset: 0 })
  })

  it('lays 35 tiles from four models, and the drawing agrees with the legend', () => {
    const plan = planOf(step(START, { type: 'wall', widthMm: 1000, heightMm: 700 }))
    expect(plan.columns).toBe(7)
    expect(plan.rows).toBe(5)
    expect(plan.placements).toHaveLength(35)
    expect(plan.fullCount).toBe(24)
    expect(plan.partialCount).toBe(11)
    expect(plan.exact).toBe(false)
    expect(plan.warnings).toEqual([])
    expect(shape(plan)).toEqual([
      ['A', 'Full tile', 150, 150, 24],
      ['B', 'Bottom edge', 150, 100, 6],
      ['C', 'Right edge', 100, 150, 4],
      ['D', 'Bottom-right corner', 100, 100, 1],
    ])
  })

  it('offers three example walls, the first being the wall the page opens on', () => {
    expect(EXAMPLE_WALLS.map((wall) => wall.label)).toEqual([
      'Splashback 100 × 70',
      'Niche 60 × 40',
      'Feature wall 240 × 120',
    ])
    expect(EXAMPLE_WALLS[0]).toMatchObject({ widthMm: START.widthMm, heightMm: START.heightMm })
    for (const wall of EXAMPLE_WALLS) {
      for (const side of [wall.widthMm, wall.heightMm]) {
        expect(side).toBeGreaterThanOrEqual(LANDING_WALL_LIMITS.min)
        expect(side).toBeLessThanOrEqual(LANDING_WALL_LIMITS.max)
      }
    }
  })

  it('cuts the niche wall on one side only: 12 tiles, 8 whole, 2 models', () => {
    const plan = planOf(step(START, { type: 'example', index: 1 }))
    expect(plan.placements).toHaveLength(12)
    expect(plan.fullCount).toBe(8)
    expect(plan.partialCount).toBe(4)
    expect(shape(plan)).toEqual([
      ['A', 'Full tile', 150, 150, 8],
      ['B', 'Bottom edge', 150, 100, 4],
    ])
  })

  it('divides the feature wall exactly: 128 whole tiles from one model', () => {
    const plan = planOf(step(START, { type: 'example', index: 2 }))
    expect(plan.exact).toBe(true)
    expect(plan.pieces).toHaveLength(1)
    expect(plan.placements).toHaveLength(128)
    expect(plan.fullCount).toBe(128)
    expect(plan.partialCount).toBe(0)
  })

  it('ignores an example that does not exist', () => {
    for (const index of [-1, 3, 1.5, Number.NaN]) {
      expect(landingDesignStep(START, { type: 'example', index })).toBe(START)
    }
  })

  it('costs the wall against the printer bed, which a bare layout never does', () => {
    const oversized = normalizeConfig({ ...LANDING_BASE, tile: { ...LANDING_BASE.tile, width: 300, height: 300 } })
    const bedless = computeLayout({ surface: oversized.surface, tile: oversized.tile, joint: oversized.joint, layout: oversized.layout })
    expect(bedless.warnings).toEqual([])
    expect(landingPlan(oversized).warnings.map((warning) => warning.code)).toEqual(['exceeds-bed'])
  })
})

describe('sizing the wall', () => {
  it('clamps both sides to what the fields offer', () => {
    const small = step(START, { type: 'wall', widthMm: 10, heightMm: 0 })
    expect([small.widthMm, small.heightMm]).toEqual([LANDING_WALL_LIMITS.min, LANDING_WALL_LIMITS.min])
    const big = step(START, { type: 'wall', widthMm: 9000, heightMm: 4000 })
    expect([big.widthMm, big.heightMm]).toEqual([LANDING_WALL_LIMITS.max, LANDING_WALL_LIMITS.max])
  })

  it('changes one side without touching the other, and leaves an unusable number alone', () => {
    expect(step(START, { type: 'wall', widthMm: 1500 })).toMatchObject({ widthMm: 1500, heightMm: START.heightMm })
    expect(step(START, { type: 'wall', heightMm: 900 })).toMatchObject({ widthMm: START.widthMm, heightMm: 900 })
    expect(landingDesignStep(START, { type: 'wall', widthMm: Number.NaN })).toBe(START)
    expect(landingDesignStep(START, { type: 'wall' })).toBe(START)
  })

  it('hands back the same state when the wall does not change, so nothing re-renders', () => {
    expect(landingDesignStep(START, { type: 'wall', widthMm: START.widthMm, heightMm: START.heightMm })).toBe(START)
    expect(landingDesignStep(START, { type: 'example', index: 0 })).toBe(START)
    expect(landingDesignStep(START, { type: 'wall', widthMm: 99_999 })).not.toBe(START)
  })
})

describe('the relief and the color', () => {
  it('pairs five reliefs with five presets, wavy in green first, and never Charcoal', () => {
    expect(LANDING_SPECIMENS).toHaveLength(5)
    expect(LANDING_SPECIMENS[0]).toEqual({ textureId: DEFAULT_TEXTURE_ID, color: DEFAULT_COLOR })
    expect(LANDING_SPECIMENS.map((entry) => [entry.textureId, presetByHex(entry.color)?.name])).toEqual([
      ['wavy', 'Green'],
      ['zellige', 'Terracotta'],
      ['fluted', 'Blue'],
      ['fish-scale', 'Teal'],
      ['moroccan-star', 'Orange'],
    ])
    expect(new Set(LANDING_SPECIMENS.map((entry) => entry.textureId)).size).toBe(LANDING_SPECIMENS.length)
    for (const entry of LANDING_SPECIMENS) {
      expect(textureById(entry.textureId).id).toBe(entry.textureId)
    }
  })

  it('lays the relief and the color of a specimen together, and ignores one that does not exist', () => {
    expect(landingDesignStep(START, { type: 'specimen', index: 3 })).toMatchObject(LANDING_SPECIMENS[3])
    expect(landingDesignStep(START, { type: 'specimen', index: 0 })).toBe(START)
    expect(landingDesignStep(START, { type: 'specimen', index: 5 })).toBe(START)
  })

  it('takes any relief the registry knows, and no other', () => {
    expect(landingDesignStep(START, { type: 'texture', textureId: 'zellige' }).textureId).toBe('zellige')
    expect(landingDesignStep(START, { type: 'texture', textureId: 'not-a-texture' })).toBe(START)
    expect(landingDesignStep(START, { type: 'texture', textureId: DEFAULT_TEXTURE_ID })).toBe(START)
  })

  it('stores a color the way a design does, and ignores anything that is not one', () => {
    expect(landingDesignStep(START, { type: 'color', hex: '#abc' }).color).toBe('#AABBCC')
    expect(landingDesignStep(START, { type: 'color', hex: 'd7263d' }).color).toBe('#D7263D')
    expect(landingDesignStep(START, { type: 'color', hex: 'chartreuse' })).toBe(START)
    expect(landingDesignStep(START, { type: 'color', hex: DEFAULT_COLOR })).toBe(START)
  })

  it('leaves the wall alone when the relief changes, so only the board re-shades', () => {
    const next = step(START, { type: 'wall', widthMm: 1500 }, { type: 'specimen', index: 1 })
    expect([next.widthMm, next.heightMm]).toEqual([1500, START.heightMm])
  })
})

describe('the design the page draws with', () => {
  const EVENTS: LandingEvent[] = [
    { type: 'wall', widthMm: 9000, heightMm: 10 },
    { type: 'example', index: 2 },
    { type: 'texture', textureId: 'fluted' },
    { type: 'color', hex: '#abc' },
    { type: 'specimen', index: 4 },
  ]

  it('is a normalized config after every event, carrying the state it was built from', () => {
    let state = START
    for (const event of EVENTS) {
      state = landingDesignStep(state, event)
      const config = landingConfig(state)
      expect(config).toEqual(normalizeConfig(config))
      expect(config.surface).toEqual({ width: state.widthMm, height: state.heightMm })
      expect(config.color).toBe(state.color)
      expect(config.texture.id).toBe(state.textureId)
    }
  })

  it('adopts the recommended depth and scale of each relief, as the studio does', () => {
    for (const { textureId } of LANDING_SPECIMENS) {
      const config = landingConfig({ ...START, textureId })
      const { defaults } = textureById(textureId)
      expect(config.texture).toMatchObject({ id: textureId, depth: defaults.depth, scale: defaults.scale, params: {} })
    }
  })

  it('keeps everything the visitor does not set', () => {
    const config = landingConfig(step(START, { type: 'example', index: 1 }, { type: 'color', hex: '#D7263D' }))
    expect(config.tile).toEqual(LANDING_BASE.tile)
    expect(config.joint).toBe(LANDING_BASE.joint)
    expect(config.bevel).toBe(LANDING_BASE.bevel)
    expect(config.layout).toEqual(LANDING_BASE.layout)
    expect(config.printerId).toBe(LANDING_BASE.printerId)
    expect(config.name).toBe(LANDING_BASE.name)
  })

  it('never mutates the state it is handed', () => {
    const before = { ...START }
    for (const event of EVENTS) landingDesignStep(START, event)
    expect(START).toEqual(before)
  })
})

describe('the concept wall of section 01', () => {
  it('keeps the starting wall whatever the visitor sizes, in their relief and color', () => {
    const visitor = step(START, { type: 'example', index: 2 }, { type: 'specimen', index: 3 })
    const concept = conceptConfig(visitor)
    expect(concept.surface).toEqual(LANDING_BASE.surface)
    expect(concept.texture.id).toBe(LANDING_SPECIMENS[3].textureId)
    expect(concept.color).toBe(LANDING_SPECIMENS[3].color)
    expect(concept).toEqual(normalizeConfig(concept))
  })

  it('is the very design the page draws while the wall is untouched, so its chips are cache hits', () => {
    expect(conceptConfig(START)).toEqual(landingConfig(START))
    const recolored = step(START, { type: 'color', hex: '#D7263D' })
    expect(conceptConfig(recolored)).toEqual(landingConfig(recolored))
  })

  it('always shows a cut on both edges, even when the visitor sized a wall that divides exactly', () => {
    const exact = step(START, { type: 'example', index: 2 })
    expect(planOf(exact).exact).toBe(true)
    const corner = cornerDetail(landingPlan(conceptConfig(exact)))
    expect(corner.placements).toHaveLength(4)
    expect(corner.pieces.map((piece) => [piece.mark, piece.kind])).toEqual([
      ['A', 'full'],
      ['B', 'edge'],
      ['C', 'edge'],
      ['D', 'corner'],
    ])
    expect([corner.fullCount, corner.partialCount]).toEqual([1, 3])
  })
})
