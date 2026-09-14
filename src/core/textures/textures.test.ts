import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../config'
import type { DesignConfig, RowOffset } from '../types'
import { rowShiftCycle } from '../layout'
import { renderReliefChip } from './hillshade'
import { mulberry32 } from './noise'
import { createHeightField, DEFAULT_TEXTURE_ID, resolveParams, TEXTURES, textureById } from './registry'
import type { TextureDef } from './types'

const TILES = [
  { width: 150, height: 150 },
  { width: 200, height: 100 },
  { width: 97, height: 143 },
]
const ROW_OFFSETS: RowOffset[] = [0, 0.5, 0.3333]
/** Seam tolerance from the brief: two neighbouring tiles must agree to well under a layer height. */
const SEAM_TOLERANCE_MM = 0.02
/** How far inside the edge the "just before the seam" sample sits. */
const EPS_MM = 0.001

interface Variant {
  label: string
  config: DesignConfig
}

function variantsFor(def: TextureDef, rng: () => number): Variant[] {
  const variants: Variant[] = []
  for (const tile of TILES) {
    for (const rowOffset of ROW_OFFSETS) {
      for (const rotate of [false, true]) {
        const params: Record<string, number> = {}
        for (const p of def.params) params[p.key] = p.min + rng() * (p.max - p.min)
        variants.push({
          label: `${tile.width}x${tile.height} offset ${rowOffset}${rotate ? ' rotated' : ''}`,
          config: {
            ...DEFAULT_CONFIG,
            tile: { ...DEFAULT_CONFIG.tile, width: tile.width, height: tile.height },
            layout: { ...DEFAULT_CONFIG.layout, rowOffset },
            texture: {
              id: def.id,
              depth: def.defaults.depth,
              scale: def.defaults.scale,
              params,
              seed: 1 + Math.floor(rng() * 900),
              invert: false,
              rotate,
            },
          },
        })
      }
    }
  }
  return variants
}

describe('texture catalog', () => {
  it('is ordered, marked T-01.. and free of duplicate ids', () => {
    expect(TEXTURES).toHaveLength(23)
    const ids = new Set<string>()
    TEXTURES.forEach((def, index) => {
      expect(def.mark).toBe(`T-${String(index + 1).padStart(2, '0')}`)
      expect(ids.has(def.id)).toBe(false)
      ids.add(def.id)
    })
    expect(TEXTURES.slice(0, 7).map((t) => t.id)).toEqual([
      'plane',
      'wavy',
      'stripes',
      'coral',
      'herringbone',
      'fluted',
      'zellige',
    ])
    for (const def of TEXTURES.slice(0, 7)) expect(def.category).toBe('essential')
    for (const def of TEXTURES.slice(7)) expect(def.category).not.toBe('essential')
  })

  it('keeps every texture inside the contract: 4 params or fewer, sane ranges', () => {
    for (const def of TEXTURES) {
      expect(def.params.length, def.id).toBeLessThanOrEqual(4)
      expect(def.cellAspect, def.id).toBeGreaterThan(0)
      const [sMin, sMax] = def.scaleRange
      const [dMin, dMax] = def.depthRange
      expect(sMin, def.id).toBeLessThan(sMax)
      expect(dMin, def.id).toBeLessThanOrEqual(dMax)
      expect(def.defaults.scale, def.id).toBeGreaterThanOrEqual(sMin)
      expect(def.defaults.scale, def.id).toBeLessThanOrEqual(sMax)
      expect(def.defaults.depth, def.id).toBeGreaterThanOrEqual(dMin)
      expect(def.defaults.depth, def.id).toBeLessThanOrEqual(dMax)
      for (const p of def.params) {
        expect(p.min, `${def.id}.${p.key}`).toBeLessThan(p.max)
        expect(p.default, `${def.id}.${p.key}`).toBeGreaterThanOrEqual(p.min)
        expect(p.default, `${def.id}.${p.key}`).toBeLessThanOrEqual(p.max)
        expect(p.step, `${def.id}.${p.key}`).toBeGreaterThan(0)
        expect(p.label.length, `${def.id}.${p.key}`).toBeGreaterThan(0)
        // The global feature size and depth replace these two, so no texture may expose them.
        expect(['scale', 'depth', 'pitch'].includes(p.key), `${def.id}.${p.key}`).toBe(false)
      }
    }
  })

  it('falls back to the default texture for an unknown id', () => {
    expect(textureById('nope').id).toBe(DEFAULT_TEXTURE_ID)
    expect(textureById('').id).toBe(DEFAULT_TEXTURE_ID)
    expect(textureById('wavy').id).toBe('wavy')
    expect(TEXTURES.some((t) => t.id === DEFAULT_TEXTURE_ID)).toBe(true)
  })
})

