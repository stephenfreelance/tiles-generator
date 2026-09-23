import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import type { DesignConfig } from '@/core/types'
import { designEditEndsPeek } from './viewPeek'

// A peek at the back of tile A borrows the One tile view for step 7 and must give it back: these pin
// which edits end it, that the maker's own view setting survives it, and that step 7's peekBack wins
// over the design change it follows or precedes in the same handler.

type Modules = {
  peek: typeof import('./viewPeek')
  design: (typeof import('./designStore'))['useDesign']
  prefs: (typeof import('./prefsStore'))['usePrefs']
}

/** Fresh stores each time: the peek subscribes to the design store when it is first imported. */
async function load(): Promise<Modules> {
  vi.resetModules()
  const peek = await import('./viewPeek')
  const { useDesign } = await import('./designStore')
  const { usePrefs } = await import('./prefsStore')
  return { peek, design: useDesign, prefs: usePrefs }
}

/** Lets the end of the current task run: the peek's deferred end, and the store's own clean-up. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

let wide = true
let reduced = false
const scrolls: ScrollIntoViewOptions[] = []

beforeEach(() => {
  wide = true
  reduced = false
  scrolls.length = 0
  const held = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => void held.set(key, value),
      removeItem: (key: string) => void held.delete(key),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: (query: string) => ({
      matches: query.includes('min-width: 1100px') ? wide : query.includes('reduce') ? reduced : false,
    }),
  })
  vi.stubGlobal('document', {
    addEventListener: () => {},
    visibilityState: 'visible',
    getElementById: (id: string) => (id === 'studio-view' ? { scrollIntoView: (options: ScrollIntoViewOptions) => scrolls.push(options) } : null),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const edit = (patch: Partial<DesignConfig>): DesignConfig => ({ ...DEFAULT_CONFIG, ...patch })

describe('designEditEndsPeek', () => {
  it('keeps the peek through a step-7 choice, the plate it raises included', () => {
    const thin = edit({ tile: { ...DEFAULT_CONFIG.tile, thickness: 3 } })
    expect(designEditEndsPeek(thin, { ...thin, mount: 'clips', tile: { ...thin.tile, thickness: 4 } })).toBe(false)
    expect(designEditEndsPeek(thin, { ...thin, lock: 'keys', tile: { ...thin.tile, thickness: 4 } })).toBe(false)
    expect(designEditEndsPeek(edit({ lock: 'keys' }), edit({ lock: 'keys', fit: 'snug' }))).toBe(false)
    // Undoing the choice lowers the plate again, and that is the same choice.
    expect(designEditEndsPeek({ ...thin, mount: 'clips', tile: { ...thin.tile, thickness: 4 } }, thin)).toBe(false)
  })

  it('keeps it through a rename', () => {
    expect(designEditEndsPeek(DEFAULT_CONFIG, edit({ name: 'Kitchen splashback' }))).toBe(false)
  })

  it('ends it on any edit of steps 1 to 6', () => {
    expect(designEditEndsPeek(DEFAULT_CONFIG, edit({ surface: { width: 900, height: 600 } }))).toBe(true)
    expect(designEditEndsPeek(DEFAULT_CONFIG, edit({ tile: { ...DEFAULT_CONFIG.tile, width: 120 } }))).toBe(true)
    expect(designEditEndsPeek(DEFAULT_CONFIG, edit({ tile: { ...DEFAULT_CONFIG.tile, thickness: 6 } }))).toBe(true)
    expect(designEditEndsPeek(DEFAULT_CONFIG, edit({ texture: { ...DEFAULT_CONFIG.texture, depth: 1 } }))).toBe(true)
    expect(designEditEndsPeek(DEFAULT_CONFIG, edit({ color: '#1F1F1F' }))).toBe(true)
    expect(designEditEndsPeek(DEFAULT_CONFIG, edit({ jointEdge: 'round' }))).toBe(true)
  })

  it('ends it when a fixing choice comes with any other edit', () => {
    expect(designEditEndsPeek(DEFAULT_CONFIG, edit({ mount: 'clips', color: '#1F1F1F' }))).toBe(true)
  })
})

describe('the peek store', () => {
  it('turns to the back without touching the saved view setting, and gives the view back', async () => {
    const { peek, prefs } = await load()
    prefs.getState().set({ viewMode: 'surface' })
    peek.useViewPeek.getState().peekBack()
    expect(peek.useViewPeek.getState()).toMatchObject({ face: 'back', peeking: true })
    expect(prefs.getState().viewMode).toBe('surface')
    peek.useViewPeek.getState().endPeek()
    expect(peek.useViewPeek.getState()).toMatchObject({ face: 'front', peeking: false })
    expect(prefs.getState().viewMode).toBe('surface')
  })

  it('leaves a back the maker chose alone when no peek is on', async () => {
    const { peek, prefs } = await load()
    prefs.getState().set({ viewMode: 'tile' })
    peek.useViewPeek.getState().setFace('back')
    peek.useViewPeek.getState().endPeek()
    peek.useViewPeek.getState().keepView()
    expect(peek.useViewPeek.getState()).toMatchObject({ face: 'back', peeking: false })
  })

  it('hands the view to the maker when they pick a face or work the view during a peek', async () => {
    const { peek, prefs } = await load()
    prefs.getState().set({ viewMode: 'surface' })
    peek.useViewPeek.getState().peekBack()
    peek.useViewPeek.getState().keepView()
    expect(peek.useViewPeek.getState()).toMatchObject({ face: 'back', peeking: false })
    expect(prefs.getState().viewMode).toBe('tile')

    prefs.getState().set({ viewMode: 'surface' })
    peek.useViewPeek.getState().peekBack()
    peek.useViewPeek.getState().setFace('front')
    expect(peek.useViewPeek.getState()).toMatchObject({ face: 'front', peeking: false })
    expect(prefs.getState().viewMode).toBe('tile')
  })

  it('resets to the front with no peek', async () => {
    const { peek } = await load()
    peek.useViewPeek.getState().peekBack()
    peek.useViewPeek.getState().reset()
    expect(peek.useViewPeek.getState()).toMatchObject({ face: 'front', peeking: false })
  })
})

describe('design edits and the peek', () => {
  it('ends the peek when steps 1 to 6 change, at the end of the task', async () => {
    const { peek, design } = await load()
    await settle()
    peek.useViewPeek.getState().peekBack()
    await settle()
    design.getState().update((draft) => ({ ...draft, surface: { width: draft.surface.width + 100, height: draft.surface.height } }))
    expect(peek.useViewPeek.getState().peeking).toBe(true)
    await settle()
    expect(peek.useViewPeek.getState()).toMatchObject({ face: 'front', peeking: false })
  })

  it('keeps the peek through a step-7 choice and its undo', async () => {
    const { peek, design } = await load()
    await settle()
    peek.useViewPeek.getState().peekBack()
    await settle()
    design.getState().update((draft) => ({ ...draft, mount: 'clips' }))
    await settle()
    design.getState().undo()
    await settle()
    expect(peek.useViewPeek.getState()).toMatchObject({ face: 'back', peeking: true })
  })

  it('lets a peekBack in the same task win, after the edit or before it', async () => {
    const { peek, design } = await load()
    await settle()
    const grow = () =>
      design.getState().update((draft) => ({ ...draft, surface: { width: draft.surface.width + 100, height: draft.surface.height } }))

    peek.useViewPeek.getState().peekBack()
    await settle()
    grow()
    peek.useViewPeek.getState().peekBack()
    await settle()
    expect(peek.useViewPeek.getState().peeking).toBe(true)

    peek.useViewPeek.getState().peekBack()
    grow()
    await settle()
    expect(peek.useViewPeek.getState().peeking).toBe(true)

    // A later task's edit still ends it.
    grow()
    await settle()
    expect(peek.useViewPeek.getState().peeking).toBe(false)
  })

  it('says nothing about a design change while no peek is on', async () => {
    const { peek, design, prefs } = await load()
    await settle()
    prefs.getState().set({ viewMode: 'tile' })
    peek.useViewPeek.getState().setFace('back')
    design.getState().update((draft) => ({ ...draft, color: '#1F1F1F' }))
    await settle()
    expect(peek.useViewPeek.getState()).toMatchObject({ face: 'back', peeking: false })
  })
})

describe('how step 7 peeks', () => {
  it('peeks after a card choice only where the view sits beside the steps', async () => {
    const { peek } = await load()
    wide = false
    peek.peekAfterChoice()
    expect(peek.useViewPeek.getState().peeking).toBe(false)
    wide = true
    peek.peekAfterChoice()
    expect(peek.useViewPeek.getState().peeking).toBe(true)
    expect(scrolls).toHaveLength(0)
  })

  it('peeks from the button everywhere, bringing a stacked view on screen', async () => {
    const { peek } = await load()
    wide = true
    peek.peekAndShowView()
    expect(peek.useViewPeek.getState().peeking).toBe(true)
    expect(scrolls).toHaveLength(0)

    wide = false
    peek.peekAndShowView()
    reduced = true
    peek.peekAndShowView()
    expect(scrolls.map((options) => options.behavior)).toEqual(['smooth', 'auto'])
  })
})
