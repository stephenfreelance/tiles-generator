// The shade a plate is printed with, handed from its sheet to everything drawn on it: the shade filters
// by softness and the fades that grade a shape's shade across it.
import { createContext, useContext } from 'react'

/** Which way a fade of shade grows denser across the shape it fills; a pool is densest at its middle. */
export type FadeTo = 'right' | 'left' | 'down' | 'up' | 'pool'

export const FADES: Record<Exclude<FadeTo, 'pool'>, { x1: number; y1: number; x2: number; y2: number }> = {
  right: { x1: 0, y1: 0, x2: 1, y2: 0 },
  left: { x1: 1, y1: 0, x2: 0, y2: 0 },
  down: { x1: 0, y1: 0, x2: 0, y2: 1 },
  up: { x1: 0, y1: 1, x2: 0, y2: 0 },
}

/** The filters a plate's shade is printed through, by softness, and the fades that grade it. */
export interface SceneShade {
  /** Every shadow a plate's things throw on the wall, the tiles and the floor, in one layer. */
  cast: string
  /** The shade on a thing's own curved or turned-away face, with a crisper edge. */
  form: string
  /** Gradients from nothing to full density across a shape's own box, by the way they grow. */
  fades: Record<FadeTo, string>
}

export const SceneContext = createContext<SceneShade | null>(null)

/**
 * A fill for a shape inside a Shade that grows from nothing to full density across the shape's own box:
 * the shade pales toward the light, so a cushion or a pot is modelled rather than stained.
 */
export function useFade(to: FadeTo): string {
  const shade = useContext(SceneContext)
  return shade ? `url(#${shade.fades[to]})` : 'none'
}