describe('resolveParams', () => {
  const def = textureById('stripes')

  it('fills defaults for missing keys and drops unknown ones', () => {
    const resolved = resolveParams(def, { nonsense: 5 })
    expect(Object.keys(resolved).sort()).toEqual(def.params.map((p) => p.key).sort())
    for (const p of def.params) expect(resolved[p.key]).toBe(p.default)
  })

  it('clamps values into the declared range', () => {
    const duty = def.params.find((p) => p.key === 'duty')as NonNullable<ReturnType<typeof def.params.find>>
    expect(resolveParams(def, { duty: 99 }).duty).toBe(duty.max)
    expect(resolveParams(def, { duty: -99 }).duty).toBe(duty.min)
    expect(resolveParams(def, { duty: Number.NaN }).duty).toBe(duty.default)
  })
})

describe.each(TEXTURES.map((def) => [def.mark, def.id, def] as const))('%s %s', (_mark, id, def) => {
  const rng = mulberry32(0xbeef)
  const variants = variantsFor(def, rng)

  it('stays in [0, depth] with no NaN, at every tile size and rotation', () => {
    for (const { label, config } of variants) {
      const field = createHeightField(config)
      const depth = config.texture.depth
      for (let iy = 0; iy < 21; iy++) {
        for (let ix = 0; ix < 21; ix++) {
          const x = (ix / 20) * config.tile.width
          const y = (iy / 20) * config.tile.height
          const h = field(x, y)
          expect(Number.isFinite(h), `${id} ${label} at ${x},${y}`).toBe(true)
          expect(h, `${id} ${label} at ${x},${y}`).toBeGreaterThanOrEqual(0)
          expect(h, `${id} ${label} at ${x},${y}`).toBeLessThanOrEqual(depth + 1e-9)
        }
      }
      // Sampling outside the tile wraps, which is what lets a cut piece continue its neighbour.
      expect(field(config.tile.width + 3.5, 7)).toBeCloseTo(field(3.5, 7), 10)
      expect(field(-4, config.tile.height + 2)).toBeCloseTo(field(field.periodX - 4, 2), 10)
    }
  })

  it('joins itself across both tile edges and across a running-bond joint', () => {
    for (const { label, config } of variants) {
      const field = createHeightField(config)
      const { periodX, periodY } = field
      const shift = periodX * (rowShiftCycle(config.layout.rowOffset) > 1 ? 1 : 0)
      let worstX = 0
      let worstY = 0
      let worstBond = 0
      for (let i = 0; i < 41; i++) {
        const y = (i / 40) * config.tile.height
        const x = (i / 40) * config.tile.width
        worstX = Math.max(worstX, Math.abs(field(0, y) - field(periodX - EPS_MM, y)))
        worstY = Math.max(worstY, Math.abs(field(x, 0) - field(x, periodY - EPS_MM)))
        // A shifted row meets the row below across the same horizontal joint.
        worstBond = Math.max(worstBond, Math.abs(field(x + shift, 0) - field(x, periodY - EPS_MM)))
      }
      expect(worstX, `${id} ${label} vertical seam`).toBeLessThan(SEAM_TOLERANCE_MM)
      expect(worstY, `${id} ${label} horizontal seam`).toBeLessThan(SEAM_TOLERANCE_MM)
      expect(worstBond, `${id} ${label} running-bond joint`).toBeLessThan(SEAM_TOLERANCE_MM)
    }
  })

  it('is deterministic for a fixed seed and responds to invert', () => {
    const config = variants[0].config
    const a = createHeightField(config)
    const b = createHeightField(config)
    const inverted = createHeightField({
      ...config,
      texture: { ...config.texture, invert: true },
    })
    for (let i = 0; i < 64; i++) {
      const x = (i * 7.31) % config.tile.width
      const y = (i * 11.17) % config.tile.height
      expect(b(x, y)).toBe(a(x, y))
      expect(inverted(x, y)).toBeCloseTo(config.texture.depth - a(x, y), 9)
    }
  })
})

