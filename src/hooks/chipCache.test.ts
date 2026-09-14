import { describe, expect, it } from 'vitest'
import { ChipCache } from './chipCache'

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
