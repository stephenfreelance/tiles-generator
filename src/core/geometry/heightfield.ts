import type { HeightField } from '../textures/types'
import type { DesignConfig, PieceEdges, PieceSpec } from '../types'
import { topShaper } from './profiles'

// The chamfer helpers moved to profiles.ts with the other edge shapes; kept here for their callers.
export { applyBevel, effectiveBevel } from './profiles'

/** The rectangle a sampler covers, and how it meets the surface edge (absent: an interior piece). */
export type PieceRect = Pick<PieceSpec, 'crop' | 'width' | 'height'> & { edges?: PieceEdges }

/** Distance from piece-local (x, y) to the nearest edge of a width x height piece. */
export function edgeDistance(x: number, y: number, width: number, height: number): number {
  return Math.min(x, width - x, y, height - y)
}

/** Positive modulo that maps exactly one period onto 0, so opposite tile edges sample the same value. */
function wrap(v: number, period: number): number {
  if (!(period > 0)) return v
  const r = v - Math.floor(v / period) * period
  return r >= period ? 0 : r
}

/**
 * Pattern coordinate of a piece-local position. The far edge maps to the crop's own x1/y1 (not x0 + width,
 * which can differ by rounding) and everything wraps into one period, so joints are bit-identical.
 */
export function patternCoord(local: number, size: number, c0: number, c1: number, period: number): number {
  return wrap(local === size ? c1 : c0 + local, period)
}

/**
 * Top-surface z (mm, from the bottom face) of a piece at piece-local (x, y): the relief on the plate,
 * shaped by the joint edge and, on a border piece, the perimeter profile.
 */
export function pieceTopSampler(config: DesignConfig, field: HeightField, piece: PieceRect): (x: number, y: number) => number {
  const { crop, width, height } = piece
  const thickness = config.tile.thickness
  const shape = topShaper(config, piece.edges)
  const px = field.periodX
  const py = field.periodY
  return (x, y) => {
    const h = field(patternCoord(x, width, crop.x0, crop.x1, px), patternCoord(y, height, crop.y0, crop.y1, py))
    return shape(thickness + h, y, width - x, height - y, x)
  }
}
