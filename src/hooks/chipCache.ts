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

export interface ShownEntry {
  /** The item (a texture, a piece). */
  key: string
  /** The image it wants now. */
  cacheKey: string
}

/**
 * Item key -> cache key of the image each item falls back to while its own renders: its current
 * image once that is cached, else what was recorded before. Returns `prev` itself when nothing moved.
 */
export function nextShown(
  prev: Readonly<Record<string, string>>,
  entries: readonly ShownEntry[],
  has: (cacheKey: string) => boolean,
): Readonly<Record<string, string>> {
  const next: Record<string, string> = {}
  let changed = Object.keys(prev).length !== entries.length
  for (const entry of entries) {
    const shown = has(entry.cacheKey) ? entry.cacheKey : prev[entry.key]
    if (shown !== undefined) next[entry.key] = shown
    if (next[entry.key] !== prev[entry.key]) changed = true
  }
  return changed ? next : prev
}

/**
 * Worker requests for the chips a strip still needs, in order. Chips whose shade the worker holds
 * are only a tint away, so they go together in one request and land in one commit; the rest are
 * drawn from scratch in small batches so a first fill appears progressively.
 */
export function planBatches<T>(queue: readonly T[], shaded: (chip: T) => boolean, batchSize: number): T[][] {
  const warm = queue.filter(shaded)
  const cold = queue.filter((chip) => !shaded(chip))
  const batches = warm.length > 0 ? [warm] : []
  for (let i = 0; i < cold.length; i += batchSize) batches.push(cold.slice(i, i + batchSize))
  return batches
}

/**
 * The chips worker's shade cache as the page can judge it: the shades it finished, under the worker's
 * own byte budget. Each is counted at the largest a shade can be, so the ledger forgets first.
 */
export class ShadeLedger {
  /** Map order is recency order, as in the worker. */
  private readonly entries = new Map<string, number>()
  private used = 0

  constructor(private readonly maxBytes: number) {}

  has(key: string): boolean {
    return this.entries.has(key)
  }

  add(key: string, bytes: number): void {
    const previous = this.entries.get(key)
    if (previous !== undefined) {
      this.used -= previous
      this.entries.delete(key)
    }
    if (bytes > this.maxBytes) return
    this.entries.set(key, bytes)
    this.used += bytes
    for (const [oldest, size] of this.entries) {
      if (this.used <= this.maxBytes) break
      this.entries.delete(oldest)
      this.used -= size
    }
  }
}

/**
 * A render several chip strips can wait on. Each one holds it with its effect's AbortSignal, and the
 * render is cancelled only once every holder has aborted. The check waits a microtask, so a strip
 * that picks the render up again in the same commit (StrictMode, a second strip) keeps it running.
 */
export class SharedRender {
  private holders = 0
  private settled = false
  private dropped = false

  constructor(
    readonly promise: Promise<void>,
    private readonly cancel: () => void,
  ) {
    const done = () => {
      this.settled = true
    }
    promise.then(done, done)
  }

  /** True once cancelled: a strip that finds it must render those chips itself. */
  get cancelled(): boolean {
    return this.dropped
  }

  /** Keeps the render alive until `signal` aborts. */
  hold(signal: AbortSignal): void {
    if (this.dropped || signal.aborted) return
    this.holders++
    signal.addEventListener('abort', () => this.release(), { once: true })
  }

  private release(): void {
    this.holders--
    if (this.holders > 0) return
    queueMicrotask(() => {
      if (this.holders > 0 || this.settled || this.dropped) return
      this.dropped = true
      this.cancel()
    })
  }
}
