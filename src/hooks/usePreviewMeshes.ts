import { useEffect, useEffectEvent, useId, useMemo, useState } from 'react'
import { tabLimits } from '@/core/fixing/capability'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { geometryClient } from '@/workers/geometryClient'
import type { PreviewPiece } from '@/workers/protocol'
import { errorMessage, isAbortError } from './abort'
import { geometryKey, piecesKey } from './geometryKey'
import { previewPasses, type PreviewDetail, type PreviewPass } from './previewLod'

/** Slider drags fire every frame; wait for a pause before asking the worker. */
const DEBOUNCE_MS = 80

export interface PreviewMeshes {
  pieces: Map<string, PreviewPiece>
  /** True from the moment the geometry changes until the meshes of that change are in hand. */
  pending: boolean
  /** True when these meshes were built for the design being asked about rather than an earlier one. */
  current: boolean
  /** Increments every time new meshes arrive (coarse and final passes). */
  version: number
  /** Last build failure, cleared by the next success. */
  error: string | null
}

export interface PreviewBuildState {
  pieces: Map<string, PreviewPiece>
  /** Request key the meshes in hand were built for, which is not the same as the key that finished. */
  piecesKey: string | null
  version: number
  /** Request key whose final pass has landed (or failed). */
  completeKey: string | null
  error: string | null
}

/** One build: the passes to run and the design they describe, tied to the key they complete. */
export interface PreviewBuildRequest {
  key: string
  passes: PreviewPass[]
  config: DesignConfig
  /** Cut the key notches and clip pockets into the backs; omitted, they are cut. */
  backFeatures?: boolean
}

/**
 * Whether a view's meshes carry the pockets in the tiles' backs. The whole wall's camera never gets
 * behind it, so meshing them there only costs triangles (over a million on a big keyed wall on clips);
 * the single tile has a Back view that shows them.
 */
export const previewBackFeatures = (detail: PreviewDetail): boolean => detail === 'tile'

/**
 * How far a piece's mesh stands out past its tile in this view, mm: a tab is a back feature, so it is on
 * the mesh only where the backs are meshed at all. The viewport's footprint guard (meshMatchesPiece) reads
 * this; asking for the tab where the wall was built without it refuses every mesh and empties the view.
 */
export const previewTabGrow = (config: DesignConfig, detail: PreviewDetail): number =>
  previewBackFeatures(detail) ? (tabLimits(config)?.projection ?? 0) : 0

/** The request key of a build: everything the meshes depend on, the backs included. */
export function previewRequestKey(detail: PreviewDetail, geometry: string, passes: readonly PreviewPass[]): string {
  const passesKey = passes.map((p) => `${piecesKey(p.pieces)}@${p.cellMm}/${p.normalMapTexelMm}`).join(';')
  return `${detail}|${previewBackFeatures(detail) ? 'backs' : 'fronts'}|${geometry}|${passesKey}`
}

/**
 * What the viewport may say about the meshes in hand. Finishing a key is not enough on its own:
 * returning to a size that finished earlier, while the meshes in hand belong to the size just
 * abandoned, would read as done and raise the failure notice over a rebuild that is merely still
 * running. A build is settled once the meshes in hand are this key's, or this key failed and none
 * are coming.
 */
export function previewStatus(
  state: PreviewBuildState,
  key: string,
  hasPasses: boolean,
): { pending: boolean; current: boolean } {
  const current = state.piecesKey === key
  const settled = state.completeKey === key && (current || state.error !== null)
  return { pending: hasPasses && !settled, current }
}

/**
 * Runs a request's passes, coarse then fine, reporting each result. Everything it needs is an
 * argument: what it sends the worker is always the design its key describes, so a build that starts
 * after a debounce can never ask for the previous tile size and then report the new key as built.
 */
export async function runPreviewBuild(
  request: PreviewBuildRequest,
  supersedeKey: string,
  signal: AbortSignal,
  report: (update: (previous: PreviewBuildState) => PreviewBuildState) => void,
): Promise<void> {
  for (const [index, pass] of request.passes.entries()) {
    const isFinal = index === request.passes.length - 1
    try {
      const result = await geometryClient.request(
        {
          kind: 'preview',
          config: request.config,
          pieces: pass.pieces,
          cellMm: pass.cellMm,
          normalMapTexelMm: pass.normalMapTexelMm,
          backFeatures: request.backFeatures ?? true,
        },
        { signal, supersede: supersedeKey },
      )
      if (signal.aborted) return
      report((previous) => ({
        pieces: new Map(result.pieces.map((piece) => [piece.pieceId, piece])),
        piecesKey: request.key,
        version: previous.version + 1,
        completeKey: isFinal ? request.key : previous.completeKey,
        error: null,
      }))
    } catch (error) {
      if (signal.aborted || isAbortError(error)) return
      console.error('[preview] mesh build failed', error)
      // The key is marked done so the view stops waiting; the meshes stay as they were, still under the
      // key of the design that built them, which is what makes the viewport say it could not build this one.
      report((previous) => ({ ...previous, completeKey: request.key, error: errorMessage(error) }))
      return
    }
  }
}

/**
 * Preview meshes for the viewport: debounced, coarse then fine, latest request wins. The previous
 * meshes stay on screen until new ones arrive, so the canvas never flashes empty.
 */
export function usePreviewMeshes(config: DesignConfig, plan: LayoutPlan, detail: PreviewDetail): PreviewMeshes {
  const supersedeKey = useId()

  const request = useMemo<PreviewBuildRequest>(() => {
    const passes = previewPasses(config, plan, detail)
    return { key: previewRequestKey(detail, geometryKey(config), passes), passes, config, backFeatures: previewBackFeatures(detail) }
  }, [config, plan, detail])

  const [state, setState] = useState<PreviewBuildState>(() => ({
    pieces: new Map(),
    piecesKey: null,
    version: 0,
    completeKey: null,
    error: null,
  }))

  // One request object per geometry key, so the build effect depends on the exact request it sends:
  // the passes, the config and the key they complete always come from the same render. A colour-only
  // edit keeps the key, so it keeps this object too and never rebuilds the wall.
  const [scheduled, setScheduled] = useState(request)
  if (scheduled.key !== request.key) setScheduled(request)

  // The first build starts at once; later ones wait for the input to settle. Only the delay is read
  // this way: being a render behind can cost 80 ms, never the wrong geometry.
  const debounceDelay = useEffectEvent(() => (state.version === 0 ? 0 : DEBOUNCE_MS))

  useEffect(() => {
    if (scheduled.passes.length === 0) return
    const controller = new AbortController()
    const timer = setTimeout(() => void runPreviewBuild(scheduled, supersedeKey, controller.signal, setState), debounceDelay())
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [scheduled, supersedeKey])

  const { pending, current } = previewStatus(state, request.key, request.passes.length > 0)
  return useMemo(
    () => ({ pieces: state.pieces, pending, current, version: state.version, error: state.error }),
    [state, pending, current],
  )
}
