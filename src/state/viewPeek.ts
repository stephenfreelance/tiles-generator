import { create } from 'zustand'
import type { DesignConfig } from '@/core/types'
import type { TileFace } from '@/three/flip'
import { useDesign } from './designStore'
import { usePrefs } from './prefsStore'

// Which face of the single tile the studio's 3D view shows, and whether it is only a peek: a look at the
// back of tile A that step 7 asks for when a fixing is chosen, which borrows the One tile view without
// touching the maker's own view setting and gives it back when the peek ends. Not persisted: a look at
// the back is a glance, never a setting, and every visit to the studio starts face up.

export interface ViewPeekState {
  /** The single tile's face that is up. Only shown in the One tile view, and only when its back has a pocket. */
  face: TileFace
  /** True while the view shows the back of the tile for a peek: the view reads One tile whatever the prefs hold. */
  peeking: boolean
  /** Turns to the back of the single tile without overwriting the persisted viewMode pref. */
  peekBack: () => void
  /** Ends a peek: the view goes back to the persisted viewMode, face up. Nothing happens when not peeking. */
  endPeek: () => void
  /**
   * The maker's own choice of face. Chosen during a peek, it keeps the One tile view on screen as the
   * maker's own (the viewMode pref becomes 'tile') and the peek is over.
   */
  setFace: (face: TileFace) => void
  /**
   * The maker is working with the view on screen (the light, the dimensions, the reset): a peek becomes
   * their own view, One tile at the face it shows, and is no longer temporary. Nothing happens when not peeking.
   */
  keepView: () => void
  /** Face up and no peek: a studio that is left, or a back that no longer has a pocket to show. */
  reset: () => void
}

// A peekBack asked for in the same task as a design change wins over the end that change asks for,
// whichever of the two comes first: step 7 updates the design and peeks in one handler.
let tick: object | null = null
let peekTick: object | null = null

function currentTick(): object {
  if (!tick) {
    const fresh = {}
    tick = fresh
    queueMicrotask(() => {
      if (tick === fresh) tick = null
    })
  }
  return tick
}

export const useViewPeek = create<ViewPeekState>()((set, get) => ({
  face: 'front',
  peeking: false,
  peekBack: () => {
    peekTick = currentTick()
    set({ face: 'back', peeking: true })
  },
  endPeek: () => {
    if (get().peeking) set({ face: 'front', peeking: false })
  },
  setFace: (face) => {
    if (get().peeking) usePrefs.getState().set({ viewMode: 'tile' })
    set({ face, peeking: false })
  },
  keepView: () => {
    if (!get().peeking) return
    usePrefs.getState().set({ viewMode: 'tile' })
    set({ peeking: false })
  },
  reset: () => set({ face: 'front', peeking: false }),
}))

/** The step-7 fields: the ways up and the fit of the printed parts. */
const fixingChanged = (a: DesignConfig, b: DesignConfig) => a.mount !== b.mount || a.lock !== b.lock || a.fit !== b.fit

/**
 * Whether a design edit ends a peek: anything but a step-7 fixing choice does. A fixing choice may raise a
 * thin plate in the same undo step (withFixings), and undoing it lowers the plate again, so the thickness
 * counts as part of that choice. A rename is not an edit of the wall at all.
 */
export function designEditEndsPeek(previous: DesignConfig, next: DesignConfig): boolean {
  const fixing = fixingChanged(previous, next)
  const strip = (config: DesignConfig): DesignConfig => ({
    ...config,
    name: '',
    mount: 'glue',
    lock: 'none',
    fit: 'standard',
    tile: fixing ? { ...config.tile, thickness: 0 } : config.tile,
  })
  return JSON.stringify(strip(previous)) !== JSON.stringify(strip(next))
}

// Steps 1 to 6 (and the advanced settings) end a peek. Deferred to the end of the task, so a peekBack in
// the same task, before or after the edit, keeps it.
useDesign.subscribe((state, previous) => {
  if (state.config === previous.config || !useViewPeek.getState().peeking) return
  if (!designEditEndsPeek(previous.config, state.config)) return
  const editTick = currentTick()
  queueMicrotask(() => {
    if (peekTick !== editTick) useViewPeek.getState().endPeek()
  })
})

/** Where the studio lays the 3D view beside the steps (StudioPage.module.scss): below it the view sits above them. */
export const VIEW_BESIDE_STEPS_QUERY = '(min-width: 1100px)'

/** The id of the studio's 3D view, so a control far down the steps can bring it on screen. */
export const STUDIO_VIEW_ID = 'studio-view'

const matches = (query: string): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches

/**
 * After a step-7 card choice by pointer or keyboard that places pockets: peek at the back only where the
 * view is beside the steps and on screen already. On a narrower screen the view is scrolled away and the
 * 2D back drawing in the step explains the choice instead.
 */
export function peekAfterChoice(): void {
  if (matches(VIEW_BESIDE_STEPS_QUERY)) useViewPeek.getState().peekBack()
}

/**
 * For "See the back of tile A", at every width: peek at the back, and where the view is not beside the
 * steps, scroll it into view (smoothly, unless the maker asks for reduced motion).
 */
export function peekAndShowView(): void {
  useViewPeek.getState().peekBack()
  if (matches(VIEW_BESIDE_STEPS_QUERY) || typeof document === 'undefined') return
  document.getElementById(STUDIO_VIEW_ID)?.scrollIntoView({
    behavior: matches('(prefers-reduced-motion: reduce)') ? 'auto' : 'smooth',
    block: 'start',
  })
}
