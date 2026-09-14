import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/core/config'
import type { DesignConfig, MeshData, PieceSpec } from '@/core/types'
import type { PreviewRequest } from '@/workers/protocol'
import { previewStatus, runPreviewBuild, type PreviewBuildRequest, type PreviewBuildState } from './usePreviewMeshes'

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }))
vi.mock('@/workers/geometryClient', () => ({ geometryClient: { request: requestMock, terminateAll: vi.fn() } }))

const mesh = (): MeshData => ({ positions: new Float32Array(9), indices: new Uint32Array(3), topIndexCount: 3 })

const piece = (width: number, height: number): PieceSpec => ({
  id: 'full',
  mark: 'A',
  kind: 'full',
  label: 'Full tile',
  crop: { x0: 0, y0: 0, x1: width, y1: height },
  width,
  height,
  count: 1,
})

const requestFor = (sizeMm: number, key: string): PreviewBuildRequest => ({
  key,
  passes: [{ pieces: [piece(sizeMm, sizeMm)], cellMm: 2, normalMapTexelMm: 0 }],
  config: { ...DEFAULT_CONFIG, tile: { ...DEFAULT_CONFIG.tile, width: sizeMm, height: sizeMm } } satisfies DesignConfig,
})

const emptyState = (): PreviewBuildState => ({ pieces: new Map(), piecesKey: null, version: 0, completeKey: null, error: null })

function collect() {
  let state = emptyState()
  return {
    report: (update: (previous: PreviewBuildState) => PreviewBuildState) => {
      state = update(state)
    },
    get state() {
      return state
    },
  }
}

const sentRequests = () => requestMock.mock.calls.map(([request]) => request as PreviewRequest)