describe('createHeightField', () => {
  it('derives integer repeats, halves the period for a running bond and swaps axes when rotated', () => {
    const base: DesignConfig = {
      ...DEFAULT_CONFIG,
      tile: { ...DEFAULT_CONFIG.tile, width: 200, height: 100 },
      texture: { ...DEFAULT_CONFIG.texture, id: 'stripes', scale: 20 },
    }
    const straight = createHeightField(base)
    expect(straight.periodX).toBe(200)
    expect(straight.periodY).toBe(100)
    expect(Number.isInteger(straight.repeatsX)).toBe(true)
    expect(straight.repeatsX).toBe(10)
    expect(straight.repeatsY).toBe(5)

    const bond = createHeightField({ ...base, layout: { ...base.layout, rowOffset: 0.5 } })
    expect(bond.periodX).toBe(100)
    expect(bond.repeatsX).toBe(5)

    const third = createHeightField({ ...base, layout: { ...base.layout, rowOffset: 0.3333 } })
    expect(third.periodX).toBeCloseTo(200 / 3, 9)

    const rotated = createHeightField({ ...base, texture: { ...base.texture, rotate: true } })
    expect(rotated.periodX).toBe(200)
    expect(rotated.periodY).toBe(100)
    // Stripes at 0° run across the pattern's own x axis, which a quarter turn maps onto tile y.
    expect(Math.abs(straight(0, 5) - straight(10, 5))).toBeGreaterThan(0)
    expect(Math.abs(straight(5, 0) - straight(5, 10))).toBe(0)
    expect(Math.abs(rotated(5, 0) - rotated(5, 10))).toBeGreaterThan(0)
    expect(Math.abs(rotated(0, 5) - rotated(10, 5))).toBe(0)

    // A quarter turn also swaps which axis the cell aspect stretches (hexagons are sqrt3 tall).
    const hex = createHeightField({ ...base, texture: { ...base.texture, id: 'honeycomb', scale: 25 } })
    const hexRotated = createHeightField({
      ...base,
      texture: { ...base.texture, id: 'honeycomb', scale: 25, rotate: true },
    })
    expect(hex.repeatsX).toBe(8)
    expect(hex.repeatsY).toBe(2)
    expect(hexRotated.repeatsX).toBe(5)
    expect(hexRotated.repeatsY).toBe(4)
  })

  it('gives the parity patterns an even repeat count on the alternating axis', () => {
    const config: DesignConfig = {
      ...DEFAULT_CONFIG,
      tile: { ...DEFAULT_CONFIG.tile, width: 150, height: 150 },
      texture: { ...DEFAULT_CONFIG.texture, id: 'basketweave', scale: 43 },
    }
    const weave = createHeightField(config)
    expect(weave.repeatsX % 2).toBe(0)
    expect(weave.repeatsY % 2).toBe(0)
    const scales = createHeightField({
      ...config,
      texture: { ...config.texture, id: 'fish-scale', scale: 41 },
    })
    expect(scales.repeatsY % 2).toBe(0)
  })

  it('never drops below one repeat, even for an absurd feature size', () => {
    const field = createHeightField({
      ...DEFAULT_CONFIG,
      texture: { ...DEFAULT_CONFIG.texture, id: 'honeycomb', scale: 200 },
    })
    expect(field.repeatsX).toBeGreaterThanOrEqual(1)
    expect(field.repeatsY).toBeGreaterThanOrEqual(1)
  })

  it('falls back to the default texture when the id is unknown', () => {
    const field = createHeightField({
      ...DEFAULT_CONFIG,
      texture: { ...DEFAULT_CONFIG.texture, id: 'does-not-exist' },
    })
    const expected = createHeightField({
      ...DEFAULT_CONFIG,
      texture: { ...DEFAULT_CONFIG.texture, id: DEFAULT_TEXTURE_ID },
    })
    expect(field(13, 27)).toBe(expected(13, 27))
  })
})

describe('renderReliefChip', () => {
  it('renders an opaque square chip for a full tile', () => {
    const chip = renderReliefChip(DEFAULT_CONFIG, { sizePx: 96 })
    expect(chip.width).toBe(96)
    expect(chip.height).toBe(96)
    expect(chip.data).toHaveLength(96 * 96 * 4)
    let opaque = 0
    let lit = 0
    for (let i = 0; i < chip.data.length; i += 4) {
      if (chip.data[i + 3] === 255) opaque++
      if (chip.data[i] > 0) lit++
    }
    expect(opaque).toBe(96 * 96)
    expect(lit).toBeGreaterThan(0)
  })

  it('keeps the aspect of a cut piece and leaves the rest transparent', () => {
    const chip = renderReliefChip(DEFAULT_CONFIG, {
      sizePx: 120,
      crop: { x0: 0, y0: 0, x1: 150, y1: 60 },
    })
    let opaque = 0
    for (let i = 3; i < chip.data.length; i += 4) if (chip.data[i] > 0) opaque++
    const expected = 120 * Math.round((60 / 150) * 120)
    expect(opaque).toBeGreaterThan(expected * 0.9)
    expect(opaque).toBeLessThan(expected * 1.1)
  })

  it('renders every texture without a NaN pixel', () => {
    for (const def of TEXTURES) {
      const chip = renderReliefChip(
        {
          ...DEFAULT_CONFIG,
          texture: {
            ...DEFAULT_CONFIG.texture,
            id: def.id,
            depth: def.defaults.depth,
            scale: def.defaults.scale,
          },
        },
        { sizePx: 48 },
      )
      for (let i = 0; i < chip.data.length; i++) {
        if (!Number.isFinite(chip.data[i])) throw new Error(`${def.id} produced a non-finite pixel`)
      }
    }
  })
})

