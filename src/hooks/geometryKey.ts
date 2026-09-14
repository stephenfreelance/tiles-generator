import type { CropRect, DesignConfig, PieceSpec } from '@/core/types'

/**
 * Stable key of everything that shapes a piece's relief or mesh. Name, color, printer, units and
 * the surface are left out on purpose (the surface reaches meshes only through the pieces), so
 * changing them never rebuilds geometry.
 */
export function geometryKey(config: DesignConfig): string {
  const { tile, bevel, texture, layout } = config
  const params = Object.keys(texture.params)
    .sort()
    .map((key) => [key, texture.params[key]])
  return JSON.stringify([
    tile.width,
    tile.height,
    tile.thickness,
    bevel,
    // The height field is periodic over the running-bond cycle, so the row offset shapes the relief.
    layout.rowOffset,
    texture.id,
    texture.depth,
    texture.scale,
    texture.seed,
    texture.invert,
    texture.rotate,
    params,
  ])
}

/** Piece ids encode their crop; the size guards against a tile resize that keeps the id "full". */
export const piecesKey = (pieces: PieceSpec[]): string => pieces.map((p) => `${p.id}:${p.width}x${p.height}`).join(',')

export const cropKey = (crop?: CropRect): string => (crop ? `${crop.x0},${crop.y0},${crop.x1},${crop.y1}` : 'full')
