// Geometry worker: runs handleRequest off the main thread, posts progress and results with transferables.
import { CancelledError, handleRequest } from './handleRequest'
import type { FromWorker, ToWorker, WorkerRequest } from './protocol'

declare const self: DedicatedWorkerGlobalScope

/** Requests currently running; a cancel for anything else is stale and ignored. */
const active = new Set<number>()
const cancelled = new Set<number>()

function post(message: FromWorker, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer)
}

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error))

async function run(id: number, request: WorkerRequest): Promise<void> {
  active.add(id)
  const isCancelled = () => cancelled.has(id)
  try {
    const { result, transfer } = await handleRequest(request, {
      isCancelled,
      progress: (progress) => {
        if (!isCancelled()) post({ id, progress })
      },
    })
    if (isCancelled()) post({ id, ok: false, error: 'Cancelled', cancelled: true })
    else post({ id, ok: true, result }, transfer)
  } catch (error) {
    const wasCancelled = error instanceof CancelledError || isCancelled()
    if (!wasCancelled) console.error('[geometry worker]', error)
    post({ id, ok: false, error: wasCancelled ? 'Cancelled' : describeError(error), cancelled: wasCancelled })
  } finally {
    active.delete(id)
    cancelled.delete(id)
  }
}

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data
  if ('cancel' in message) {
    if (active.has(message.id)) cancelled.add(message.id)
    return
  }
  void run(message.id, message.request)
}
