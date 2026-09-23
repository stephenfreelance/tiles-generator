// Everything the mesher builds into the back of a piece: key notches or the tab and socket pair on its
// interior sides, and clip pockets for the wall.
import type { DesignConfig, PieceSpec } from '../types'
import { keyPockets } from './joins'
import { clipPockets } from './mount'
import { tabFeatures } from './tabs'
import type { BackFeature } from './types'

/**
 * Key pockets or the tab and socket pair (whichever lock is on), and clip pockets (mount on clips), for one
 * piece, in piece-local mm. A pure function of the config and the piece's crop, size and edges, so two
 * placements of one piece id always get the same features. Empty when the design has no fixing, or the plate
 * is too thin to hold them. Only the tab stands outside the piece's footprint; everything else is cut into it.
 */
export function pieceFeatures(
  config: DesignConfig,
  piece: Pick<PieceSpec, 'crop' | 'width' | 'height' | 'edges'>,
): BackFeature[] {
  return [...keyPockets(config, piece), ...tabFeatures(config, piece), ...clipPockets(config, piece)]
}
