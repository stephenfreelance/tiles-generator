import { perimeterBand } from '@/core/geometry/profiles'
import type { CropRect, DesignConfig, PieceSpec } from '@/core/types'

/**
 * Stable key of everything that shapes a piece's relief or mesh. Name, color, printer, units and
 * the surface are left out on purpose (the surface reaches meshes only through the pieces), so
 * changing them never rebuilds geometry.
 */
export function geometryKey(config: DesignConfig): string {
  const { tile, bevel, jointEdge, perimeter, lock, mount, texture, layout } = config
  const params = Object.keys(texture.params)
    .sort()
    .map((key) => [key, texture.params[key]])
  return JSON.stringify([
    tile.width,
    tile.height,
    tile.thickness,
    bevel,
    jointEdge,
    // The perimeter shapes the border pieces; the lock and the clips cut into the back.
    // The resolved band too: on a small surface it is narrowed to fit, which the surface alone would not say.
    perimeter.profile === 'none' ? null : [perimeter, perimeterBand(config)],
    lock,
    // With keys the joint places the notches (a running bond spaces them by the pitch) and the clip pockets
    // keep clear of them; with tabs it is how far a tab reaches across. Unlocked, no pocket reads it.
    lock === 'none' ? null : config.joint,
    // The one clearance that lives in a tile: a socket is cut into the plate, so Fit reshapes every tabbed
    // tile. Keys and clips carry theirs on the printed part, which is why the fit is left out for them.
    lock === 'tabs' ? config.fit : null,
    mount,
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

/** Piece ids encode their crop and edges; the size guards against a tile resize that keeps the id "full". */
export const piecesKey = (pieces: PieceSpec[]): string => pieces.map((p) => `${p.id}:${p.width}x${p.height}`).join(',')

export const cropKey = (crop?: CropRect): string => (crop ? `${crop.x0},${crop.y0},${crop.x1},${crop.y1}` : 'full')
