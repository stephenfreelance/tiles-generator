import type { HeightField } from '../textures/types'
import type { DesignConfig, PieceSpec } from '../types'

type PieceRect = Pick<PieceSpec, 'crop' | 'width' | 'height'>

/** Chamfer size actually applied: never more than half the base plate, so the bevel keeps a solid base. */
export function effectiveBevel(config: DesignConfig): number {
  return Math.max(0, Math.min(config.bevel, config.tile.thickness / 2))
}

/**
 * The 45° chamfer shared by the mesh builder, the normal-map baker and the chip renderer.
 * `z` is the unbevelled top height, `d` the distance to the nearest piece edge. The cut follows the
 * local surface so the rim always drops by the full chamfer: measured from the deepest possible relief
 * instead, a flat or shallow texture would come out with no chamfer at all.
 */
export function applyBevel(z: number, d: number, thickness: number, bevel: number): number {
  if (bevel <= 0 || d >= bevel) return z
  const capped = z - (bevel - d)
  // Outside the piece (d < 0, central differences at the rim) the chamfer keeps its slope.
  return d >= 0 ? Math.max(capped, thickness - bevel) : capped
}

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

/** Top-surface z (mm, from the bottom face) of a piece at piece-local (x, y), bevel included. */
export function pieceTopSampler(
  config: DesignConfig,
  field: HeightField,
  piece: PieceRect,
): (x: number, y: number) => number {
  const { crop, width, height } = piece
  const thickness = config.tile.thickness
  const bevel = effectiveBevel(config)
  const px = field.periodX
  const py = field.periodY
  return (x, y) => {
    const h = field(patternCoord(x, width, crop.x0, crop.x1, px), patternCoord(y, height, crop.y0, crop.y1, py))
    return applyBevel(thickness + h, edgeDistance(x, y, width, height), thickness, bevel)
  }
}
