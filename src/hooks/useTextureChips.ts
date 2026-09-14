import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import type { CropRect, DesignConfig } from '@/core/types'
import { geometryClient } from '@/workers/geometryClient'
import type { ChipImage } from '@/workers/protocol'
import { isAbortError } from './abort'
import { ChipCache } from './chipCache'
import { cropKey, geometryKey } from './geometryKey'

export interface ChipItem {
  key: string
  config: DesignConfig
  crop?: CropRect
}

const CHIP_CACHE_SIZE = 120
/** Small batches so the picker fills in progressively instead of all at once. */
const BATCH_SIZE = 6

// Shared by every chip strip on the page: the picker and the schedule reuse each other's renders.
const cache = new ChipCache(CHIP_CACHE_SIZE, (url) => URL.revokeObjectURL(url))
const inflight = new Map<string, Promise<void>>()

/** Chip identity: the relief, the color, the piece shape and the pixel size. */
export const chipCacheKey = (item: Pick<ChipItem, 'config' | 'crop'>, sizePx: number): string =>
  `${geometryKey(item.config)}|${item.config.colorId}|${cropKey(item.crop)}|${sizePx}`

/** ImageData needs pixels on a plain ArrayBuffer; worker results always are, but stay safe. */
function toImageData(chip: ChipImage): ImageData {
  const { data } = chip
  const pixels =
    data.buffer instanceof ArrayBuffer ? new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) : new Uint8ClampedArray(data)
  return new ImageData(pixels, chip.width, chip.height)
}

async function chipToUrl(chip: ChipImage): Promise<string> {
  const image = toImageData(chip)
  let blob: Blob
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(chip.width, chip.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2D canvas unavailable')
    context.putImageData(image, 0, 0)
    blob = await canvas.convertToBlob({ type: 'image/png' })
  } else {
    const canvas = document.createElement('canvas')
    canvas.width = chip.width
    canvas.height = chip.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2D canvas unavailable')
    context.putImageData(image, 0, 0)
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
    )
  }
  return URL.createObjectURL(blob)
}

interface PendingChip {
  cacheKey: string
  config: DesignConfig
  crop?: CropRect
}

/** Renders one batch in the worker and stores PNG URLs; concurrent callers share the promise. */
function renderBatch(batch: PendingChip[], sizePx: number): Promise<void> {
  const job = geometryClient
    .request({ kind: 'chips', sizePx, items: batch.map((c) => ({ key: c.cacheKey, config: c.config, crop: c.crop })) })
    .then(async (result) => {
      const urls = await Promise.all(result.chips.map(async (chip) => [chip.key, await chipToUrl(chip)] as const))
      for (const [key, url] of urls) cache.set(key, url)
    })
  for (const chip of batch) inflight.set(chip.cacheKey, job)
  const forget = () => {
    for (const chip of batch) if (inflight.get(chip.cacheKey) === job) inflight.delete(chip.cacheKey)
  }
  job.then(forget, forget)
  return job
}

/**
 * Lit relief swatches as PNG object URLs, keyed by item key. Fills in progressively; while a chip
 * re-renders (new color, new depth) the previous image for that item stays visible.
 * `base` is the current design: chips of its texture render first.
 */
export function useTextureChips(base: DesignConfig, items: ChipItem[], sizePx: number): Map<string, string> {
  const [, setLanded] = useState(0)
  /** Item key -> cache key of the last image shown for it. */
  const [lastShown, setLastShown] = useState<Record<string, string>>({})

  const entries = items.map((item) => ({ key: item.key, cacheKey: chipCacheKey(item, sizePx) }))
  const itemsKey = JSON.stringify(entries)

  const fill = useEffectEvent(async (signal: AbortSignal) => {
    const current = base.texture.id
    const ordered = [...items].sort(
      (a, b) => Number(b.config.texture.id === current) - Number(a.config.texture.id === current),
    )
    const todo = new Map<string, PendingChip>()
    const waiting = new Set<Promise<void>>()
    for (const item of ordered) {
      const key = chipCacheKey(item, sizePx)
      if (cache.has(key) || todo.has(key)) continue
      const running = inflight.get(key)
      if (running) waiting.add(running)
      else todo.set(key, { cacheKey: key, config: item.config, crop: item.crop })
    }

    const landed = () => {
      if (signal.aborted) return
      setLanded((n) => n + 1)
      setLastShown((prev) => {
        const next: Record<string, string> = {}
        let changed = Object.keys(prev).length !== entries.length
        for (const entry of entries) {
          const shown = cache.has(entry.cacheKey) ? entry.cacheKey : prev[entry.key]
          if (shown !== undefined) next[entry.key] = shown
          if (next[entry.key] !== prev[entry.key]) changed = true
        }
        return changed ? next : prev
      })
    }

    for (const promise of waiting) promise.then(landed, () => {})
    const queue = [...todo.values()]
    for (let i = 0; i < queue.length; i += BATCH_SIZE) {
      // Changed items stop the queue; a batch already in the worker still lands in the cache.
      if (signal.aborted) return
      try {
        await renderBatch(queue.slice(i, i + BATCH_SIZE), sizePx)
        landed()
      } catch (error) {
        if (!isAbortError(error)) console.warn('[chips] could not render texture chips', error)
        return
      }
    }
  })

  useEffect(() => {
    const controller = new AbortController()
    void fill(controller.signal)
    return () => controller.abort()
  }, [itemsKey])

  // Pin what this strip shows so the LRU never revokes a URL that is on screen.
  const pinnedKey = JSON.stringify([...entries.map((e) => e.cacheKey), ...Object.values(lastShown)])
  useEffect(() => cache.pin(JSON.parse(pinnedKey) as string[]), [pinnedKey])

  const shown: [string, string][] = []
  for (const entry of entries) {
    const url = cache.peek(entry.cacheKey) ?? (lastShown[entry.key] ? cache.peek(lastShown[entry.key]) : undefined)
    if (url) shown.push([entry.key, url])
  }
  const signature = JSON.stringify(shown)
  return useMemo(() => new Map<string, string>(JSON.parse(signature) as [string, string][]), [signature])
}
