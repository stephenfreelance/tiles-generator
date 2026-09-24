/** Where the step index sends a maker: one id per step, and one for the plan the steps add up to. */
export const stepSectionId = (step: number): string => `studio-step-${step}`
export const PLAN_SECTION_ID = 'studio-plan'
