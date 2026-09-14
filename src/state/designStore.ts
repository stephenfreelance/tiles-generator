import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_CONFIG, normalizeConfig, sameConfig } from '@/core/config'
import type { DesignConfig } from '@/core/types'
import { persistStorage } from './storage'

const MAX_UNDO = 100
/**
 * Backstop for a coalescing session that never reports its end. A gesture normally closes on
 * `endEdit`, so this only has to outlast the gap between two steps of one slow interaction (a single
 * slider step can cost the main thread more than a second) without letting two drags merge.
 */
const COALESCE_TIMEOUT_MS = 10_000

export interface EditOptions {
  /** Edits sharing a key form one undo step until `endEdit`, whatever each step costs. */
  coalesce?: string
}

interface DesignState {
  config: DesignConfig
  past: DesignConfig[]
  future: DesignConfig[]
  lastEdit: { key: string; at: number } | null
  /** Applies an edit; the result is normalized so the store never holds an invalid config. */
  update: (recipe: (draft: DesignConfig) => DesignConfig, options?: EditOptions) => void
  /**
   * Closes the open coalescing session, so the next edit starts a new undo step. Call it when a
   * gesture ends (a drag's pointer release); `key` makes a late signal from another control a no-op.
   */
  endEdit: (key?: string) => void
  /** Replaces the whole design (history "open", presets) as one undoable step. */
  load: (config: DesignConfig) => void
  undo: () => void
  redo: () => void
  reset: () => void
}

export const useDesign = create<DesignState>()(
  persist(
    (set, get) => ({
      config: DEFAULT_CONFIG,
      past: [],
      future: [],
      lastEdit: null,

      update(recipe, options) {
        const { config, past, lastEdit } = get()
        const next = normalizeConfig(recipe(structuredClone(config)))
        if (sameConfig(next, config)) return
        const key = options?.coalesce
        const now = performance.now()
        const coalesced = key !== undefined && lastEdit?.key === key && now - lastEdit.at < COALESCE_TIMEOUT_MS
        set({
          config: next,
          past: coalesced ? past : [...past, config].slice(-MAX_UNDO),
          future: [],
          lastEdit: key !== undefined ? { key, at: now } : null,
        })
      },

      endEdit(key) {
        const { lastEdit } = get()
        if (!lastEdit || (key !== undefined && lastEdit.key !== key)) return
        set({ lastEdit: null })
      },

      load(config) {
        const { config: current, past } = get()
        const next = normalizeConfig(config)
        if (sameConfig(next, current)) return
        set({ config: next, past: [...past, current].slice(-MAX_UNDO), future: [], lastEdit: null })
      },

      undo() {
        const { past, future, config } = get()
        const previous = past.at(-1)
        if (!previous) return
        set({ config: previous, past: past.slice(0, -1), future: [config, ...future], lastEdit: null })
      },

      redo() {
        const { past, future, config } = get()
        const [next, ...rest] = future
        if (!next) return
        set({ config: next, past: [...past, config], future: rest, lastEdit: null })
      },

      reset() {
        get().load(DEFAULT_CONFIG)
      },
    }),
    {
      name: 'tessera.design.v1',
      storage: persistStorage,
      version: 1,
      partialize: (state) => ({ config: state.config }),
      merge: (persisted, current) => ({
        ...current,
        config: normalizeConfig((persisted as { config?: unknown } | undefined)?.config ?? current.config),
      }),
    },
  ),
)

export const useConfig = () => useDesign((s) => s.config)
