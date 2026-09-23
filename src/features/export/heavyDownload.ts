// What the page can offer against a heavy download. Pure, so the rule is tested without a DOM.
import type { ExportFormat, ExportQuality } from '@/core/types'

/**
 * 'standard-stl': switch to standard STL, which holds the same relief in a lighter download.
 * 'one-at-a-time': the switch would not make it lighter (the files are standard STL already, or the
 * lighter Fastest detail), so what still helps is writing the pieces one by one, each a file of its own.
 */
export type HeavyDownloadFix = 'standard-stl' | 'one-at-a-time'

export function heavyDownloadFix(
  format: ExportFormat,
  quality: ExportQuality,
  /** The estimated download as chosen, and as standard STL, bytes. */
  bytes: { chosen: number; standardStl: number },
): HeavyDownloadFix {
  if (format === 'stl' && quality === 'standard') return 'one-at-a-time'
  return bytes.standardStl < bytes.chosen ? 'standard-stl' : 'one-at-a-time'
}
