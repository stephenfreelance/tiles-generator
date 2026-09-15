import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// One gesture must be one undo step. The store cannot see the gesture, so these tests drive it the
// way the app does: many edits under one coalesce key, with a main thread that is far from free.

type DesignStore = (typeof import('./designStore'))['useDesign']

/** Kept in step with COALESCE_TIMEOUT_MS in the store: the backstop for a gesture that never ends. */
const SAFETY_TIMEOUT_MS = 10_000
/** The audit measured about this much main-thread work for a single slider step. */
const SLOW_STEP_MS = 1300

let clock = 0

/** Fresh module registry each time: the store hydrates once, at import. */
async function loadStore(): Promise<DesignStore> {
  clock = 0
  vi.resetModules()
  const { useDesign } = await import('./designStore')
  await useDesign.persist.rehydrate()
  return useDesign
}

const nudgeJoint = (store: DesignStore, coalesce?: string) =>
  store.getState().update((draft) => ({ ...draft, joint: draft.joint + 0.5 }), coalesce ? { coalesce } : undefined)

beforeEach(() => {
  const held = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => void held.set(key, value),
      removeItem: (key: string) => void held.delete(key),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// The stub stays up for the whole file: storage.ts banks design writes on a trailing timer that can
// fire between tests, and a window it can write to keeps that silent.
afterAll(() => {
  vi.unstubAllGlobals()
})

describe('coalescing one gesture into one undo step', () => {
  it('keeps a slow drag together, however long each step takes', async () => {
    const store = await loadStore()
    const before = store.getState().config.joint

    for (let i = 0; i < 5; i++) {
      clock += SLOW_STEP_MS
      nudgeJoint(store, 'joint')
    }

    expect(store.getState().config.joint).toBe(before + 2.5)
    expect(store.getState().past).toHaveLength(1)
    store.getState().undo()
    expect(store.getState().config.joint).toBe(before)
  })

  it('starts a new undo step once the gesture reports its end', async () => {
    const store = await loadStore()
    clock += SLOW_STEP_MS
    nudgeJoint(store, 'joint')
    clock += SLOW_STEP_MS
    nudgeJoint(store, 'joint')
    const afterFirstDrag = store.getState().config.joint

    store.getState().endEdit('joint')
    clock += SLOW_STEP_MS
    nudgeJoint(store, 'joint')
    clock += SLOW_STEP_MS
    nudgeJoint(store, 'joint')

    expect(store.getState().past).toHaveLength(2)
    store.getState().undo()
    expect(store.getState().config.joint).toBe(afterFirstDrag)
  })

  it('ignores an end signal from another control', async () => {
    const store = await loadStore()
    clock += SLOW_STEP_MS
    nudgeJoint(store, 'joint')
    store.getState().endEdit('bevel') // a slider that finished earlier, reporting late
    clock += SLOW_STEP_MS
    nudgeJoint(store, 'joint')

    expect(store.getState().past).toHaveLength(1)
  })

  it('closes a session that never reports its end, so two gestures cannot merge', async () => {
    const store = await loadStore()
    nudgeJoint(store, 'joint')
    clock += SAFETY_TIMEOUT_MS + 1
    nudgeJoint(store, 'joint')

    expect(store.getState().past).toHaveLength(2)
  })

  it('gives an edit with no coalesce key its own undo step', async () => {
    const store = await loadStore()
    nudgeJoint(store)
    nudgeJoint(store)

    expect(store.getState().past).toHaveLength(2)
  })
})

describe('a Recommended tile following the wall', () => {
  async function editor() {
    const store = await loadStore()
    const { studioEditor } = await import('@/features/studio/useStudioUpdate')
    const { tileChoiceKind } = await import('@/features/studio/tileOptions')
    type Memo = Parameters<typeof tileChoiceKind>[0]
    let memo: Memo = null
    const edit = studioEditor(store, { get: () => memo, set: (next) => void (memo = next) })
    const setWall = (surface: { width?: number; height?: number }, coalesce?: string) =>
      edit.update((draft) => ({ ...draft, surface: { ...draft.surface, ...surface } }), coalesce ? { coalesce } : undefined)
    const choice = () => tileChoiceKind(memo, store.getState().config)
    return { store, ...edit, setWall, choice }
  }

  it('is one undo step with the wall edit, and one for a whole stepper session', async () => {
    const { store, setWall } = await editor()
    const start = store.getState().config
    setWall({ width: 1000 })
    expect(store.getState().config.tile).toMatchObject({ width: 200, height: 200 })
    expect(store.getState().past).toHaveLength(1)
    store.getState().undo()
    expect(store.getState().config).toEqual(start)

    for (let width = 1210; width <= 1300; width += 10) {
      clock += 50
      setWall({ width }, 'surface.width')
    }
    expect(store.getState().past).toHaveLength(1)
    expect(store.getState().config.tile.width).not.toBe(start.tile.width)
    store.getState().undo()
    expect(store.getState().config).toEqual(start)
  })

  it('never rewrites a tile pinned on Custom', async () => {
    const { store, chooseTile, setWall } = await editor()
    const start = store.getState().config
    chooseTile('custom')
    setWall({ width: 1000 })
    expect(store.getState().config.surface.width).toBe(1000)
    expect(store.getState().config.tile).toEqual(start.tile)
  })

  it('keeps a familiar size through wall edits that make it, then unmake it, the recommendation', async () => {
    const { store, chooseTile, setWall, choice } = await editor()
    chooseTile('size', { width: 100, height: 100 })
    setWall({ width: 1300 })
    setWall({ height: 750 })
    expect(store.getState().config.tile).toMatchObject({ width: 100, height: 100 })
    expect(choice()).toBe('size')
  })

  it('follows again once an undo leaves the design back on its recommendation', async () => {
    const { store, chooseTile, setWall, choice } = await editor()
    setWall({ width: 1400 })
    chooseTile('custom', { width: 161, height: 150 })
    store.getState().undo()
    expect(choice()).toBe('recommended')
    setWall({ height: 700 })
    expect(store.getState().config.tile).toMatchObject({ width: 175, height: 175 })
  })

  it('reads a design loaded over a Custom pin as the design shows it', async () => {
    const { store, chooseTile, setWall, choice } = await editor()
    chooseTile('custom', { width: 163, height: 150 })
    const shared = { ...store.getState().config, surface: { width: 1000, height: 600 }, tile: { ...store.getState().config.tile, width: 200, height: 200 } }
    store.getState().load(shared)
    expect(choice()).toBe('recommended')
    setWall({ width: 1200 })
    expect(store.getState().config.tile).toMatchObject({ width: 150, height: 150 })
  })
})

describe('rehydrating a design saved before colors were hexes', () => {
  it('keeps the color its retired filament id stood for, under the same store version', async () => {
    const { DEFAULT_CONFIG } = await import('@/core/config')
    // The shape a version 1 store really holds: a filament id and no color field.
    const legacy: Record<string, unknown> = { ...DEFAULT_CONFIG, colorId: 'pla-matte-terracotta', joint: 2 }
    delete legacy.color
    window.localStorage.setItem('tessera.design.v1', JSON.stringify({ state: { config: legacy }, version: 1 }))
    const store = await loadStore()
    expect(store.getState().config.color).toBe('#B15533')
    expect(store.getState().config.joint).toBe(2)
    expect(store.getState().config).not.toHaveProperty('colorId')
  })
})
