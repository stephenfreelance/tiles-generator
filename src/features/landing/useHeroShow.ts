import { useCallback, useEffect, useLayoutEffect, useReducer, useState } from 'react'
import { parseHex } from '@/core/colors'
import { useDesign } from '@/state/designStore'
import { useThemeColor } from '@/state/themeStore'
import { HERO_SPECIMENS, type HeroSpecimen } from './demo'
import { HERO_SHOW_START, heroShowStep, shownColor } from './heroShow'

/** Long enough to look at the relief, short enough that the stage never feels stuck. */
const CYCLE_MS = 7000

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === 'undefined' ? false : (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false),
  )
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const listen = () => setReduced(query.matches)
    query.addEventListener('change', listen)
    return () => query.removeEventListener('change', listen)
  }, [])
  return reduced
}

export interface HeroShowControls {
  /** Which of HERO_SPECIMENS is on the board. */
  index: number
  /** '#RRGGBB' the board, the pattern samples and the page accent show. */
  color: string
  /** A sample key under the board: shows it in its own color and makes that the design's color. */
  pickSample: (index: number) => void
  /** A chip in the Color section: keeps the relief on the board and makes this the design's color. */
  pickColor: (hex: string) => void
}

/**
 * The front page's show. The cycle only changes what the page displays; a pick is the viewer's
 * choice, so it also becomes the design's color, as one undoable edit, and the studio opens in it.
 * From then on the page wears the design's color, so an undo on this page recolors it too.
 */
export function useHeroShow(): HeroShowControls {
  const reduced = usePrefersReducedMotion()
  const [state, dispatch] = useReducer(heroShowStep, HERO_SHOW_START)
  const update = useDesign((s) => s.update)
  const designColor = useDesign((s) => s.config.color)
  const setOverride = useThemeColor((s) => s.setOverride)
  const color = shownColor(state, designColor)

  // The stage turns itself over unless the viewer asked for less motion or picked something.
  useEffect(() => {
    if (reduced || state.held) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      dispatch({ type: 'advance' })
    }, CYCLE_MS)
    return () => window.clearInterval(timer)
  }, [reduced, state.held])

  // Layout effects, so the accent changes in the same paint as the board's pill and the samples.
  useLayoutEffect(() => {
    setOverride(color)
  }, [color, setOverride])
  // Cleared only when the page goes: a cleanup on the effect above would flash the design's color between two samples.
  useLayoutEffect(() => () => setOverride(null), [setOverride])

  const pickSample = useCallback(
    (index: number) => {
      const specimen: HeroSpecimen | undefined = index >= 0 ? HERO_SPECIMENS[index] : undefined
      if (!specimen) return
      dispatch({ type: 'sample', index })
      update((draft) => ({ ...draft, color: specimen.color }))
    },
    [update],
  )

  const pickColor = useCallback(
    (hex: string) => {
      const parsed = parseHex(hex)
      if (!parsed) return
      dispatch({ type: 'pick' })
      update((draft) => ({ ...draft, color: parsed }))
    },
    [update],
  )

  return { index: state.index, color, pickSample, pickColor }
}
