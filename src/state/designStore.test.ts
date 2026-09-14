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
