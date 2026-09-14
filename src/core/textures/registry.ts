// The texture catalog and the one function the rest of the app calls: createHeightField.

import { rowShiftCycle } from '../layout'
import type { DesignConfig } from '../types'
import { coral } from './patterns/coral'
import { coralWood } from './patterns/coralWood'
import { plane, stripes, wavy } from './patterns/essentials'
import { dotsBubbles, honeycomb, tumblingBlocks } from './patterns/hexLattice'
import { arches, diamondQuilted, moroccanStar } from './patterns/panels'
import { chevron, herringbone } from './patterns/parquet'
import { fluted, reeded } from './patterns/ribs'
import { fishScale } from './patterns/scallops'
import { terrazzo, voronoiStone } from './patterns/stone'
import { duneWave, oceanWater } from './patterns/waterDunes'
import { basketweave, knit } from './patterns/weave'
import { zellige } from './patterns/zellige'
import type { HeightField, TextureDef } from './types'

export const DEFAULT_TEXTURE_ID = 'wavy'

/** Catalog order is chip order and mark order (T-01..): essentials first, then linear, organic, geometric. */
export const TEXTURES: TextureDef[] = [
  plane,
  wavy,
  stripes,
  coral,
  herringbone,
  fluted,
  zellige,
  reeded,
  oceanWater,
  duneWave,
  voronoiStone,
  terrazzo,
  coralWood,
  chevron,
  honeycomb,
  basketweave,
  fishScale,
  arches,
  diamondQuilted,
  tumblingBlocks,
  knit,
  dotsBubbles,
  moroccanStar,
]

const BY_ID = new Map(TEXTURES.map((t) => [t.id, t]))

export function textureById(id: string): TextureDef {
  return BY_ID.get(id) ?? (BY_ID.get(DEFAULT_TEXTURE_ID) as TextureDef)
}

/**
 * Patterns that alternate cell by cell only repeat after two cells, so their repeat count on that
 * axis has to be even or the tile would meet its neighbour out of phase. Keyed by texture id
 * because TextureDef is a read-only contract owned by the lead.
 */
const EVEN_REPEATS: Record<string, { x?: boolean; y?: boolean }> = {
  basketweave: { x: true, y: true },
  'fish-scale': { y: true },
  arches: { y: true },
}

/** Defaults filled in, every value clamped to its ParamDef range, unknown keys dropped. */
export function resolveParams(def: TextureDef, params: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of def.params) {
    const raw = params[p.key]
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : p.default
    out[p.key] = Math.min(p.max, Math.max(p.min, value))
  }
  return out
}

const clampTo = (v: number, range: [number, number]): number => Math.min(range[1], Math.max(range[0], v))

/** Nearest even count, never below 2. */
const toEven = (n: number): number => Math.max(2, 2 * Math.round(n / 2))

const repeatsFor = (lengthMm: number, featureMm: number, aspect: number): number =>
  Math.max(1, Math.round(lengthMm / Math.max(featureMm * aspect, 0.5)))

/**
 * Resolved relief for a design, in tile-local millimetres, periodic over
 * (tile.width / rowShiftCycle, tile.height) so a running bond still meets itself at every joint.
 * Depth comes straight from the config (the mesh builder's bevel formula uses the same number);
 * depthRange on a TextureDef is advice for the UI, not a clamp applied here.
 */
export function createHeightField(config: DesignConfig): HeightField {
  const def = textureById(config.texture.id)
  const params = resolveParams(def, config.texture.params)
  const cycle = rowShiftCycle(config.layout.rowOffset)
  const periodX = config.tile.width / cycle
  const periodY = config.tile.height
  const scale = clampTo(config.texture.scale, def.scaleRange)
  const rotate = config.texture.rotate
  const invert = config.texture.invert
  const depth = config.texture.depth

  // A quarter turn swaps which tile axis the pattern's own x axis runs along, so the period, the
  // repeat derivation and the even-count rule all swap with it.
  const patternPeriodX = rotate ? periodY : periodX
  const patternPeriodY = rotate ? periodX : periodY
  let repeatsX = repeatsFor(patternPeriodX, scale, 1)
  let repeatsY = repeatsFor(patternPeriodY, scale, def.cellAspect)
  const even = EVEN_REPEATS[def.id]
  if (even?.x) repeatsX = toEven(repeatsX)
  if (even?.y) repeatsY = toEven(repeatsY)

  const sampler = def.create({
    repeatsX,
    repeatsY,
    periodMm: [patternPeriodX, patternPeriodY],
    params,
    seed: config.texture.seed,
  })

  const field = ((xMm: number, yMm: number): number => {
    let u = (xMm % periodX) / periodX
    let v = (yMm % periodY) / periodY
    if (u < 0) u += 1
    if (v < 0) v += 1
    // A quarter turn maps (u, v) to (v, -u); the plain transpose would mirror chiral patterns.
    const h = rotate ? sampler(v, u === 0 ? 0 : 1 - u) : sampler(u, v)
    const clamped = h < 0 ? 0 : h > 1 ? 1 : h
    return (invert ? 1 - clamped : clamped) * depth
  }) as HeightField

  field.periodX = periodX
  field.periodY = periodY
  field.depth = depth
  // Reported in tile axes, which is what the mesh builder and the plan care about.
  field.repeatsX = rotate ? repeatsY : repeatsX
  field.repeatsY = rotate ? repeatsX : repeatsY
  return field
}
