import type { DesignConfig } from '@/core/types'
import type { EditOptions } from '@/state/designStore'

/** The one way the studio changes the design: a recipe, optionally coalesced into one undo step. */
export type DesignUpdate = (recipe: (draft: DesignConfig) => DesignConfig, options?: EditOptions) => void

export interface CellProps {
  config: DesignConfig
  update: DesignUpdate
}
