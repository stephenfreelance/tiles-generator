import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, DEFAULT_PERIMETER } from '@/core/config'
import type { DesignConfig, PieceEdges } from '@/core/types'
import { ChipCache, chipCacheKey, chipEdgesKey, nextShown, planBatches, ShadeLedger, SharedRender } from './chipCache'

/** Two texture chips in one colour, as the picker keys them. */
const inColour = (colour: string) => [
  { key: 'arches', cacheKey: `arches|${colour}` },
  { key: 'wavy', cacheKey: `wavy|${colour}` },
]
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('nextShown', () => {
  it('records the current images once cached, and keeps the old fallback for the rest', () => {
    const cached = new Set(['arches|red', 'wavy|red', 'arches|blue'])
    const red = nextShown({}, inColour('red'), (k) => cached.has(k))
    expect(red).toEqual({ arches: 'arches|red', wavy: 'wavy|red' })
    expect(nextShown(red, inColour('blue'), (k) => cached.has(k))).toEqual({ arches: 'arches|blue', wavy: 'wavy|red' })
  })

  it('returns the same object when nothing changed', () => {
    const cached = new Set(['arches|red', 'wavy|red'])
    const red = nextShown({}, inColour('red'), (k) => cached.has(k))
    expect(nextShown(red, inColour('red'), (k) => cached.has(k))).toBe(red)
  })

  it('moves to a fully cached colour, so a cold pick after it falls back one step, never two', () => {
    const cached = new Set(['arches|red', 'wavy|red', 'arches|blue', 'wavy|blue'])
    const has = (k: string) => cached.has(k)
    // Red rendered, then blue rendered: blue is the fallback.
    let shown = nextShown(nextShown({}, inColour('red'), has), inColour('blue'), has)
    // Back to red, all cached: nothing lands, but the hook records it when the change starts.
    shown = nextShown(shown, inColour('red'), has)
    expect(shown).toEqual({ arches: 'arches|red', wavy: 'wavy|red' })
    // Grey is new: while it renders the chips show red, the colour just before, not blue.
    shown = nextShown(shown, inColour('grey'), has)
    expect(shown).toEqual({ arches: 'arches|red', wavy: 'wavy|red' })
  })

  it('drops items that left the strip', () => {
    const shown = nextShown({ arches: 'arches|red', gone: 'gone|red' }, inColour('red').slice(0, 1), () => true)
    expect(shown).toEqual({ arches: 'arches|red' })
  })
})

describe('planBatches', () => {
  it('sends shaded chips in one request, before the rest in small batches', () => {
    const chips = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(planBatches(chips, (n) => n % 2 === 0, 3)).toEqual([[2, 4, 6, 8], [1, 3, 5], [7]])
    expect(planBatches(chips, () => true, 3)).toEqual([chips])
    expect(planBatches(chips, () => false, 6)).toEqual([[1, 2, 3, 4, 5, 6], [7, 8]])
    expect(planBatches([], () => true, 6)).toEqual([])
  })
})

describe('ShadeLedger', () => {
  it('forgets the least recently rendered shade past its budget', () => {
    const ledger = new ShadeLedger(10)
    ledger.add('a', 4)
    ledger.add('b', 4)
    ledger.add('a', 4)
    ledger.add('c', 4)
    expect(['a', 'b', 'c'].map((k) => ledger.has(k))).toEqual([true, false, true])
    ledger.add('huge', 11)
    expect(ledger.has('huge')).toBe(false)
    expect(ledger.has('a') && ledger.has('c')).toBe(true)
  })
})

describe('SharedRender', () => {
  const pending = () => {
    let resolve!: () => void
    const promise = new Promise<void>((r) => (resolve = r))
    return { promise, resolve }
  }

  it('cancels once its only holder aborts', async () => {
    const { promise } = pending()
    let cancels = 0
    const render = new SharedRender(promise, () => cancels++)
    const holder = new AbortController()
    render.hold(holder.signal)
    holder.abort()
    await tick()
    expect(cancels).toBe(1)
    expect(render.cancelled).toBe(true)
  })

  it('keeps running while a second strip still holds it', async () => {
    const { promise } = pending()
    let cancels = 0
    const render = new SharedRender(promise, () => cancels++)
    const studio = new AbortController()
    const schedule = new AbortController()
    render.hold(studio.signal)
    render.hold(schedule.signal)
    studio.abort()
    await tick()
    expect(cancels).toBe(0)
    schedule.abort()
    await tick()
    expect(cancels).toBe(1)
  })

  it('survives a holder that lets go and is replaced in the same commit', async () => {
    const { promise } = pending()
    let cancels = 0
    const render = new SharedRender(promise, () => cancels++)
    const first = new AbortController()
    render.hold(first.signal)
    // StrictMode, or a strip remounting: the cleanup and the next effect run back to back.
    first.abort()
    render.hold(new AbortController().signal)
    await tick()
    expect(cancels).toBe(0)
    expect(render.cancelled).toBe(false)
  })

  it('never cancels a render that already finished', async () => {
    const { promise, resolve } = pending()
    let cancels = 0
    const render = new SharedRender(promise, () => cancels++)
    const holder = new AbortController()
    render.hold(holder.signal)
    resolve()
    await tick()
    holder.abort()
    await tick()
    expect(cancels).toBe(0)
  })

  it('ignores an already aborted holder', async () => {
    const { promise } = pending()
    let cancels = 0
    const render = new SharedRender(promise, () => cancels++)
    const gone = new AbortController()
    gone.abort()
    render.hold(gone.signal)
    await tick()
    expect(cancels).toBe(0)
  })
})

