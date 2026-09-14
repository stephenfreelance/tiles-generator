import { useMemo } from 'react'
import { estimateFilament, type FilamentEstimate } from '@/core/estimate'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { useVolumes } from './useVolumes'

/** Filament, spools and plates; starts from slab volumes and sharpens once the draft meshes are measured. */
export function useFilamentEstimate(config: DesignConfig, plan: LayoutPlan): { estimate: FilamentEstimate; pending: boolean } {
  const { volumes, pending } = useVolumes(config, plan)
  const estimate = useMemo(() => estimateFilament(config, plan, volumes ?? {}), [config, plan, volumes])
  return { estimate, pending }
}
