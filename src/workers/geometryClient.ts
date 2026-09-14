// Promise API over the geometry workers. One worker per lane, so a long export or a batch of
// chips never delays the live preview.
import type { FromWorker, Progress, ToWorker, WorkerRequest, WorkerResultMap } from './protocol'

export type Lane = 'preview' | 'chips' | 'export'

/** Volumes are small draft meshes: they share the background lane with the chips. */
export const LANE_OF: Record<WorkerRequest['kind'], Lane> = {
  preview: 'preview',
  chips: 'chips',
  volumes: 'chips',
  export: 'export',
}

/** The part of Worker the client uses; tests pass a fake. */
export interface WorkerLike {
  postMessage(message: ToWorker, transfer?: Transferable[]): void
  terminate(): void
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
}

export interface RequestOptions {
  signal?: AbortSignal
  onProgress?: (p: Progress) => void
  /**
   * Preview lane only: a new request with the same key cancels the previous one (latest wins).
   * Give each viewport its own key; `false` opts out. Defaults to one shared key.
   */
  supersede?: string | false
}

export interface GeometryClient {
  request<K extends WorkerRequest['kind']>(
    req: Extract<WorkerRequest, { kind: K }>,
    opts?: RequestOptions,
  ): Promise<WorkerResultMap[K]>
  /** Stops every worker and rejects what is pending (hot reload, tests). */
  terminateAll(): void
}

interface Job {
  id: number
  lane: Lane
  worker: WorkerLike
  supersedeKey: string | null
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  onProgress?: (p: Progress) => void
  detach: () => void
  /** Preview lane only: fires once the worker has been silent long enough to count as dead. */
  watchdog?: ReturnType<typeof setTimeout>
}

/**
 * A worker the browser kills (out of memory, a crashed renderer) fires no error event: posting into it
 * still succeeds and the reply never comes, so the preview would wait for ever with no way back. The
 * preview lane answers within a few seconds, progress messages included, so silence this long means the
 * engine is gone: it is replaced and the wait ends with a message instead of a spinner that never stops.
 * Only the preview lane is watched; chips, volumes and exports may legitimately be quiet for minutes.
 */
const PREVIEW_SILENCE_MS = 30_000

const abortError = (message = 'The request was cancelled.') => new DOMException(message, 'AbortError')

/** Turns a worker ErrorEvent into a sentence the UI can show. */
function crashMessage(event: ErrorEvent | undefined): string {
  const detail = event?.message?.replace(/^Uncaught\s+/, '').trim()
  // A module worker that fails to load fires a bare Event with no message.
  if (!detail) return 'The geometry engine could not start. Reload the page; if it keeps failing, try another browser.'
  return `The geometry engine stopped (${detail}). It restarts on your next change.`
}

export function createGeometryClient(spawn: (lane: Lane) => WorkerLike): GeometryClient {
  const workers = new Map<Lane, WorkerLike>()
  const jobs = new Map<number, Job>()
  const latestBySupersedeKey = new Map<string, number>()
  let nextId = 1

  function settle(job: Job): void {
    jobs.delete(job.id)
    clearWatchdog(job)
    job.detach()
    if (job.supersedeKey && latestBySupersedeKey.get(job.supersedeKey) === job.id) {
      latestBySupersedeKey.delete(job.supersedeKey)
    }
  }

  function cancel(id: number, message?: string): void {
    const job = jobs.get(id)
    if (!job) return
    settle(job)
    try {
      job.worker.postMessage({ id, cancel: true })
    } catch {
      // The worker is gone; nothing left to cancel.
    }
    job.reject(abortError(message))
  }

  function crash(lane: Lane, worker: WorkerLike, message: string): void {
    worker.terminate()
    if (workers.get(lane) === worker) workers.delete(lane)
    for (const job of [...jobs.values()]) {
      if (job.worker !== worker) continue
      settle(job)
      job.reject(new Error(message))
    }
  }

  function clearWatchdog(job: Job): void {
    if (job.watchdog === undefined) return
    clearTimeout(job.watchdog)
    job.watchdog = undefined
  }

  /** Restarted by every message the worker sends, so only real silence trips it. */
  function armWatchdog(job: Job): void {
    if (job.lane !== 'preview') return
    clearWatchdog(job)
    const timer = setTimeout(() => {
      crash(job.lane, job.worker, 'The geometry engine stopped answering, so it was restarted. Change anything to draw the view again.')
    }, PREVIEW_SILENCE_MS)
    // Node holds a process open for a pending timer (vitest); browsers have no unref at all.
    ;(timer as unknown as { unref?: () => void }).unref?.()
    job.watchdog = timer
  }

  function workerFor(lane: Lane): WorkerLike {
    const existing = workers.get(lane)
    if (existing) return existing
    const worker = spawn(lane)
    worker.onmessage = (event) => {
      const message = event.data
      const job = jobs.get(message.id)
      // Replies to cancelled or superseded requests arrive late; drop them.
      if (!job) return
      if ('progress' in message) {
        armWatchdog(job)
        job.onProgress?.(message.progress)
        return
      }
      settle(job)
      if (message.ok) job.resolve(message.result)
      else if (message.cancelled) job.reject(abortError())
      else job.reject(new Error(message.error))
    }
    worker.onerror = (event) => {
      event.preventDefault?.()
      crash(lane, worker, crashMessage(event))
    }
    worker.onmessageerror = () => crash(lane, worker, 'The geometry engine sent a result the page could not read. Try again.')
    workers.set(lane, worker)
    return worker
  }

  return {
    request<K extends WorkerRequest['kind']>(req: Extract<WorkerRequest, { kind: K }>, opts: RequestOptions = {}) {
      return new Promise<WorkerResultMap[K]>((resolve, reject) => {
        const { signal } = opts
        if (signal?.aborted) {
          reject(abortError())
          return
        }
        const lane = LANE_OF[req.kind]
        const id = nextId++
        const supersedeKey = lane === 'preview' && opts.supersede !== false ? `preview:${opts.supersede ?? ''}` : null
        if (supersedeKey) {
          const previous = latestBySupersedeKey.get(supersedeKey)
          if (previous !== undefined) cancel(previous, 'Superseded by a newer preview.')
          latestBySupersedeKey.set(supersedeKey, id)
        }

        let worker: WorkerLike
        try {
          worker = workerFor(lane)
        } catch (error) {
          if (supersedeKey) latestBySupersedeKey.delete(supersedeKey)
          reject(new Error(`The geometry engine could not start (${error instanceof Error ? error.message : String(error)}).`))
          return
        }
        const onAbort = () => cancel(id)
        signal?.addEventListener('abort', onAbort, { once: true })
        const job: Job = {
          id,
          lane,
          worker,
          supersedeKey,
          resolve: resolve as (value: unknown) => void,
          reject,
          onProgress: opts.onProgress,
          detach: () => signal?.removeEventListener('abort', onAbort),
        }
        jobs.set(id, job)
        armWatchdog(job)
        try {
          worker.postMessage({ id, request: req })
        } catch (error) {
          settle(job)
          reject(error)
        }
      })
    },

    terminateAll() {
      for (const [lane, worker] of [...workers]) crash(lane, worker, 'The geometry engine was restarted.')
    },
  }
}

export const geometryClient: GeometryClient = createGeometryClient(
  () => new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' }),
)

// Edits to the worker graph hot-reload this module; stop the old workers with it.
if (import.meta.hot) import.meta.hot.dispose(() => geometryClient.terminateAll())