describe('ChipCache', () => {
  it('evicts the least recently used entry and revokes its URL', () => {
    const revoked: string[] = []
    const cache = new ChipCache(2, (url) => revoked.push(url))
    cache.set('a', 'blob:a')
    cache.set('b', 'blob:b')
    cache.pin(['a'])()
    cache.set('c', 'blob:c')
    expect(revoked).toEqual(['blob:b'])
    expect(cache.has('a')).toBe(true)
    expect(cache.size).toBe(2)
  })

  it('never revokes a pinned URL, then catches up once released', () => {
    const revoked: string[] = []
    const cache = new ChipCache(1, (url) => revoked.push(url))
    cache.set('a', 'blob:a')
    const release = cache.pin(['a'])
    cache.set('b', 'blob:b')
    expect(revoked).toEqual([])
    expect(cache.size).toBe(2)
    release()
    expect(revoked).toEqual(['blob:a'])
    expect(cache.peek('b')).toBe('blob:b')
  })

  it('revokes a replaced URL for the same key', () => {
    const revoked: string[] = []
    const cache = new ChipCache(4, (url) => revoked.push(url))
    cache.set('a', 'blob:1')
    cache.set('a', 'blob:2')
    expect(revoked).toEqual(['blob:1'])
    expect(cache.peek('a')).toBe('blob:2')
  })

  it('counts pins from several holders', () => {
    const revoked: string[] = []
    const cache = new ChipCache(1, (url) => revoked.push(url))
    cache.set('a', 'blob:a')
    const first = cache.pin(['a'])
    const second = cache.pin(['a'])
    cache.pin(['b'])
    cache.set('b', 'blob:b')
    first()
    expect(revoked).toEqual([])
    second()
    expect(revoked).toEqual(['blob:a'])
  })
})

describe('chipCacheKey', () => {
  const crop = { x0: 0, y0: 0, x1: 150, y1: 40 }
  const bordered: DesignConfig = { ...DEFAULT_CONFIG, perimeter: { ...DEFAULT_PERIMETER, profile: 'margin' } }
  const edges = (profiled: PieceEdges['profiled'], boundary = 0): PieceEdges => ({ boundary, tabs: 0, profiled })

  it('tells border pieces apart when the design has a profile', () => {
    const keys = [
      chipCacheKey({ config: bordered, crop }, 96),
      chipCacheKey({ config: bordered, crop, edges: edges({ bottom: 0 }) }, 96),
      chipCacheKey({ config: bordered, crop, edges: edges({ bottom: 0, left: 0 }) }, 96),
      chipCacheKey({ config: bordered, crop, edges: edges({ bottom: 6 }) }, 96),
      chipCacheKey({ config: bordered, crop, edges: edges({ top: 0 }) }, 96),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('ignores edges nothing shapes: no profile, or only the back', () => {
    const plain = chipCacheKey({ config: DEFAULT_CONFIG, crop }, 96)
    expect(chipCacheKey({ config: DEFAULT_CONFIG, crop, edges: edges({ bottom: 0 }) }, 96)).toBe(plain)
    expect(chipCacheKey({ config: bordered, crop, edges: edges({ bottom: 0 }, 5) }, 96)).toBe(
      chipCacheKey({ config: bordered, crop, edges: edges({ bottom: 0 }) }, 96),
    )
    expect(chipEdgesKey(DEFAULT_CONFIG, edges({ bottom: 0 }))).toBe('')
  })

  it('moves with a band the surface clamps, which the geometry key leaves out', () => {
    const narrow = { ...bordered, surface: { width: 50, height: 600 }, perimeter: { ...bordered.perimeter, width: 30 } }
    const wide = { ...narrow, surface: { width: 500, height: 600 } }
    const border = { crop, edges: edges({ left: 0 }) }
    expect(chipCacheKey({ ...border, config: narrow }, 96)).not.toBe(chipCacheKey({ ...border, config: wide }, 96))
  })
})

