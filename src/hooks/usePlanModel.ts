import { useMemo } from 'react'
import { buildPlanModel, type PlanModel } from '@/core/plan/planModel'
import type { DesignConfig, LayoutPlan } from '@/core/types'

/** Setting-out drawing model for the studio's plan view. */
export function usePlanModel(config: DesignConfig, plan: LayoutPlan): PlanModel {
  return useMemo(() => buildPlanModel(config, plan), [config, plan])
}
