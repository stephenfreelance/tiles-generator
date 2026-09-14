// One-click answers to the layout's own warnings: every fix is a small edit the maker can undo.

import { computeLayout, perfectFitSizes } from '@/core/layout'
import { PRINTERS, printerById } from '@/core/printers'
import { formatLength } from '@/core/units'
import type { DesignConfig, FitWarning, LayoutPlan } from '@/core/types'

export interface PlanFix {
  label: string
  /** Spoken once the fix lands, so the change is not only visible. */
  done: string
  apply: (design: DesignConfig) => DesignConfig
}

/** Tiles across a length when they divide it exactly. */
const countAcross = (length: number, size: number, joint: number) => Math.round((length + joint) / (size + joint))

const plural = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many)

/** What the surface really takes once a fix lands, in the plan's own numbers. */
function fitAfter(design: DesignConfig): string {
  const plan = computeLayout({
    surface: design.surface,
    tile: design.tile,
    joint: design.joint,
    layout: design.layout,
  })
  const total = plan.placements.length
  if (plan.exact) return total === 1 ? 'one whole tile covers it.' : `${total} whole tiles cover it.`
  if (plan.fullCount === 0) return `it takes ${total} cut ${plural(total, 'piece')}.`
  return `it takes ${plan.fullCount} whole ${plural(plan.fullCount, 'tile')} and ${plan.partialCount} cut ${plural(plan.partialCount, 'piece')}.`
}

function perfectFit(config: DesignConfig): PlanFix | null {
  const [size] = perfectFitSizes(config.surface.width, config.joint, config.tile.width, 1)
  if (!size || Math.abs(size - config.tile.width) < 0.05) return null
  const across = countAcross(config.surface.width, size, config.joint)
  const square = config.tile.width === config.tile.height
  return {
    label: `Use ${formatLength(size)} tiles`,
    done: `Tile width ${formatLength(size)}: ${across} across, no cuts.`,
    apply: (design) => ({
      ...design,
      tile: { ...design.tile, width: size, height: square ? size : design.tile.height },
    }),
  }
}

function balance(config: DesignConfig): PlanFix | null {
  if (config.layout.origin === 'balanced') return null
  return {
    label: 'Even out the edges',
    done: 'Edges evened out: the cut pieces are shared between opposite sides.',
    apply: (design) => ({ ...design, layout: { ...design.layout, origin: 'balanced' } }),
  }
}

function biggerPrinter(config: DesignConfig): PlanFix | null {
  const { width, height } = config.tile
  const current = printerById(config.printerId)
  const fits = PRINTERS.filter(
    (printer) =>
      (width <= printer.width && height <= printer.depth) || (height <= printer.width && width <= printer.depth),
  ).sort((a, b) => a.width * a.depth - b.width * b.depth)
  const smallestThatFits = fits[0]
  if (!smallestThatFits || smallestThatFits.id === current.id) return null
  return {
    label: `Switch to the ${smallestThatFits.name}`,
    done: `Printer set to the ${smallestThatFits.name}: the tile fits its bed.`,
    apply: (design) => ({ ...design, printerId: smallestThatFits.id }),
  }
}

/** The largest square tile the current bed prints, rounded down to a whole millimetre. */
function tileToBed(config: DesignConfig): PlanFix | null {
  const bed = printerById(config.printerId)
  const size = Math.floor(Math.min(bed.width, bed.depth))
  if (size < 20 || size >= Math.min(config.tile.width, config.tile.height)) return null
  return {
    label: `Use ${formatLength(size)} tiles`,
    done: `Tile set to ${formatLength(size)}: it fits the ${bed.name} bed.`,
    apply: (design) => ({ ...design, tile: { ...design.tile, width: size, height: size } }),
  }
}

function fitToSurface(config: DesignConfig): PlanFix {
  const width = Math.min(config.tile.width, config.surface.width)
  const height = Math.min(config.tile.height, config.surface.height)
  const apply = (design: DesignConfig): DesignConfig => ({ ...design, tile: { ...design.tile, width, height } })
  return {
    label: 'Make the tile fit',
    // Clamping the oversized axis usually leaves a cut on the other one, so the promise is read off
    // the layout this very fix produces rather than assumed.
    done: `Tile set to ${formatLength(width)} by ${formatLength(height)}: ${fitAfter(apply(config))}`,
    apply,
  }
}

function fewerModels(config: DesignConfig): PlanFix | null {
  if (config.layout.rowOffset !== 0) {
    return {
      label: 'Use straight rows',
      done: 'Rows lined up: a straight grid needs fewer different tiles.',
      apply: (design) => ({ ...design, layout: { ...design.layout, rowOffset: 0 } }),
    }
  }
  if (config.layout.origin !== 'corner') {
    return {
      label: 'Start from the corner',
      done: 'Started from the corner: every cut piece lands on two edges only.',
      apply: (design) => ({ ...design, layout: { ...design.layout, origin: 'corner' } }),
    }
  }
  return null
}

/** The fix offered next to a warning, or nothing when the maker has to choose. */
export function fixFor(warning: FitWarning, config: DesignConfig, _plan: LayoutPlan): PlanFix | null {
  switch (warning.code) {
    case 'thin-cut':
    case 'sliver-dropped':
      return balance(config) ?? perfectFit(config)
    case 'exceeds-bed':
      return biggerPrinter(config) ?? tileToBed(config)
    case 'tile-larger-than-surface':
      return fitToSurface(config)
    case 'many-pieces':
      return fewerModels(config)
    default:
      return null
  }
}
