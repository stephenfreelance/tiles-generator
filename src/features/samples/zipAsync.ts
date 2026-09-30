// A zip packed off the main thread: fflate's own asynchronous zip deflates in workers of its own, so the
// page keeps answering while a plate of a few tens of megabytes is compressed (most of a second on one core).
import { zip } from 'fflate'
import type { ZipEntry } from './samplePlatesZip'

const abortError = () => new DOMException('The request was cancelled.', 'AbortError')

export function zipAsync(entries: readonly ZipEntry[], signal?: AbortSignal): Promise<Uint8Array> {
  if (signal?.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const files = Object.fromEntries(entries.map((entry) => [entry.name, entry.data]))
    const job = zip(files, { level: 6 }, (error, data) => {
      signal?.removeEventListener('abort', stop)
      if (error) reject(error)
      else resolve(data)
    })
    function stop() {
      job()
      reject(abortError())
    }
    signal?.addEventListener('abort', stop, { once: true })
  })
}
