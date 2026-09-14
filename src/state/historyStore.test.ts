import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '@/core/config'
import type { DesignConfig } from '@/core/types'

// The store is only ever as good as what it reads back, so these tests drive the two paths that see
// data nobody wrote on purpose: rehydrating a corrupted localStorage, and saving into a full one.

type HistoryStore = (typeof import('./historyStore'))['useHistory']

// Not exported by the store: kept in step with STORAGE_KEY / STORAGE_VERSION / MAX_ENTRIES there.
const KEY = 'tessera.history.v1'
const VERSION = 1
const CAPACITY = 40

const payload = (entries: unknown) => JSON.stringify({ state: { entries }, version: VERSION })
const design = (name: string): DesignConfig => normalizeConfig({ ...DEFAULT_CONFIG, name })

/** localStorage with a byte budget, so the quota path is exercised the way a real browser hits it. */
class FakeStorage {
  private items = new Map<string, string>()
  /** Total bytes the store may hold; a write past it throws like a browser at quota. */
  limit = Number.POSITIVE_INFINITY
  /** A private window or blocked site data fails every write, and no shedding can help. */
  blocked = false

  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.blocked) throw new Error('The operation is insecure.')
    let used = value.length
    for (const [name, held] of this.items) if (name !== key) used += held.length
    if (used > this.limit) throw new DOMException('Quota exceeded', 'QuotaExceededError')
    this.items.set(key, value)
  }

  removeItem(key: string): void {
    this.items.delete(key)
  }

  /** Writes past the limit, to put a payload in place before the store reads it. */
  seed(key: string, value: string): void {
    this.items.set(key, value)
  }

  length(key: string): number {
    return this.getItem(key)?.length ?? 0
  }
}

let storage: FakeStorage
let warn: ReturnType<typeof vi.spyOn>

/** Fresh module registry each time: the store hydrates once, at import. */
async function loadStore(seeded?: string): Promise<HistoryStore> {
  storage = new FakeStorage()
  if (seeded !== undefined) storage.seed(KEY, seeded)
  // storage.ts banks deferred writes on pagehide, so the stub needs the listener it registers.
  vi.stubGlobal('window', { localStorage: storage, addEventListener: () => {}, removeEventListener: () => {} })
  vi.resetModules()
  const { useHistory } = await import('./historyStore')
  await useHistory.persist.rehydrate()
  return useHistory
}

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('rehydrating a corrupted store', () => {
  it('starts empty when entries is not an array', async () => {
    for (const entries of ['garbage', 42, null, { 0: 'first' }]) {
      const store = await loadStore(payload(entries))
      expect(store.getState().entries).toEqual([])
    }
  })

  it('drops anything that is not an entry with an id', async () => {
    const keeper = { id: 'keep-me', config: design('Niche'), createdAt: 1, updatedAt: 2, validated: true }
    const store = await loadStore(payload([null, 42, 'x', {}, [], { config: design('No id') }, { id: 7 }, keeper]))
    expect(store.getState().entries.map((e) => e.id)).toEqual(['keep-me'])
  })

  it('normalizes every stored config, so a hand-edited store cannot inject a bad design', async () => {
    const store = await loadStore(
      payload([
        { id: 'a', config: { surface: { width: -5, height: Number.NaN }, tile: { width: '90' } }, validated: 'yes' },
        { id: 'b' },
      ]),
    )
    const [first, second] = store.getState().entries
    expect(first.config.surface).toEqual({ width: 50, height: DEFAULT_CONFIG.surface.height })
    expect(first.config.tile.width).toBe(DEFAULT_CONFIG.tile.width)
    expect(first.validated).toBe(true) // coerced, not trusted
    // A missing config is still a usable entry: it comes back as the default design.
    expect(second.config).toEqual(DEFAULT_CONFIG)
    expect(second.validated).toBe(false)
  })

  it('starts empty when the stored value is not JSON at all', async () => {
    const store = await loadStore('{ not json')
    expect(store.getState().entries).toEqual([])
  })

  it('repairs every timestamp, so one bad row cannot hide the register', async () => {
    const store = await loadStore(
      payload([
        { id: 'no-stamp', config: design('No stamp') },
        { id: 'null-stamp', createdAt: null, updatedAt: null },
        { id: 'text-stamp', createdAt: 'whenever', updatedAt: 'whenever' },
        { id: 'huge-stamp', updatedAt: 1e99 },
        { id: 'negative-stamp', createdAt: -9, updatedAt: -5 },
        { id: 'iso-stamp', updatedAt: '2026-01-02T03:04:05.000Z' },
        { id: 'good', createdAt: 1000, updatedAt: 2000 },
      ]),
    )
    const entries = store.getState().entries
    expect(entries).toHaveLength(7) // a bad stamp is repaired, never a reason to lose the drawing

    for (const entry of entries) {
      expect(Number.isFinite(entry.createdAt)).toBe(true)
      expect(Number.isFinite(entry.updatedAt)).toBe(true)
      // Exactly what RegisterRow does with every row it draws.
      expect(() => new Date(entry.updatedAt).toISOString()).not.toThrow()
    }

    const byId = new Map(entries.map((e) => [e.id, e]))
    expect(byId.get('good')?.updatedAt).toBe(2000)
    expect(byId.get('good')?.createdAt).toBe(1000)
    expect(byId.get('iso-stamp')?.updatedAt).toBe(Date.parse('2026-01-02T03:04:05.000Z'))
    // A missing createdAt takes the row's own updatedAt rather than a second guess.
    expect(byId.get('iso-stamp')?.createdAt).toBe(byId.get('iso-stamp')?.updatedAt)
  })

  it('keeps only a thumbnail the browser can draw offline', async () => {
    const store = await loadStore(
      payload([
        { id: 'remote', thumbnail: 'https://example.com/shot.png' },
        { id: 'not-text', thumbnail: 42 },
        { id: 'real', thumbnail: 'data:image/webp;base64,aaa' },
      ]),
    )
    const byId = new Map(store.getState().entries.map((e) => [e.id, e]))

    expect(byId.get('remote')?.thumbnail).toBeUndefined() // the app never reaches the network
    expect(byId.get('not-text')?.thumbnail).toBeUndefined()
    expect(byId.get('real')?.thumbnail).toBe('data:image/webp;base64,aaa')
  })

  it('keeps one row per id, so a rename cannot land on two drawings', async () => {
    const store = await loadStore(
      payload([
        { id: 'twin', config: design('First'), updatedAt: 2 },
        { id: 'twin', config: design('Second'), updatedAt: 1 },
      ]),
    )
    const entries = store.getState().entries

    expect(entries).toHaveLength(1)
    expect(entries[0].config.name).toBe('First')
  })

  it('trims a store that grew past the cap, keeping the newest', async () => {
    const stored = Array.from({ length: 50 }, (_, i) => ({
      id: `entry-${i}`,
      config: design(`Design ${i}`),
      createdAt: 1000 + i,
      updatedAt: 1000 + i,
      validated: false,
    }))
    const store = await loadStore(payload(stored))
    const entries = store.getState().entries

    expect(entries).toHaveLength(CAPACITY) // never "50 of 40 designs"
    expect(entries[0].id).toBe('entry-49')
    expect(new Set(entries.map((e) => e.id))).toEqual(new Set(stored.slice(10).map((e) => e.id)))
  })
})

