// What the front page is showing: the sample on the board and the color everything on the page wears.
// Pure, so the rules (a pick stops the cycle, a pick hands the color to the design) are tested without a DOM.
import { HERO_SPECIMENS } from './demo'

export interface HeroShow {
  /** Which of HERO_SPECIMENS is on the board. */
  index: number
  /** True once the viewer picked something: the board stops turning and wears the design's color. */
  held: boolean
}

export type HeroShowEvent = { type: 'advance' } | { type: 'sample'; index: number } | { type: 'pick' }

export const HERO_SHOW_START: HeroShow = { index: 0, held: false }

export function heroShowStep(state: HeroShow, event: HeroShowEvent): HeroShow {
  switch (event.type) {
    case 'advance':
      // A late tick after a pick must not move the board the viewer chose.
      return state.held ? state : { ...state, index: (state.index + 1) % HERO_SPECIMENS.length }
    case 'sample': {
      const known = Number.isInteger(event.index) && event.index >= 0 && event.index < HERO_SPECIMENS.length
      return known ? { index: event.index, held: true } : state
    }
    case 'pick':
      return state.held ? state : { ...state, held: true }
  }
}

/**
 * The color the board, the pattern samples and the page accent all show. Every pick writes the design's
 * color, so a held show reads it back from there: undo and redo then move the page with the design.
 */
export const shownColor = (state: HeroShow, designColor: string): string =>
  state.held ? designColor : HERO_SPECIMENS[state.index].color

/** Whether sample `index` is what the board shows: its relief, in its own color, not a color picked further down. */
export const isSampleShown = (index: number, boardIndex: number, color: string): boolean =>
  index === boardIndex && HERO_SPECIMENS[index]?.color === color
