/**
 * LRU of chip object URLs. Evicted URLs are revoked, except pinned ones: a URL still on screen must
 * stay valid, so the cache may run over capacity until the component that shows it lets go.
 */
export class ChipCache {
  /** Map order is recency order: the first entry is the least recently used. */
  private readonly entries = new Map<string, string>()
  private readonly pins = new Map<string, number>()

  constructor(
    private readonly capacity: number,
    private readonly revoke: (url: string) => void,
  ) {}

  get size(): number {
    return this.entries.size
  }

  has(key: string): boolean {
    return this.entries.has(key)
  }

  /** Reads without refreshing recency (safe during render). */
  peek(key: string): string | undefined {
    return this.entries.get(key)
  }

  set(key: string, url: string): void {
    const previous = this.entries.get(key)
    if (previous !== undefined && previous !== url) this.revoke(previous)
    this.entries.delete(key)
    this.entries.set(key, url)
    // The chip just rendered is about to be shown; never evict it in the same breath.
    this.evict(key)
  }

  /** Keeps keys alive and marks them recently used; returns the release function. */
  pin(keys: Iterable<string>): () => void {
    const held = [...new Set(keys)]
    for (const key of held) {
      this.pins.set(key, (this.pins.get(key) ?? 0) + 1)
      const url = this.entries.get(key)
      if (url !== undefined) {
        this.entries.delete(key)
        this.entries.set(key, url)
      }
    }
    return () => {
      for (const key of held) {
        const count = (this.pins.get(key) ?? 1) - 1
        if (count > 0) this.pins.set(key, count)
        else this.pins.delete(key)
      }
      this.evict()
    }
  }

  private evict(keep?: string): void {
    if (this.entries.size <= this.capacity) return
    for (const [key, url] of this.entries) {
      if (this.entries.size <= this.capacity) break
      if (key === keep || this.pins.has(key)) continue
      this.entries.delete(key)
      this.revoke(url)
    }
  }
}