describe('runPreviewBuild', () => {
  beforeEach(() => {
    requestMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('sends the design its key describes, so a completed key always means those meshes', async () => {
    requestMock.mockResolvedValue({ pieces: [{ pieceId: 'full', mesh: mesh() }] })
    const sink = collect()

    await runPreviewBuild(requestFor(120, 'tile-120'), 'viewport', new AbortController().signal, sink.report)

    const sent = sentRequests()
    expect(sent).toHaveLength(1)
    expect(sent[0].config.tile.width).toBe(120)
    expect(sent[0].pieces.map((p) => `${p.width}x${p.height}`)).toEqual(['120x120'])
    expect(sink.state.completeKey).toBe('tile-120')
    expect(sink.state.piecesKey).toBe('tile-120')
    expect(sink.state.pieces.get('full')).toBeDefined()
  })

  it('never pairs the key of one build with the geometry of another', async () => {
    requestMock.mockResolvedValue({ pieces: [{ pieceId: 'full', mesh: mesh() }] })
    const first = collect()
    const second = collect()

    await runPreviewBuild(requestFor(150, 'tile-150'), 'viewport', new AbortController().signal, first.report)
    await runPreviewBuild(requestFor(120, 'tile-120'), 'viewport', new AbortController().signal, second.report)

    const sent = sentRequests()
    expect(sent.map((r) => r.config.tile.width)).toEqual([150, 120])
    expect(sent.map((r) => r.pieces[0].width)).toEqual([150, 120])
    expect(first.state.completeKey).toBe('tile-150')
    expect(second.state.completeKey).toBe('tile-120')
  })

  it('runs the coarse pass before the fine one and completes on the last', async () => {
    requestMock.mockResolvedValue({ pieces: [{ pieceId: 'full', mesh: mesh() }] })
    const sink = collect()
    const request: PreviewBuildRequest = {
      ...requestFor(150, 'tile-150'),
      passes: [
        { pieces: [piece(150, 150)], cellMm: 4, normalMapTexelMm: 0 },
        { pieces: [piece(150, 150)], cellMm: 1, normalMapTexelMm: 0.3 },
      ],
    }

    await runPreviewBuild(request, 'viewport', new AbortController().signal, sink.report)

    expect(sentRequests().map((r) => r.cellMm)).toEqual([4, 1])
    expect(sink.state.version).toBe(2)
    expect(sink.state.completeKey).toBe('tile-150')
  })

  it('books the coarse pass to this build without completing it, so its meshes count as current', async () => {
    requestMock.mockResolvedValueOnce({ pieces: [{ pieceId: 'full', mesh: mesh() }] }).mockImplementationOnce(() => new Promise(() => {}))
    const sink = collect()
    const request: PreviewBuildRequest = {
      ...requestFor(150, 'tile-150'),
      passes: [
        { pieces: [piece(150, 150)], cellMm: 4, normalMapTexelMm: 0 },
        { pieces: [piece(150, 150)], cellMm: 1, normalMapTexelMm: 0.3 },
      ],
    }

    void runPreviewBuild(request, 'viewport', new AbortController().signal, sink.report)
    await Promise.resolve()
    await Promise.resolve()

    expect(sink.state.piecesKey).toBe('tile-150')
    expect(sink.state.completeKey).toBeNull()
    expect(previewStatus(sink.state, 'tile-150', true)).toEqual({ pending: true, current: true })
  })

  it('marks a failed key done and keeps the old meshes, so the viewport can say it could not build', async () => {
    requestMock.mockRejectedValue(new Error('The geometry engine stopped'))
    const sink = collect()
    sink.report(() => ({
      pieces: new Map([['full', { pieceId: 'full', mesh: mesh() }]]),
      piecesKey: 'tile-150',
      version: 3,
      completeKey: 'tile-150',
      error: null,
    }))

    await runPreviewBuild(requestFor(120, 'tile-120'), 'viewport', new AbortController().signal, sink.report)

    expect(sink.state.completeKey).toBe('tile-120')
    expect(sink.state.error).toBe('The geometry engine stopped')
    // The stale meshes stay put on purpose, under the key that built them: they are not this design,
    // which is what raises the notice even when the footprint is unchanged (a texture or depth edit).
    expect(sink.state.piecesKey).toBe('tile-150')
    expect(sink.state.pieces.get('full')).toBeDefined()
    expect(sink.state.version).toBe(3)
  })

  it('reports nothing once the build is aborted', async () => {
    const controller = new AbortController()
    requestMock.mockImplementation(() => {
      controller.abort()
      return Promise.resolve({ pieces: [{ pieceId: 'full', mesh: mesh() }] })
    })
    const sink = collect()

    await runPreviewBuild(requestFor(120, 'tile-120'), 'viewport', controller.signal, sink.report)

    expect(sink.state).toEqual(emptyState())
  })
})

describe('previewStatus', () => {
  const state = (over: Partial<PreviewBuildState> = {}): PreviewBuildState => ({ ...emptyState(), ...over })

  it('waits while nothing has been built yet', () => {
    expect(previewStatus(state(), 'tile-150', true)).toEqual({ pending: true, current: false })
  })

  it('is done once the meshes in hand are the ones this key built', () => {
    expect(previewStatus(state({ piecesKey: 'tile-150', completeKey: 'tile-150' }), 'tile-150', true)).toEqual({
      pending: false,
      current: true,
    })
  })

  it('keeps waiting when the meshes in hand belong to the size just abandoned', () => {
    // 118 finished; 132 was asked for and only its coarse pass landed; the design came back to 118.
    // The key is complete but the wall in hand is the 132 one, so this is a rebuild, not a failure.
    expect(previewStatus(state({ piecesKey: 'tile-132', completeKey: 'tile-118', version: 4 }), 'tile-118', true)).toEqual({
      pending: true,
      current: false,
    })
  })

  it('stops waiting when this key failed, so the viewport can say it could not build', () => {
    expect(
      previewStatus(state({ piecesKey: 'tile-150', completeKey: 'tile-120', error: 'boom' }), 'tile-120', true),
    ).toEqual({ pending: false, current: false })
  })

  it('ignores an older failure while the current key is still building', () => {
    expect(previewStatus(state({ piecesKey: 'tile-150', completeKey: 'tile-120', error: 'boom' }), 'tile-130', true)).toEqual({
      pending: true,
      current: false,
    })
  })

  it('is never pending when there is nothing to build', () => {
    expect(previewStatus(state(), 'tile-150', false)).toEqual({ pending: false, current: false })
  })
})
