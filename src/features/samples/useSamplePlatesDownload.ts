// Writes the sample plates: each sample through the worker's own export (one design each, so one request
// each), then the plates laid out from those STL files, then the zip, packed off the main thread.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DesignConfig } from '@/core/types'
import { errorMessage, isAbortError } from '@/hooks/abort'
import { geometryClient } from '@/workers/geometryClient'
import type { Progress } from '@/workers/protocol'
import { stlPlate } from './plateStl'
import { SAMPLE_QUALITY, sampleJob, type PlacedSample, type SamplePlates } from './samplePlates'
import { plateHeader, samplePlatesFiles, samplePlatesZipName } from './samplePlatesZip'
import { zipAsync } from './zipAsync'

export interface SamplePlatesDownload {
  name: string
  data: Uint8Array
}

export interface SamplePlatesControls {
  /** Rejects with an AbortError when cancelled, or when the page that asked is left. */
  run(config: DesignConfig, plates: SamplePlates, printer: string): Promise<SamplePlatesDownload>
  progress: Progress | null
  busy: boolean
  cancel(): void
  error: string | null
}

/** Lets the progress line paint before a synchronous step. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

export function useSamplePlatesDownload(): SamplePlatesControls {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  const run = useCallback(async (config: DesignConfig, plates: SamplePlates, printer: string) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const { signal } = controller
    const isCurrent = () => controllerRef.current === controller
    const count = plates.samples.length
    const total = count + plates.plates.length + 1
    let done = 0
    const step = (label: string) => {
      if (isCurrent()) setProgress({ done, total, label })
    }
    setError(null)
    step('Preparing the samples')
    try {
      const written = new Map<PlacedSample, Uint8Array[]>()
      for (const sample of plates.samples) {
        step(`Meshing sample ${sample.number} of ${count}: ${sample.title}`)
        const job = sampleJob(sample)
        const result = await geometryClient.request(
          { kind: 'export', ...job, format: 'stl', quality: SAMPLE_QUALITY, accessories: false, zip: false },
          { signal },
        )
        written.set(
          sample,
          job.pieceIds.map((id) => {
            const file = result.files.find((f) => f.pieceId === id)
            if (!file) throw new Error(`Sample ${sample.number} (${sample.title}) came back without its file.`)
            return file.data
          }),
        )
        done++
      }
      const plateFiles: Uint8Array[] = []
      for (const [plate, samples] of plates.plates.entries()) {
        step(`Laying out plate ${plate + 1} of ${plates.plates.length}`)
        await nextFrame()
        if (signal.aborted) throw new DOMException('The request was cancelled.', 'AbortError')
        const parts = samples.flatMap((sample) =>
          sample.pieces.map((piece, i) => ({ data: written.get(sample)?.[i] ?? new Uint8Array(0), x: sample.x + piece.x, y: sample.y + piece.y })),
        )
        plateFiles.push(stlPlate(plateHeader(config, plates, plate), parts))
        done++
      }
      step('Packing the zip')
      const data = await zipAsync(samplePlatesFiles(config, plates, plateFiles, printer), signal)
      return { name: samplePlatesZipName(config, plates), data }
    } catch (failure) {
      if (!isAbortError(failure) && isCurrent()) setError(errorMessage(failure))
      throw failure
    } finally {
      if (isCurrent()) {
        controllerRef.current = null
        setProgress(null)
      }
    }
  }, [])

  const cancel = useCallback(() => controllerRef.current?.abort(), [])

  // Closing the dialog or leaving the page stops the work instead of finishing a zip nobody will save.
  useEffect(() => {
    const controllers = controllerRef
    return () => controllers.current?.abort()
  }, [])

  return useMemo(() => ({ run, progress, busy: progress !== null, cancel, error }), [run, progress, cancel, error])
}
