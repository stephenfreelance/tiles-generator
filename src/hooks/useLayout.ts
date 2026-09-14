import { useMemo } from 'react'
import { computeLayout } from '@/core/layout'
import { printerById } from '@/core/printers'
import type { DesignConfig, LayoutPlan } from '@/core/types'

/** Layout for the design and its printer bed; keeps its identity while only color or texture change. */
export function useLayout(config: DesignConfig): LayoutPlan {
  const { width: surfaceWidth, height: surfaceHeight } = config.surface
  const { width: tileWidth, height: tileHeight } = config.tile
  const { origin, rowOffset } = config.layout
  const { joint, printerId } = config
  return useMemo(
    () =>
      computeLayout({
        surface: { width: surfaceWidth, height: surfaceHeight },
        tile: { width: tileWidth, height: tileHeight },
        joint,
        layout: { origin, rowOffset },
        bed: printerById(printerId),
      }),
    [surfaceWidth, surfaceHeight, tileWidth, tileHeight, joint, origin, rowOffset, printerId],
  )
}
