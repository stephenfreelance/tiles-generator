import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import type { AccessorySpec } from '@/core/fixing/types'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { geometryClient } from '@/workers/geometryClient'
import { isAbortError } from './abort'
import { geometryKey, piecesKey } from './geometryKey'

/** Volumes feed a number in the title block, not the picture: wait for edits to settle. */
const DEBOUNCE_MS = 250

interface VolumeState {
  key: string | null
  volumes: Record<string, number> | null
}

/**
 * The printed parts' identity for the request key. Their ids encode their geometry, and the shape numbers
 * cover what an id may leave out (a fit class changes a key's clearance, which geometryKey ignores).
 */
const partsKey = (parts: readonly AccessorySpec[]): string =>
  parts.map((p) => `${p.id}:${p.size.x}x${p.size.y}x${p.size.z}:${JSON.stringify(p.shape)}`).join(',')

/**
 * Solid volume of every piece (mm³) from draft meshes, and of every printed part in `parts` from its own
 * mesh, keyed by piece id and accessory id. While a new request runs the previous volumes stay available
 * (pending is true); estimateFilament falls back per piece and per part for new ids.
 */
export function useVolumes(
  config: DesignConfig,
  plan: LayoutPlan,
  parts: readonly AccessorySpec[] = [],
): { volumes: Record<string, number> | null; pending: boolean } {
  const hasPieces = plan.pieces.length > 0
  // A glued design without keys keeps the key it always had.
  const requestKey = `${geometryKey(config)}|${piecesKey(plan.pieces)}${parts.length > 0 ? `|${partsKey(parts)}` : ''}`
  const [state, setState] = useState<VolumeState>({ key: null, volumes: null })

  const measure = useEffectEvent(async (key: string, signal: AbortSignal) => {
    try {
      const accessories = parts.length > 0 ? [...parts] : undefined
      const result = await geometryClient.request({ kind: 'volumes', config, pieces: plan.pieces, accessories }, { signal })
      if (!signal.aborted) setState({ key, volumes: result.volumes })
    } catch (error) {
      if (signal.aborted || isAbortError(error)) return
      console.warn('[volumes] could not measure the pieces', error)
      // Stop reporting pending; the estimate keeps its slab approximation.
      setState((prev) => ({ key, volumes: prev.volumes }))
    }
  })

  useEffect(() => {
    if (!hasPieces) return
    const controller = new AbortController()
    const timer = setTimeout(() => void measure(requestKey, controller.signal), DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [requestKey, hasPieces])

  const pending = hasPieces && state.key !== requestKey
  return useMemo(() => ({ volumes: state.volumes, pending }), [state.volumes, pending])
}
