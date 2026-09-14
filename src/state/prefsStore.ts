import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ExportFormat, ExportQuality } from '@/core/types'
import { persistStorage } from './storage'

export type { ExportFormat, ExportQuality }
export type ViewMode = 'surface' | 'tile'

/** Per-viewer conveniences; losing them never loses work. */
interface PrefsState {
  viewMode: ViewMode
  /** Key light azimuth in degrees; low angles rake across the relief. */
  lightAngle: number
  showDimensions: boolean
  showLayerLines: boolean
  exportFormat: ExportFormat
  exportQuality: ExportQuality
  set: (patch: Partial<Omit<PrefsState, 'set'>>) => void
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      viewMode: 'surface',
      lightAngle: 35,
      showDimensions: true,
      showLayerLines: true,
      exportFormat: 'stl',
      exportQuality: 'standard',
      set: (patch) => set(patch),
    }),
    {
      name: 'tessera.prefs.v1',
      storage: persistStorage,
      version: 2,
      // v2 dropped `mounting`: the preview is the wall elevation, so a stored choice has nothing to
      // say. Without this the dead key would be read back and rewritten on every save.
      migrate: (persisted) => {
        const { mounting: _mounting, ...rest } = (persisted ?? {}) as Partial<PrefsState> & { mounting?: unknown }
        return rest as PrefsState
      },
      partialize: ({ set: _set, ...rest }) => rest,
    },
  ),
)
