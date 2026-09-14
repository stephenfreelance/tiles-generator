import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const DESIGN = 'tessera.design.v1'
const HISTORY = 'tessera.history.v1'

/** The module reads window.localStorage and registers flush listeners at import, so stand both up first. */
function installDom() {
  const disk = new Map<string, string>()
  const handlers = new Map<string, (() => void)[]>()
  const listen = (type: string, handler: () => void) => {
    handlers.set(type, [...(handlers.get(type) ?? []), handler])
  }
  const localStorage = {
    getItem: (key: string) => disk.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      disk.set(key, value)
    }),
    removeItem: (key: string) => {
      disk.delete(key)
    },
  }
  const doc = { visibilityState: 'visible', addEventListener: listen }
  vi.stubGlobal('window', { localStorage, addEventListener: listen })
  vi.stubGlobal('document', doc)
  return { disk, localStorage, doc, fire: (type: string) => (handlers.get(type) ?? []).forEach((h) => h()) }
}

async function loadStorage() {
  vi.resetModules()
  return import('./storage')
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('coalesces a burst of writes into one, and reads the newest value while it waits', async () => {
  const dom = installDom()
  const { safeLocalStorage } = await loadStorage()

  for (let i = 0; i < 20; i++) safeLocalStorage.setItem(DESIGN, `v${i}`)
  expect(dom.localStorage.setItem).not.toHaveBeenCalled()
  // A drag reads its own writes back through the store, so memory has to answer before the timer fires.
  expect(safeLocalStorage.getItem(DESIGN)).toBe('v19')

  await vi.advanceTimersByTimeAsync(500)
  expect(dom.localStorage.setItem).toHaveBeenCalledTimes(1)
  expect(dom.disk.get(DESIGN)).toBe('v19')
})

it('writes what is waiting when the tab goes away', async () => {
  const dom = installDom()
  const { safeLocalStorage } = await loadStorage()

  safeLocalStorage.setItem(DESIGN, 'last edit')
  dom.fire('pagehide')
  expect(dom.disk.get(DESIGN)).toBe('last edit')
})

it('writes what is waiting when the tab is hidden', async () => {
  const dom = installDom()
  const { safeLocalStorage } = await loadStorage()

  safeLocalStorage.setItem(DESIGN, 'hidden edit')
  dom.doc.visibilityState = 'hidden'
  dom.fire('visibilitychange')
  expect(dom.disk.get(DESIGN)).toBe('hidden edit')
})

it('leaves the tab-hidden flush alone while the tab is still visible', async () => {
  const dom = installDom()
  const { safeLocalStorage } = await loadStorage()

  safeLocalStorage.setItem(DESIGN, 'still editing')
  dom.fire('visibilitychange')
  expect(dom.localStorage.setItem).not.toHaveBeenCalled()
})

it('writes an explicit save straight to disk', async () => {
  const dom = installDom()
  const { safeLocalStorage } = await loadStorage()

  safeLocalStorage.setItem(HISTORY, 'saved design')
  expect(dom.disk.get(HISTORY)).toBe('saved design')
  expect(dom.localStorage.setItem).toHaveBeenCalledTimes(1)
})

it('does not let a queued write resurrect a removed key', async () => {
  const dom = installDom()
  const { safeLocalStorage } = await loadStorage()

  safeLocalStorage.setItem(DESIGN, 'doomed')
  safeLocalStorage.removeItem(DESIGN)
  await vi.advanceTimersByTimeAsync(500)
  expect(dom.disk.has(DESIGN)).toBe(false)
  expect(safeLocalStorage.getItem(DESIGN)).toBe(null)
})

it('keeps the session alive when localStorage itself throws', async () => {
  const dom = installDom()
  dom.localStorage.setItem.mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError')
  })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const { safeLocalStorage } = await loadStorage()

  safeLocalStorage.setItem(DESIGN, 'memory only')
  await vi.advanceTimersByTimeAsync(500)
  expect(safeLocalStorage.getItem(DESIGN)).toBe('memory only')
  warn.mockRestore()
})
