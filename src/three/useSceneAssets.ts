import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type * as THREE from 'three'
import type { PieceSpec } from '@/core/types'
import type { PreviewPiece } from '@/workers/protocol'
import { buildPieceAssets, disposePieceAssets, type PieceAssets } from './geometry'
import type { Tier } from './look'
import { MaterialLibrary, materialRecipe, type TileMaterialSet } from './materials'

/** Geometries and baked normal maps for the pieces on screen; replaced sets are disposed. */
export function usePieceAssets(
  preview: ReadonlyMap<string, PreviewPiece>,
  pieces: readonly PieceSpec[],
  tileWidth: number,
  tileHeight: number,
  /** How far a tab stands out past its piece (meshMatchesPiece): 0 on a wall that cuts none. */
  tabGrow = 0,
): Map<string, PieceAssets> {
  const assets = useMemo(
    () => buildPieceAssets(preview, pieces, { width: tileWidth, height: tileHeight }, tabGrow),
    [preview, pieces, tileWidth, tileHeight, tabGrow],
  )
  useEffect(() => () => disposePieceAssets(assets), [assets])
  return assets
}

/**
 * The materials for the tile color ('#RRGGBB'). A color change animates on the materials already on
 * screen; a tier change that swaps the material type builds new ones starting from the colours being shown.
 */
export function useTileMaterials(
  color: string,
  tier: Tier,
  layerLines: boolean,
  activeNormalMaps: ReadonlySet<THREE.Texture | null>,
): TileMaterialSet {
  const [library] = useState(() => new MaterialLibrary())
  const invalidate = useThree((state) => state.invalidate)
  const recipe = useMemo(() => materialRecipe(color, tier), [color, tier])
  const set = library.resolve(recipe)
  // Frames left before retired materials may go: disposing one before its replacement has drawn
  // releases a shader program the replacement is about to need, and three then relinks it from scratch.
  const retire = useRef({ frames: 0, set, activeNormalMaps, generation: set.generation })

  useEffect(() => {
    set.retarget(recipe)
    invalidate()
  }, [set, recipe, invalidate])

  useEffect(() => {
    set.setLayerLines(layerLines)
    invalidate()
  }, [set, layerLines, invalidate])

  // A layout effect runs in the commit that handed the meshes their tops, so no frame can prune against
  // the previous commit's maps. Every commit restarts the count, so disposal waits on the latest having drawn.
  useLayoutEffect(() => {
    retire.current = { frames: 2, set, activeNormalMaps, generation: set.generation }
    invalidate()
  }, [set, activeNormalMaps, invalidate])

  // Default priority: the first frame after a commit draws the replacements, the second disposes.
  useFrame(() => {
    const pending = retire.current
    if (pending.frames === 0) return
    pending.frames--
    if (pending.frames > 0) {
      invalidate()
      return
    }
    library.flush(pending.set)
    pending.set.prune(pending.activeNormalMaps, pending.generation)
  })

  useEffect(() => () => library.dispose(), [library])

  return set
}