describe('T-13 coral wood', () => {
  const def = textureById('coral-wood')

  const configWith = (params: Record<string, number>): DesignConfig => ({
    ...DEFAULT_CONFIG,
    tile: { ...DEFAULT_CONFIG.tile, width: 150, height: 150 },
    texture: {
      id: def.id,
      depth: def.defaults.depth,
      scale: def.defaults.scale,
      params,
      seed: 1,
      invert: false,
      rotate: false,
    },
  })

  /** Every height over one tile, sorted. Grain off: it is surface detail on top of the scoops. */
  const heights = (variation: number): number[] => {
    const field = createHeightField(configWith({ variation, grain: 0 }))
    const out: number[] = []
    const n = 300
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) out.push(field(((i + 0.5) / n) * 150, ((j + 0.5) / n) * 150))
    }
    return out.sort((a, b) => a - b)
  }

  it('keeps the identity the catalog is indexed by', () => {
    expect(TEXTURES[12].id).toBe('coral-wood')
    expect(def.mark).toBe('T-13')
    expect(def.name).toBe('Coral wood')
  })

  it('exposes the four carving controls', () => {
    expect(def.params.map((p) => p.key)).toEqual(['size', 'variation', 'ridge', 'grain'])
    const byKey = Object.fromEntries(def.params.map((p) => [p.key, p]))
    expect(byKey.size.default).toBeCloseTo(0.66, 6)
    expect(byKey.variation.default).toBeCloseTo(0.65, 6)
    expect(byKey.ridge.default).toBeCloseTo(0.3, 6)
    expect(byKey.grain.default).toBeCloseTo(0.45, 6)
  })

  it('cuts shallow against the width of one scoop', () => {
    // A gouge leaves a broad dish, not a dimple, so the relief stays small next to the spacing.
    expect(def.defaults.depth / def.defaults.scale).toBeLessThan(0.2)
  })

  it('lifts the field off the base as the cuts get uneven', () => {
    // Every point takes the LOWEST cut over it, which hides variation that is independent scoop to
    // scoop: the deepest of the cuts meeting at a rim comes out much the same wherever you look, so
    // the rims stay level and the surface reads as one honeycomb. Only a plunge that drifts across
    // the board survives that minimum. This is the property that regressed repeatedly, so it is
    // pinned here: uneven cuts must visibly raise the body of the field, not just jitter it.
    const even = heights(0)
    const uneven = heights(0.7)
    const median = (v: number[]): number => v[Math.floor(0.5 * v.length)]
    expect(median(uneven)).toBeGreaterThan(median(even) * 1.2)
    // ...and the deepest cut still reaches the base of the relief at either setting.
    expect(even[0]).toBeLessThan(def.defaults.depth * 0.1)
  })
})

describe('sampling speed', () => {
  it('samples a 600x600 grid of every texture and reports the cost', () => {
    const size = 600
    const rows: string[] = []
    let slowest = 0
    for (const def of TEXTURES) {
      const config: DesignConfig = {
        ...DEFAULT_CONFIG,
        texture: {
          ...DEFAULT_CONFIG.texture,
          id: def.id,
          depth: def.defaults.depth,
          scale: def.defaults.scale,
        },
      }
      const field = createHeightField(config)
      const { width, height } = config.tile
      // Warm the JIT so the reported number is the steady-state cost.
      for (let i = 0; i < 2000; i++) field((i * 0.37) % width, (i * 0.71) % height)
      const start = performance.now()
      let sink = 0
      for (let iy = 0; iy < size; iy++) {
        const y = (iy / size) * height
        for (let ix = 0; ix < size; ix++) {
          sink += field((ix / size) * width, y)
        }
      }
      const ms = performance.now() - start
      expect(Number.isFinite(sink)).toBe(true)
      const ns = (ms * 1e6) / (size * size)
      slowest = Math.max(slowest, ns)
      rows.push(`${def.mark} ${def.id.padEnd(16)} ${ms.toFixed(1).padStart(7)} ms  ${ns.toFixed(0).padStart(4)} ns/sample`)
    }
    console.log(`\n600x600 samples per texture\n${rows.join('\n')}\n`)
    // A generous ceiling: the point of the assertion is to catch a pathological regression.
    expect(slowest).toBeLessThan(1000)
  })
})
