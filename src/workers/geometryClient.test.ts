import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import { createGeometryClient, type Lane, type WorkerLike } from './geometryClient'
import type { FromWorker, ToWorker, WorkerRequest } from './protocol'

class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null
  onerror: WorkerLike['onerror'] = null
  onmessageerror: WorkerLike['onmessageerror'] = null
  sent: ToWorker[] = []
  terminated = false
  constructor(readonly lane: Lane) {}
  postMessage(message: ToWorker) {
    this.sent.push(message)
  }
  terminate() {
    this.terminated = true
  }
  reply(message: FromWorker) {
    this.onmessage?.({ data: message } as MessageEvent<FromWorker>)
  }
  crash(message: string) {
    this.onerror?.({ message, preventDefault() {} } as ErrorEvent)
  }
  lastRequestId() {
    const last = [...this.sent].reverse().find((m) => 'request' in m)
    if (!last) throw new Error('no request sent')
    return last.id
  }
}

function setup() {
  const spawned: FakeWorker[] = []
  const client = createGeometryClient((lane) => {
    const worker = new FakeWorker(lane)
    spawned.push(worker)
    return worker
  })
  const workerOf = (lane: Lane) => spawned.filter((w) => w.lane === lane).at(-1) as FakeWorker
  return { client, spawned, workerOf }
}

const preview = (): Extract<WorkerRequest, { kind: 'preview' }> => ({
  kind: 'preview',
  config: DEFAULT_CONFIG,
  pieces: [],
  cellMm: 1,
  normalMapTexelMm: 0,
})

const volumes = (): Extract<WorkerRequest, { kind: 'volumes' }> => ({ kind: 'volumes', config: DEFAULT_CONFIG, pieces: [] })

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

describe('geometryClient', () => {
  it('spawns one worker per lane, lazily', () => {
    const { client, spawned } = setup()
    expect(spawned).toHaveLength(0)
    void client.request(preview()).catch(() => {})
    void client.request(volumes())
    void client.request({ kind: 'chips', items: [], sizePx: 64 })
    expect(spawned.map((w) => w.lane)).toEqual(['preview', 'chips'])
  })

  it('resolves results and forwards progress', async () => {
    const { client, workerOf } = setup()
    const progress: string[] = []
    const pending = client.request(volumes(), { onProgress: (p) => progress.push(p.label) })
    const worker = workerOf('chips')
    const id = worker.lastRequestId()
    worker.reply({ id, progress: { done: 0, total: 1, label: 'Meshing' } })
    worker.reply({ id, ok: true, result: { volumes: { full: 42 } } })
    await expect(pending).resolves.toEqual({ volumes: { full: 42 } })
    expect(progress).toEqual(['Meshing'])
  })

  it('lets the latest preview win and cancels the previous one in the worker', async () => {
    const { client, workerOf } = setup()
    const first = client.request(preview())
    const firstId = workerOf('preview').lastRequestId()
    const second = client.request(preview())
    await expect(first).rejects.toSatisfy(isAbort)
    const worker = workerOf('preview')
    expect(worker.sent).toContainEqual({ id: firstId, cancel: true })
    // A late reply for the superseded request is ignored.
    worker.reply({ id: firstId, ok: true, result: { pieces: [] } })
    worker.reply({ id: worker.lastRequestId(), ok: true, result: { pieces: [] } })
    await expect(second).resolves.toEqual({ pieces: [] })
  })

  it('keeps previews with different keys independent', async () => {
    const { client, workerOf } = setup()
    const surface = client.request(preview(), { supersede: 'surface' })
    const tile = client.request(preview(), { supersede: 'tile' })
    const worker = workerOf('preview')
    const [a, b] = worker.sent.filter((m) => 'request' in m).map((m) => m.id)
    worker.reply({ id: a, ok: true, result: { pieces: [] } })
    worker.reply({ id: b, ok: true, result: { pieces: [] } })
    await expect(surface).resolves.toEqual({ pieces: [] })
    await expect(tile).resolves.toEqual({ pieces: [] })
  })

  it('cancels through an AbortSignal', async () => {
    const { client, workerOf, spawned } = setup()
    const controller = new AbortController()
    const pending = client.request(volumes(), { signal: controller.signal })
    const id = workerOf('chips').lastRequestId()
    controller.abort()
    await expect(pending).rejects.toSatisfy(isAbort)
    expect(workerOf('chips').sent).toContainEqual({ id, cancel: true })

    const aborted = new AbortController()
    aborted.abort()
    await expect(client.request({ kind: 'export', config: DEFAULT_CONFIG, plan: { pieces: [], placements: [], columns: 0, rows: 0, fullCount: 0, partialCount: 0, exact: true, warnings: [] }, format: 'stl', quality: 'draft', zip: false }, { signal: aborted.signal })).rejects.toSatisfy(isAbort)
    expect(spawned.some((w) => w.lane === 'export')).toBe(false)
  })

  it('rejects with the worker error message', async () => {
    const { client, workerOf } = setup()
    const pending = client.request(volumes())
    const worker = workerOf('chips')
    worker.reply({ id: worker.lastRequestId(), ok: false, error: 'Tile too thin' })
    await expect(pending).rejects.toThrow('Tile too thin')
  })

  it('rejects pending work when a worker crashes and respawns it on the next request', async () => {
    const { client, workerOf, spawned } = setup()
    const pending = client.request(volumes())
    const crashed = workerOf('chips')
    crashed.crash('Uncaught RangeError: Invalid array length')
    await expect(pending).rejects.toThrow('The geometry engine stopped (RangeError: Invalid array length)')
    expect(crashed.terminated).toBe(true)

    const next = client.request(volumes())
    const fresh = workerOf('chips')
    expect(fresh).not.toBe(crashed)
    expect(spawned.filter((w) => w.lane === 'chips')).toHaveLength(2)
    fresh.reply({ id: fresh.lastRequestId(), ok: true, result: { volumes: {} } })
    await expect(next).resolves.toEqual({ volumes: {} })
  })

  it('gives up on a preview worker that stopped answering, and replaces it', async () => {
    vi.useFakeTimers()
    try {
      const { client, workerOf } = setup()
      const pending = client.request(preview())
      const dead = workerOf('preview')
      // A worker the browser kills fires no error event: the reply simply never comes.
      vi.advanceTimersByTime(30_000)
      await expect(pending).rejects.toThrow('stopped answering')
      expect(dead.terminated).toBe(true)

      const next = client.request(preview())
      const fresh = workerOf('preview')
      expect(fresh).not.toBe(dead)
      fresh.reply({ id: fresh.lastRequestId(), ok: true, result: { pieces: [] } })
      await expect(next).resolves.toEqual({ pieces: [] })
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves a slow but talking preview worker alone', async () => {
    vi.useFakeTimers()
    try {
      const { client, workerOf } = setup()
      const pending = client.request(preview())
      const worker = workerOf('preview')
      const id = worker.lastRequestId()
      // Far longer than the silence window in total, but never silent for it.
      for (let done = 0; done < 4; done++) {
        vi.advanceTimersByTime(20_000)
        worker.reply({ id, progress: { done, total: 4, label: 'Meshing' } })
      }
      vi.advanceTimersByTime(20_000)
      worker.reply({ id, ok: true, result: { pieces: [] } })
      await expect(pending).resolves.toEqual({ pieces: [] })
      expect(worker.terminated).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('explains a worker that fails to load', async () => {
    const { client, workerOf } = setup()
    const pending = client.request(preview())
    workerOf('preview').onerror?.({ preventDefault() {} } as ErrorEvent)
    await expect(pending).rejects.toThrow('could not start')
  })
})
