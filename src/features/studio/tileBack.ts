// Whether the single-tile view has a back worth turning over to. Pure, so the rule is tested without WebGL.
import { clipsPossible, keysPossible, tabsPossible } from '@/core/fixing/capability'
import { pieceFeatures } from '@/core/fixing/features'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { heroPiece } from '@/hooks/previewLod'

/**
 * True when the tile the view shows really has something in its back: a pocket cut into it, or a tab
 * standing out past its side. Keys, tabs or wall clips switched on can place none (a thin base, a deep
 * joint edge, no joint to cross, a tile too small for a clip or too narrow for a socket), and a flat back
 * has nothing to show.
 */
export function backHasPockets(config: DesignConfig, plan: LayoutPlan): boolean {
  if (!keysPossible(config) && !tabsPossible(config) && !clipsPossible(config)) return false
  const hero = heroPiece(plan)
  return hero !== undefined && pieceFeatures(config, hero).length > 0
}
