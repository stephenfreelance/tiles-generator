import { useEffect, useEffectEvent, useMemo, useState } from 'react'
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
 * Solid volume of every piece (mm³) from draft meshes. While a new request runs the previous
 * volumes stay available (pending is true); estimateFilament falls back per piece for new ids.
 */
export function useVolumes(config: DesignConfig, plan: LayoutPlan): { volumes: Record<string, number> | null; pending: boolean } {
  const hasPieces = plan.pieces.length > 0
  const requestKey = `${geometryKey(config)}|${piecesKey(plan.pieces)}`
  const [state, setState] = useState<VolumeState>({ key: null, volumes: null })

  const measure = useEffectEvent(async (key: string, signal: AbortSignal) => {
    try {
      const result = await geometryClient.request({ kind: 'volumes', config, pieces: plan.pieces }, { signal })
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
