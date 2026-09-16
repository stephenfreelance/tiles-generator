// The front page's own design. The visitor sizes, recolors and re-reliefs this wall as often as they
// like and none of it is an edit: the hook reads the maker's design once and never writes it, so
// browsing the page leaves the saved design and the studio's undo stack exactly as they were found.
import { startTransition, useCallback, useLayoutEffect, useMemo, useReducer, useState } from 'react'
import { toSearch } from '@/app/designLink'
import { parseHex } from '@/core/colors'
import { DEFAULT_CONFIG, normalizeConfig, sameConfig } from '@/core/config'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { useLayout } from '@/hooks'
import { useDesign } from '@/state/designStore'
import { useThemeColor } from '@/state/themeStore'
import {
  landingConfig,
  landingDesignStep,
  LANDING_DESIGN_START,
  LANDING_SPECIMENS,
  type LandingDesign,
  type LandingEvent,
} from './landingDesign'

export interface LandingDesignControls {
  state: LandingDesign
  config: DesignConfig
  plan: LayoutPlan
  /** The color the page paints with: config.color, one render early while a pick is still landing. */
  color: string
  dispatch: (event: LandingEvent) => void
  /** "/studio?d=..." for this design, or for an override (a pattern chip). Router-relative: Link adds the base. */
  studioHref: (override?: Partial<DesignConfig>) => string
  /** True when this browser already holds a design other than the default. Read once, not subscribed. */
  hasWorkInProgress: boolean
}

/** The color an event paints, or null when it leaves the color alone. Guarded exactly as the reducer guards it. */
function pickedColor(event: LandingEvent): string | null {
  if (event.type === 'color') return parseHex(event.hex)
  if (event.type !== 'specimen') return null
  const { index } = event
  const known = Number.isInteger(index) && index >= 0 && index < LANDING_SPECIMENS.length
  return known ? LANDING_SPECIMENS[index].color : null
}

/**
 * The whole page reads from here: the board, the plan, the corner detail, the samples and the kit are
 * all this one wall. Every change is one reducer event, so what the page shows and what the studio
 * link carries can never disagree.
 */
export function useLandingDesign(): LandingDesignControls {
  const [state, step] = useReducer(landingDesignStep, LANDING_DESIGN_START)
  // The reducer stays the source of truth; this mirror exists only so a pick paints one render early.
  const [color, setColor] = useState(LANDING_DESIGN_START.color)
  const setOverride = useThemeColor((s) => s.setOverride)
  // Read at mount and never again: a save in another tab would otherwise swap the primary action's
  // label under a reader who is looking at it, and this page has no business subscribing to a design
  // it must not touch.
  const [hasWorkInProgress] = useState(() => !sameConfig(useDesign.getState().config, DEFAULT_CONFIG))

  const config = useMemo(() => landingConfig(state), [state])
  // useLayout rather than landingPlan (same computation): the plan keeps its identity while only the
  // color or the relief change, so a recolor never redraws the plan, the legend or the file count.
  const plan = useLayout(config)

  const dispatch = useCallback((event: LandingEvent) => {
    const picked = pickedColor(event)
    if (picked === null) {
      step(event)
      return
    }
    // A color pick paints its accent and its pressed swatch in this frame; the board and the 23
    // samples follow in a transition, so the click never waits on the images it invalidates.
    setColor(picked)
    startTransition(() => step(event))
  }, [])

  const studioHref = useCallback(
    (override?: Partial<DesignConfig>) =>
      `/studio?${toSearch(override ? normalizeConfig({ ...config, ...override }) : config)}`,
    [config],
  )

  // A layout effect, so the accent is in the same paint as whatever was pressed to change it.
  useLayoutEffect(() => {
    setOverride(color)
  }, [color, setOverride])
  // Cleared when the page goes, never between two picks: a cleanup per color would flash the saved
  // design's accent in the gap.
  useLayoutEffect(() => () => setOverride(null), [setOverride])

  return useMemo(
    () => ({ state, config, plan, color, dispatch, studioHref, hasWorkInProgress }),
    [state, config, plan, color, dispatch, studioHref, hasWorkInProgress],
  )
}
