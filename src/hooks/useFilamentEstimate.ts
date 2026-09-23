import { useMemo } from 'react'
import { estimateFilament, type FilamentEstimate } from '@/core/estimate'
import { wallParts } from '@/core/fixing/accessories'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { useVolumes } from './useVolumes'

/**
 * Filament, spools and plates for the tiles and the wall's printed parts (the wall clips, the keys); starts
 * from slab and box volumes and sharpens once the meshes are measured. The fit test is weighed on its own
 * page, so this is the weight of the download beside it.
 */
export function useFilamentEstimate(config: DesignConfig, plan: LayoutPlan): { estimate: FilamentEstimate; pending: boolean } {
  const parts = useMemo(() => wallParts(config, plan), [config, plan])
  const { volumes, pending } = useVolumes(config, plan, parts)
  const estimate = useMemo(() => estimateFilament(config, plan, volumes ?? {}, parts), [config, plan, volumes, parts])
  return { estimate, pending }
}
