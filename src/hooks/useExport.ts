import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { geometryClient } from '@/workers/geometryClient'
import type { ExportRequest, ExportResult, Progress } from '@/workers/protocol'
import { errorMessage, isAbortError } from './abort'

export interface ExportControls {
  /** Starts an export (cancelling a running one). Rejects with an AbortError when cancelled. */
  run(req: Omit<ExportRequest, 'kind'>): Promise<ExportResult>
  progress: Progress | null
  busy: boolean
  cancel(): void
  error: string | null
}

export function useExport(): ExportControls {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  const run = useCallback(async (req: Omit<ExportRequest, 'kind'>): Promise<ExportResult> => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const isCurrent = () => controllerRef.current === controller
    setBusy(true)
    setError(null)
    setProgress({ done: 0, total: 1, label: 'Preparing the files' })
    try {
      return await geometryClient.request(
        { kind: 'export', ...req },
        { signal: controller.signal, onProgress: (p) => isCurrent() && setProgress(p) },
      )
    } catch (failure) {
      if (!isAbortError(failure) && isCurrent()) setError(errorMessage(failure))
      throw failure
    } finally {
      if (isCurrent()) {
        controllerRef.current = null
        setBusy(false)
        setProgress(null)
      }
    }
  }, [])

  const cancel = useCallback(() => controllerRef.current?.abort(), [])

  // Leaving the page cancels the export instead of finishing work nobody will download.
  useEffect(() => {
    const controllers = controllerRef
    return () => controllers.current?.abort()
  }, [])

  return useMemo(() => ({ run, progress, busy, cancel, error }), [run, progress, busy, cancel, error])
}
