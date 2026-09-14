import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import type * as THREE from 'three'
import type { Filament } from '@/core/filaments'
import type { PieceSpec } from '@/core/types'
import type { PreviewPiece } from '@/workers/protocol'
import { buildPieceAssets, disposePieceAssets, type PieceAssets } from './geometry'
import type { Tier } from './look'
import { finishRecipe, MaterialLibrary, type FinishMaterialSet } from './materials'

/** Geometries and baked normal maps for the pieces on screen; replaced sets are disposed. */
export function usePieceAssets(
  preview: ReadonlyMap<string, PreviewPiece>,
  pieces: readonly PieceSpec[],
  tileWidth: number,
  tileHeight: number,
): Map<string, PieceAssets> {
  const assets = useMemo(
    () => buildPieceAssets(preview, pieces, { width: tileWidth, height: tileHeight }),
    [preview, pieces, tileWidth, tileHeight],
  )
  useEffect(() => () => disposePieceAssets(assets), [assets])
  return assets
}

/**
 * The materials for the chosen filament. A colour change inside one finish animates on the materials
 * already on screen; a finish change builds new ones starting from the colours being shown.
 */
export function useFinishMaterials(
  filament: Filament,
  tier: Tier,
  solidMm: number,
  layerLines: boolean,
  activeNormalMaps: ReadonlySet<THREE.Texture | null>,
): FinishMaterialSet {
  const [library] = useState(() => new MaterialLibrary())
  const invalidate = useThree((state) => state.invalidate)
  const recipe = useMemo(() => finishRecipe(filament, tier, solidMm), [filament, tier, solidMm])
  const set = library.resolve(recipe)

  useEffect(() => {
    set.retarget(recipe)
    library.flush(set)
    invalidate()
  }, [library, set, recipe, invalidate])

  useEffect(() => {
    set.setLayerLines(layerLines)
    invalidate()
  }, [set, layerLines, invalidate])

  useEffect(() => {
    set.prune(activeNormalMaps)
  }, [set, activeNormalMaps])

  useEffect(() => () => library.dispose(), [library])

  return set
}
