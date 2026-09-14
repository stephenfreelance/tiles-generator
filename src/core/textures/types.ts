// Contract between the texture registry, the mesh builder, the preview and the chip renderer.

export type TextureCategory = 'essential' | 'linear' | 'geometric' | 'organic'

export interface ParamDef {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
  /** Unit suffix shown next to the value ("mm", "°", "%"), if any. */
  unit?: string
  /** One short sentence shown as help text. */
  hint?: string
}

/** Everything a pattern needs to build its sampler for one resolved design. */
export interface TextureContext {
  /** Integer number of pattern repeats across one period, per axis. */
  repeatsX: number
  repeatsY: number
  /** Size of one period in mm (the tile, or a fraction of it for running bonds). */
  periodMm: [number, number]
  /** Texture parameters with defaults filled in. */
  params: Record<string, number>
  seed: number
}

/**
 * A pattern sampler over ONE period: u, v in [0, 1) (values outside wrap), returns a height in
 * [0, 1]. It must be exactly periodic with period 1 in u and in v, which is what makes every
 * tile edge meet its neighbour, and it should have no step sharper than ~0.3 mm once scaled.
 */
export type PatternSampler = (u: number, v: number) => number

export interface TextureDef {
  id: string
  /** Catalog mark on the sample chip, "T-01".. */
  mark: string
  name: string
  category: TextureCategory
  /** One sentence for the chip tooltip and the schedule. */
  blurb: string
  /** Relief depth (mm) and feature size (mm) the texture looks best at. */
  defaults: { depth: number; scale: number }
  scaleRange: [number, number]
  depthRange: [number, number]
  params: ParamDef[]
  /** The pattern has a direction, so a quarter-turn changes it. */
  directional: boolean
  /** The pattern uses the seed (noise), so "shuffle" is meaningful. */
  seeded: boolean
  /** Height / width of one repeat cell; hexagons need √3, most patterns 1. */
  cellAspect: number
  create(ctx: TextureContext): PatternSampler
}

/**
 * Resolved relief for a design, in tile-local millimetres (0..tile.width, 0..tile.height).
 * Returns the height ABOVE the base plate in [0, depth]; bevels are not included (the mesh
 * builder applies them per piece). Periodic with (periodX, periodY), so a cut piece sampled
 * at its crop coordinates carries exactly the pattern of the tile it replaces.
 */
export interface HeightField {
  (xMm: number, yMm: number): number
  periodX: number
  periodY: number
  depth: number
  repeatsX: number
  repeatsY: number
}
