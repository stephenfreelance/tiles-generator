import { create } from 'zustand'

/** Which tile color the interface accent follows. Not persisted: an override belongs to the page that set it. */
interface ThemeColorState {
  /** A color a page shows instead of the design's (the landing board's sample); null follows the design. */
  override: string | null
  setOverride: (hex: string | null) => void
}

export const useThemeColor = create<ThemeColorState>()((set) => ({
  override: null,
  setOverride: (hex) => set({ override: hex }),
}))
