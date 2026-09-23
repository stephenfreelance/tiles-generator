import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { CHIP_SHADE_BUDGET_BYTES, reliefShadeBytes, reliefShadeKey } from '@/core/textures/hillshade'
import type { CropRect, DesignConfig, PieceEdges } from '@/core/types'
import { geometryClient } from '@/workers/geometryClient'
import type { ChipImage } from '@/workers/protocol'
import { isAbortError } from './abort'
import { ChipCache, chipCacheKey, nextShown, planBatches, ShadeLedger, SharedRender } from './chipCache'

export { chipCacheKey }

export interface ChipItem {
  key: string
  config: DesignConfig
  crop?: CropRect
  /** A piece's edges: a border piece shows its perimeter profile. */
  edges?: PieceEdges
}

const CHIP_CACHE_SIZE = 120
/** Small batches so a relief drawn for the first time fills in progressively instead of all at once. */
const BATCH_SIZE = 6

// Shared by every chip strip on the page: the picker and the schedule reuse each other's renders.
const cache = new ChipCache(CHIP_CACHE_SIZE, (url) => URL.revokeObjectURL(url))
const inflight = new Map<string, SharedRender>()
// A quarter of the worker's budget is left as headroom: it also keeps shades from batches the page
// cancelled, and overlapping requests reorder its recency, so the page must forget first.
const shades = new ShadeLedger(CHIP_SHADE_BUDGET_BYTES * 0.75)

/** ImageData needs pixels on a plain ArrayBuffer; worker results always are, but stay safe. */
function toImageData(chip: ChipImage): ImageData {
  const { data } = chip
  const pixels =
    data.buffer instanceof ArrayBuffer ? new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) : new Uint8ClampedArray(data)
  return new ImageData(pixels, chip.width, chip.height)
}

/**
 * The pixels only pass through on their way to a PNG, so the canvas stays on the CPU: a GPU canvas
 * uploads them and then blocks the main thread reading them back (about 75 ms for a strip of 23).
 */
const CANVAS_OPTIONS: CanvasRenderingContext2DSettings = { willReadFrequently: true }

async function chipToUrl(chip: ChipImage): Promise<string> {
  const image = toImageData(chip)
  let blob: Blob
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(chip.width, chip.height)
    const context = canvas.getContext('2d', CANVAS_OPTIONS)
    if (!context) throw new Error('2D canvas unavailable')
    context.putImageData(image, 0, 0)
    blob = await canvas.convertToBlob({ type: 'image/png' })
  } else {
    const canvas = document.createElement('canvas')
    canvas.width = chip.width
    canvas.height = chip.height
    const context = canvas.getContext('2d', CANVAS_OPTIONS)
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
  /** The chip minus its colour: what the worker's shade cache is keyed by. */
  shadeKey: string
  config: DesignConfig
  crop?: CropRect
  edges?: PieceEdges
}

/** Renders one batch in the worker and stores PNG URLs; concurrent strips share (and hold) it. */
function renderBatch(batch: PendingChip[], sizePx: number): SharedRender {
  const controller = new AbortController()
  const promise = geometryClient
    .request(
      {
        kind: 'chips',
        sizePx,
        items: batch.map((c) => ({ key: c.cacheKey, config: c.config, crop: c.crop, edges: c.edges })),
      },
      { signal: controller.signal },
    )
    .then(async (result) => {
      for (const chip of batch) shades.add(chip.shadeKey, reliefShadeBytes(sizePx))
      const urls = await Promise.all(result.chips.map(async (chip) => [chip.key, await chipToUrl(chip)] as const))
      for (const [key, url] of urls) cache.set(key, url)
    })
  const forget = () => {
    for (const chip of batch) if (inflight.get(chip.cacheKey) === render) inflight.delete(chip.cacheKey)
  }
  const render = new SharedRender(promise, () => {
    // Out of the table first, so no strip starts waiting on a render that is about to reject.
    forget()
    controller.abort()
  })
  for (const chip of batch) inflight.set(chip.cacheKey, render)
  promise.then(forget, forget)
  return render
}

/**
 * Lit relief swatches as PNG object URLs, keyed by item key. The first time a relief is drawn the
 * strip fills in progressively; once the worker holds every shade, a new colour arrives in one
 * commit. While a chip re-renders the previous image for that item stays visible.
 * `base` is the current design: chips of its texture render first.
 */
export function useTextureChips(base: DesignConfig, items: ChipItem[], sizePx: number): Map<string, string> {
  const [, setLanded] = useState(0)
  /** Item key -> cache key of the last image shown for it. */
  const [lastShown, setLastShown] = useState<Readonly<Record<string, string>>>({})

  const entries = items.map((item) => ({ key: item.key, cacheKey: chipCacheKey(item, sizePx) }))
  const itemsKey = JSON.stringify(entries)

  const fill = useEffectEvent(async (signal: AbortSignal) => {
    const recordShown = () => setLastShown((prev) => nextShown(prev, entries, (key) => cache.has(key)))
    // A change that is fully cached never lands a batch, and must still become the fallback.
    recordShown()

    const current = base.texture.id
    const ordered = [...items].sort(
      (a, b) => Number(b.config.texture.id === current) - Number(a.config.texture.id === current),
    )
    const todo = new Map<string, PendingChip>()
    const waiting = new Set<SharedRender>()
    for (const item of ordered) {
      const key = chipCacheKey(item, sizePx)
      if (cache.has(key) || todo.has(key)) continue
      const running = inflight.get(key)
      if (running && !running.cancelled) waiting.add(running)
      else {
        const shadeKey = reliefShadeKey(item.config, { sizePx, crop: item.crop, edges: item.edges })
        todo.set(key, { cacheKey: key, shadeKey, config: item.config, crop: item.crop, edges: item.edges })
      }
    }

    const landed = () => {
      if (signal.aborted) return
      setLanded((n) => n + 1)
      recordShown()
    }

    for (const render of waiting) {
      render.hold(signal)
      render.promise.then(landed, () => {})
    }
    const batches = planBatches([...todo.values()], (chip) => shades.has(chip.shadeKey), BATCH_SIZE)
    for (const batch of batches) {
      // Changed items stop the queue and cancel the batch in the worker, unless another strip holds it.
      if (signal.aborted) return
      const render = renderBatch(batch, sizePx)
      render.hold(signal)
      try {
        await render.promise
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
