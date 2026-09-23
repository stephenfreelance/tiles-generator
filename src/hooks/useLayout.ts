import { useMemo } from 'react'
import { fixingWarnings } from '@/core/fixing/warnings'
import { computeLayout, layoutInputOf } from '@/core/layout'
import { printerById } from '@/core/printers'
import { sidesFromMask, sidesMask } from '@/core/sides'
import type { DesignConfig, FitWarning, LayoutPlan } from '@/core/types'

/**
 * Layout for the design and its printer bed, with the notes about keys, clips and the perimeter
 * merged into its warnings. Keeps its identity while only color or texture change (a texture change
 * moves the plan only when it moves the perimeter band, whose automatic fade follows the relief).
 */
export function useLayout(config: DesignConfig): LayoutPlan {
  // layoutInputOf is the one place a design becomes a layout input; its fields are the memo's keys.
  const input = layoutInputOf(config, printerById(config.printerId))
  const { width: surfaceWidth, height: surfaceHeight } = input.surface
  const { width: tileWidth, height: tileHeight } = input.tile
  const { origin, rowOffset } = input.layout
  const { joint, bed } = input
  const profiledMask = input.edges?.profiled ? sidesMask(input.edges.profiled) : -1
  const band = input.edges?.band ?? 0
  const boundaryMatters = input.edges?.boundaryMatters ?? false
  // The tabs' own two numbers are memo keys like the rest: a design that stops cutting them re-lays the wall.
  const tabMinWidth = input.edges?.tabs?.minWidth ?? 0
  const tabProjection = input.edges?.tabs?.projection ?? 0
  const plan = useMemo(
    () =>
      computeLayout({
        surface: { width: surfaceWidth, height: surfaceHeight },
        tile: { width: tileWidth, height: tileHeight },
        joint,
        layout: { origin, rowOffset },
        bed,
        edges: {
          profiled: profiledMask < 0 ? null : sidesFromMask(profiledMask),
          band,
          boundaryMatters,
          tabs: tabMinWidth > 0 ? { minWidth: tabMinWidth, projection: tabProjection } : null,
        },
      }),
    [
      surfaceWidth,
      surfaceHeight,
      tileWidth,
      tileHeight,
      joint,
      origin,
      rowOffset,
      bed,
      profiledMask,
      band,
      boundaryMatters,
      tabMinWidth,
      tabProjection,
    ],
  )

  // The notes are compared by content: a recolour re-derives them, and an unchanged list keeps the plan.
  const notesText = useMemo(() => JSON.stringify(fixingWarnings(config, plan)), [config, plan])
  return useMemo(() => {
    const notes = JSON.parse(notesText) as FitWarning[]
    return notes.length ? { ...plan, warnings: [...plan.warnings, ...notes] } : plan
  }, [plan, notesText])
}