describe('saving into a full store', () => {
  const thumbnail = (mark: string) => `data:image/webp;base64,${mark.repeat(20_000)}`

  /** Three saved drawings, each with a fat thumbnail, written while storage is still roomy. */
  async function threeWithThumbnails(): Promise<HistoryStore> {
    const store = await loadStore()
    store.getState().save(design('first'), { thumbnail: thumbnail('a') })
    store.getState().save(design('second'), { thumbnail: thumbnail('b') })
    store.getState().save(design('third'), { thumbnail: thumbnail('c') })
    return store
  }

  it('refreshes a design already saved instead of duplicating it', async () => {
    const store = await loadStore()
    const config = design('Splashback')
    const first = store.getState().save(config, { thumbnail: 'data:image/webp;base64,aaa' })
    const again = store.getState().save(config, { validated: true })

    expect(store.getState().entries).toHaveLength(1)
    expect(again.id).toBe(first.id)
    expect(again.validated).toBe(true)
    expect(again.thumbnail).toBe('data:image/webp;base64,aaa') // kept: the new save carried none
    expect(again.updatedAt).toBeGreaterThanOrEqual(first.createdAt)
  })

  it('sheds the oldest thumbnail first, and keeps every drawing', async () => {
    const store = await threeWithThumbnails()
    // Room for one more entry but not for a fourth thumbnail: exactly one shed is needed.
    storage.limit = storage.length(KEY) + 5_000

    store.getState().save(design('fourth'), { thumbnail: thumbnail('d') })
    const entries = store.getState().entries

    expect(entries.map((e) => e.config.name)).toEqual(['fourth', 'third', 'second', 'first'])
    expect(entries[0].thumbnail).toBeDefined() // the drawing being saved keeps its picture
    expect(entries[1].thumbnail).toBeDefined()
    expect(entries[2].thumbnail).toBeDefined()
    expect(entries[3].thumbnail).toBeUndefined() // the oldest picture is the cheapest thing to lose
    // The save really landed: what is on disk is what the store believes.
    expect(JSON.parse(storage.getItem(KEY) ?? '').state.entries).toEqual(entries)
  })

  it('drops whole drawings once no thumbnail is left, keeping the one being saved', async () => {
    const store = await loadStore()
    store.getState().save(design('first'))
    store.getState().save(design('second'))
    store.getState().save(design('third'))
    storage.limit = storage.length(KEY) - 10 // not even today's list fits any more

    store.getState().save(design('fourth'))
    const entries = store.getState().entries

    expect(entries[0].config.name).toBe('fourth')
    expect(entries.length).toBeLessThan(4)
    expect(entries.map((e) => e.config.name)).not.toContain('first')
    expect(JSON.parse(storage.getItem(KEY) ?? '').state.entries).toEqual(entries)
  })

  it('keeps the new drawing in memory when nothing at all can be persisted', async () => {
    const store = await threeWithThumbnails()
    storage.limit = 10

    const saved = store.getState().save(design('only'))

    expect(store.getState().entries).toHaveLength(1)
    expect(saved.config.name).toBe('only')
    expect(warn).toHaveBeenCalled() // the write is reported, not swallowed in silence
  })

  it('does not shed when storage is unavailable rather than full', async () => {
    const store = await threeWithThumbnails()
    storage.blocked = true // a private window: dropping thumbnails would not help

    store.getState().save(design('fourth'), { thumbnail: thumbnail('d') })
    const entries = store.getState().entries

    expect(entries).toHaveLength(4)
    expect(entries.every((e) => e.thumbnail !== undefined)).toBe(true)
    expect(warn).toHaveBeenCalled()
  })
})
