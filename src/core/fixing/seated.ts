// The printed parts as they sit in one piece: the clips in their pockets and the keys in their notches,
// for the single tile's Back view and the drawing of a tile's back. Built from the same sites the pockets
// are cut at (clipSites, keyNotchSites), so a part always sits in a pocket the tile really has.
// Pure maths: no DOM, no three.

import type { DesignConfig, PieceSpec } from '../types'
import { clipsPossible } from './capability'
import { keyGeometry, keyNotchSites, wallKeySpec } from './joins'
import { clipSites, clipSpec } from './mount'

export interface SeatedPart {
  kind: 'clip' | 'key'
  /** Accessory id of the part as the download holds it (the clip or key spec at the design's fit). */
  accessoryId: string
  /**
   * Where the part's centre goes, piece-local mm: the middle of its mesh's bounding box as printed
   * (buildClipMesh and buildKeyMesh lay it from the origin), turned by `turns` about that middle.
   */
  x: number
  y: number
  /** Height of the part's bottom face in the tile frame (the tile's back is z = 0), mm. */
  z: number
  /** Quarter turns about z applied to the part as printed (its own x along the piece's x at 0). */
  turns: 0 | 1 | 2 | 3
}

/**
 * The keys and clips as they sit in one piece: each clip clicked into its pocket, its stops on the pocket's
 * ceiling and its back level with the tile's back (on the wall or off it: the stops set that, not the tape),
 * and each key half in its notch and half out past the side, pressed home against the notch's ceiling, as
 * keys go in before the next tile goes up.
 * A key is centred on the middle of the joint beyond its side, so it reaches as far into the neighbour as
 * into this piece. Empty for a glued design without keys, and for a piece with no pocket.
 */
export function seatedParts(config: DesignConfig, piece: Pick<PieceSpec, 'crop' | 'width' | 'height' | 'edges'>): SeatedPart[] {
  const parts: SeatedPart[] = []
  if (clipsPossible(config)) {
    const accessoryId = clipSpec(config.fit).id
    for (const s of clipSites(config, piece)) parts.push({ kind: 'clip', accessoryId, x: s.x, y: s.y, z: 0, turns: s.axis === 'h' ? 0 : 1 })
  }
  const key = wallKeySpec(config)
  const g = keyGeometry(config)
  if (key && g) {
    const z = Math.round((g.depth - g.thickness) * 100) / 100
    const half = config.joint / 2
    for (const { side, along } of keyNotchSites(config, piece)) {
      // The key's own x runs across the joint: along x for the left and right sides, a quarter turn for the others.
      const [x, y] =
        side === 0 ? [along, -half] : side === 1 ? [piece.width + half, along] : side === 2 ? [along, piece.height + half] : [-half, along]
      parts.push({ kind: 'key', accessoryId: key.id, x, y, z, turns: side === 1 || side === 3 ? 0 : 1 })
    }
  }
  return parts
}
