// A cut piece is marked in --cut on --cut-soft, and both are mid-value reds. Drawn over a tile of
// similar value the mark loses its edge: measured over the presets, max(contrast(--cut, tile),
// contrast(--cut-soft, tile)) falls to 2.44:1 on Pink, 2.54 on Orange, 2.74 on Teal, 3.01 on Green.
// So the mark carries a 1 px halo in whichever of --ink or --panel wins on that tile; that pair never
// drops below 4.06:1 anywhere in sRGB. Pure, so vitest proves the floor instead of a screenshot.
import { contrastRatio } from '@/core/accent'

/** _tokens.scss --ink and --panel: the darkest and the lightest surfaces the palette owns. */
export const HALO_HEX = { ink: '#241C14', panel: '#FFFDF8' } as const

export type CutHalo = keyof typeof HALO_HEX

/** The halo to ring a cut mark with on a tile of this color. An unreadable hex reads as black, as everywhere. */
export function cutHaloOn(tileHex: string): CutHalo {
  return contrastRatio(HALO_HEX.ink, tileHex) >= contrastRatio(HALO_HEX.panel, tileHex) ? 'ink' : 'panel'
}
