// The layout checker writes in the drawing office's voice, and its findings are read by someone
// decorating a kitchen. This says the same things the maker's way: the consequence first, the
// measurement second, and never a trade term. The facts are rebuilt from the plan rather than
// parsed back out of the sentence, so nothing here can drift from what the checker actually found.

import { printerById } from '@/core/printers'
import type { DesignConfig, FitWarning, LayoutPlan } from '@/core/types'
import { formatLength, formatSize } from '@/core/units'

export function plainWarning(warning: FitWarning, config: DesignConfig, plan: LayoutPlan): string {
  switch (warning.code) {
    case 'thin-cut': {
      const piece = plan.pieces.find((candidate) => candidate.id === warning.pieceId)
      if (!piece) return warning.message
      return `One edge piece is only ${formatLength(Math.min(piece.width, piece.height))} wide, too thin to glue.`
    }
    case 'sliver-dropped':
      return 'A sliver along one edge is too thin to print, so the gap between tiles takes it up.'
    case 'exceeds-bed':
      return `A ${formatSize(config.tile.width, config.tile.height)} tile is bigger than your ${printerById(config.printerId).name} can print.`
    case 'tile-larger-than-surface':
      return 'The tile is bigger than the space you are covering, so every piece would be a cut.'
    case 'many-pieces':
      return `This layout needs ${plan.pieces.length} different tiles to print, which is a long download.`
    default:
      return warning.message
  }
}
