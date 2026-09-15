import { useState } from 'react'
import { normalizeConfig } from '@/core/config'
import type { DesignConfig } from '@/core/types'
import { useDesign, type EditOptions } from '@/state/designStore'
import { followRecommendation, sameTileSize, tileChoiceKind, type TileChoiceKind, type TileChoiceMemo } from './tileOptions'
import type { DesignUpdate } from './types'

/** Sets the tile from the Tile size group, recording which choice set it; no size means "keep it". */
export type ChooseTile = (kind: TileChoiceKind, size?: { width: number; height: number }, options?: EditOptions) => void

export interface StudioUpdate {
  /** The store's update, keeping a Recommended tile on the recommendation inside the same edit. */
  update: DesignUpdate
  chooseTile: ChooseTile
  /** The choice the current design is on, for the Tile size group to show. */
  tileChoice: TileChoiceKind
}

interface MemoSlot {
  get: () => TileChoiceMemo | null
  set: (memo: TileChoiceMemo) => void
}

type Store = Pick<typeof useDesign, 'getState'>

/**
 * The studio's two ways to edit, free of React so the store test drives these very functions. The
 * follow is folded into the recipe, so the wall and the tile it carries along are one undo step and
 * a coalesced stepper run stays one. After every edit the memo records the choice and its tile.
 */
export function studioEditor(store: Store, memo: MemoSlot): { update: DesignUpdate; chooseTile: ChooseTile } {
  const record = (kind: TileChoiceKind) => {
    const { tile } = store.getState().config
    memo.set({ kind, width: tile.width, height: tile.height })
  }

  const update: DesignUpdate = (recipe, options) => {
    let kind: TileChoiceKind = 'size'
    store.getState().update((draft) => {
      // The recipe gets a clone it may mutate, so the design before the edit comes from the store.
      const before = store.getState().config
      const raw = recipe(draft)
      // An edit that set the tile itself (a plan fix) is a size the maker chose.
      if (!sameTileSize(raw.tile, before.tile)) return raw
      kind = tileChoiceKind(memo.get(), before)
      // Normalized first, so the recommendation is the one for the wall the store will hold.
      return kind === 'recommended' ? followRecommendation(before, normalizeConfig(raw)) : raw
    }, options)
    record(kind)
  }

  const chooseTile: ChooseTile = (kind, size, options) => {
    if (size) {
      const { width, height } = size
      store.getState().update((design) => ({ ...design, tile: { ...design.tile, width, height } }), options)
    }
    record(kind)
  }

  return { update, chooseTile }
}

const sameMemo = (a: TileChoiceMemo | null, b: TileChoiceMemo) =>
  a !== null && a.kind === b.kind && sameTileSize(a, b)

/**
 * The one `update` every studio group edits through, and the Tile size group's `chooseTile`. Load,
 * undo, redo and share links go around them on purpose, so a restored or opened design comes back
 * exactly as it was; the memo notices the changed tile and reads the choice from the design again.
 */
export function useStudioUpdate(config: DesignConfig): StudioUpdate {
  const [memo, setMemo] = useState<TileChoiceMemo | null>(null)
  // Created once and read at edit time rather than captured, so both functions keep one identity for
  // the page's life; the state copy is only there to render the choice.
  const [editor] = useState(() => {
    let current: TileChoiceMemo | null = null
    return studioEditor(useDesign, {
      get: () => current,
      set: (next) => {
        if (sameMemo(current, next)) return
        current = next
        setMemo(next)
      },
    })
  })

  return { update: editor.update, chooseTile: editor.chooseTile, tileChoice: tileChoiceKind(memo, config) }
}
