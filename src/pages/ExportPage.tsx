// The handover: what you designed, one button that gives you all of it, and the detail behind it.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Box, Download, FileText, LayoutGrid, Square, X } from 'lucide-react'
import { CopyLinkButton } from '@/app/CopyLinkButton'
import { studioIntent } from '@/app/prefetchStudio'
import { useDesignFromLink } from '@/app/useDesignFromLink'
import { filamentById } from '@/core/filaments'
import { planSvg } from '@/core/plan/planSvg'
import { textureById } from '@/core/textures/registry'
import type { PieceSpec } from '@/core/types'
import { Disclosure } from '@/features/export/Disclosure'
import { FileOptions } from '@/features/export/FileOptions'
import { PrintNotes } from '@/features/export/PrintNotes'
import { ScheduleTable } from '@/features/export/ScheduleTable'
import { estimateDownloadBytes, formatBytes, formatGrams } from '@/features/export/sizes'
import { testSwatch } from '@/features/export/testSwatch'
import { PENDING_DELAY_MS, useDelayedFlag } from '@/features/studio/useDelayedFlag'
import { downloadBlob, geometryKey, useExport, useFilamentEstimate, useLayout } from '@/hooks'
import { useDesign } from '@/state/designStore'
import { useHistory } from '@/state/historyStore'
import { usePrefs } from '@/state/prefsStore'
import { TileViewport, type TileViewportHandle } from '@/three/TileViewport'
import { announce, Button, buttonClassName, EmptyState, ProgressBar, toast } from '@/ui'
import styles from './ExportPage.module.scss'

/** Thumbnail width kept with the saved design; small enough that 40 of them fit in localStorage. */
const THUMBNAIL_PX = 360
/** How far the preview frame may depart from the wall's own proportions before it is clamped. */
const VIEW_ASPECT_RANGE = { min: 0.8, max: 1.9 }
/** Let the re-lay wave settle before the thumbnail is grabbed. */
const CAPTURE_DELAY_MS = 600

type JobKind = 'all' | 'piece' | 'swatch'

interface Job {
  kind: JobKind
  pieceId?: string
}

const wasCancelled = (error: unknown) => error instanceof Error && error.name === 'AbortError'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

const emptyBoxDrawing = (
  <svg viewBox="0 0 132 96" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <rect x="22" y="30" width="88" height="52" rx="10" strokeOpacity="0.8" />
    <path d="M22 46h88" strokeOpacity="0.45" />
    <path d="M58 30l8-14h20l-8 14" strokeOpacity="0.5" strokeLinejoin="round" />
    <path d="M60 62h12M60 70h24" strokeOpacity="0.4" strokeLinecap="round" />
  </svg>
)

export function ExportPage() {
  const config = useDesign((state) => state.config)
  const plan = useLayout(config)
  const format = usePrefs((state) => state.exportFormat)
  const quality = usePrefs((state) => state.exportQuality)
  const setPrefs = usePrefs((state) => state.set)
  const saveToRegister = useHistory((state) => state.save)
  const { estimate } = useFilamentEstimate(config, plan)
  const { run, progress, busy, cancel, error } = useExport()

  const [job, setJob] = useState<Job | null>(null)
  const [highlightPieceId, setHighlightPieceId] = useState<string | null>(null)
  const [viewPending, setViewPending] = useState(true)

  // A design can arrive in the address bar: it wins over whatever this browser last held.
  useDesignFromLink()
  // The capture below still waits on the real pending flag; only the marker on the frame is held back.
  const showPending = useDelayedFlag(viewPending, PENDING_DELAY_MS)
  const viewport = useRef<TileViewportHandle>(null)
  const capturedFor = useRef<string | null>(null)
  const retryRef = useRef<(() => void) | null>(null)

  const texture = textureById(config.texture.id)
  const filament = filamentById(config.colorId)
  const models = plan.pieces.length
  const tiles = plan.placements.length
  const signature = geometryKey(config)
  const fileCount = models + 2
  const bytes = estimateDownloadBytes(plan, config, format, quality)
  const midGrams = (estimate.totalGramsLow + estimate.totalGramsHigh) / 2
  // The preview frame is cut to the shape of the wall, so the render fills it.
  const viewAspect = Math.min(
    VIEW_ASPECT_RANGE.max,
    Math.max(VIEW_ASPECT_RANGE.min, config.surface.width / config.surface.height),
  )

  // Arriving here means the design is finished: it is saved, thumbnail and all.
  useEffect(() => {
    saveToRegister(config, { validated: true })
    capturedFor.current = null
  }, [config, saveToRegister])

  useEffect(() => {
    if (viewPending || capturedFor.current === signature) return
    let dropped = false
    const timer = window.setTimeout(async () => {
      const thumbnail = await viewport.current?.capture(THUMBNAIL_PX)
      if (dropped || !thumbnail) return
      capturedFor.current = signature
      saveToRegister(config, { validated: true, thumbnail })
    }, CAPTURE_DELAY_MS)
    return () => {
      dropped = true
      window.clearTimeout(timer)
    }
  }, [viewPending, config, signature, saveToRegister])

  useEffect(() => {
    announce(`Your files are ready: ${plural(fileCount, 'file', 'files')} for ${plural(tiles, 'tile', 'tiles')}.`)
  }, [fileCount, tiles])

  function reportFailure(failure: unknown, retry: () => void) {
    if (wasCancelled(failure)) {
      toast('Download cancelled. Nothing was written.', { tone: 'info' })
      return
    }
    retryRef.current = retry
    const message = failure instanceof Error ? failure.message : String(failure)
    toast(`The files could not be written. ${message}`, {
      tone: 'error',
      action: { label: 'Try again', onClick: retry },
    })
  }

  async function downloadEverything() {
    setJob({ kind: 'all' })
    announce(`Writing ${plural(fileCount, 'file', 'files')}.`)
    try {
      const result = await run({ config, plan, format, quality, zip: true, planSvg: planSvg(config, plan) })
      if (result.zip) {
        downloadBlob(result.zip.data, result.zip.name, result.zip.mime)
        retryRef.current = null
        toast(`${result.zip.name} is in your downloads.`, { tone: 'success' })
        announce(`Download ready: ${result.zip.name}.`)
      }
    } catch (failure) {
      reportFailure(failure, () => void downloadEverything())
    } finally {
      setJob(null)
    }
  }

  async function downloadPiece(piece: PieceSpec) {
    setJob({ kind: 'piece', pieceId: piece.id })
    try {
      const result = await run({ config, plan, format, quality, pieceIds: [piece.id], zip: false })
      const file = result.files[0]
      if (file) {
        downloadBlob(file.data, file.name, file.mime)
        toast(`${file.name} is in your downloads.`, { tone: 'success' })
      }
    } catch (failure) {
      reportFailure(failure, () => void downloadPiece(piece))
    } finally {
      setJob(null)
    }
  }

  function downloadPlan() {
    const svg = planSvg(config, plan)
    downloadBlob(new TextEncoder().encode(svg), 'tiling-plan.svg', 'image/svg+xml')
    toast('The tiling plan is in your downloads.', { tone: 'success' })
  }

  async function downloadTestTile() {
    const swatch = testSwatch(config)
    const piece = swatch.plan.pieces[0]
    if (!piece) return
    setJob({ kind: 'swatch' })
    try {
      const result = await run({
        config: swatch.config,
        plan: swatch.plan,
        format,
        quality,
        pieceIds: [piece.id],
        zip: false,
      })
      const file = result.files[0]
      if (file) {
        downloadBlob(file.data, `test-tile-60x60.${format}`, file.mime)
        toast('Test tile saved. Print this one before the wall.', { tone: 'success' })
      }
    } catch (failure) {
      reportFailure(failure, () => void downloadTestTile())
    } finally {
      setJob(null)
    }
  }

  if (models === 0) {
    return (
      <div className={`${styles.page} ${styles.pageEmpty}`}>
        <EmptyState
          illustration={emptyBoxDrawing}
          heading="Nothing to download yet"
          action={
            <Link to="/studio" className={buttonClassName('primary', 'lg')} {...studioIntent}>
              Start designing
            </Link>
          }
        >
          Give the studio a wall and a tile size. As soon as the tiles lay out, your files are ready here.
        </EmptyState>
      </div>
    )
  }

  const fraction = progress && progress.total > 0 ? progress.done / progress.total : null
  const modelLine =
    models === 1
      ? `1 tile model (${format.toUpperCase()}), print ${plural(tiles, 'copy', 'copies')}`
      : `${plural(models, 'tile model', 'tile models')} (${format.toUpperCase()}), ${plural(tiles, 'tile', 'tiles')} in all`

  return (
    <div
      className={styles.page}
      style={
        {
          '--view-aspect': viewAspect,
          // The wash is re-derived from this in ExportPage.module.scss: a custom property holding a
          // var() resolves against the element it is declared on, so it has to sit beside --filament.
          '--filament': filament.hex,
        } as CSSProperties
      }
    >
      <header className={styles.head}>
        <div className={styles.headText}>
          <h1 className={styles.title}>Your files are ready</h1>
          <p className={styles.subject}>{config.name}</p>
        </div>
        <div className={styles.headSide}>
          <CopyLinkButton config={config} />
          <Link to="/studio" className={buttonClassName('ghost', 'sm')} {...studioIntent}>
            <ArrowLeft aria-hidden="true" width={16} height={16} />
            Back to the studio
          </Link>
        </div>
      </header>

      <div className={styles.top}>
        <section className={styles.design} aria-label="Your design">
          <div className={styles.preview}>
            <div className={styles.previewCanvas} data-pending={showPending || undefined}>
              <TileViewport
                ref={viewport}
                config={config}
                plan={plan}
                mode="surface"
                interactive={false}
                highlightPieceId={highlightPieceId}
                onPendingChange={setViewPending}
              />
            </div>
            <p className={styles.identity}>
              <span className={styles.swatch} aria-hidden="true" />
              <span className={styles.identityText}>
                <span className={styles.identityName}>
                  {texture.name} in {filament.name}
                </span>
                <span className={styles.identityLine}>{filament.line}</span>
              </span>
            </p>
          </div>
        </section>

        <section className={styles.get} aria-label="Download">
          {busy ? (
            <div className={styles.progress}>
              <ProgressBar
                label={progress?.label ?? 'Preparing the files'}
                value={fraction}
                detail={
                  job?.kind === 'swatch'
                    ? 'One 60 × 60 mm test tile'
                    : job?.kind === 'piece'
                      ? 'One piece on its own'
                      : `${plural(fileCount, 'file', 'files')} into one zip`
                }
              />
              <Button variant="ghost" leadingIcon={<X />} onClick={cancel}>
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                className={styles.getFiles}
                leadingIcon={<Download />}
                onClick={downloadEverything}
              >
                Download everything (.zip)
              </Button>
              <p className={styles.getNote}>
                {plural(fileCount, 'file', 'files')}, about {formatBytes(bytes)}
              </p>
              {error && retryRef.current && (
                <p className={styles.error} role="status">
                  {error}
                </p>
              )}
            </>
          )}

          <ul className={styles.contents}>
            <li>
              <Box className={styles.contentIcon} aria-hidden="true" />
              <span>{modelLine}</span>
            </li>
            <li>
              <LayoutGrid className={styles.contentIcon} aria-hidden="true" />
              <span>A tiling plan (SVG), shows where every piece goes</span>
            </li>
            <li>
              <FileText className={styles.contentIcon} aria-hidden="true" />
              <span>A README, your settings and printing advice</span>
            </li>
          </ul>
        </section>

        <section className={styles.facts} aria-label="What you are printing">
          <p className={styles.fact}>
            <span className={styles.factValue}>{plural(tiles, 'tile', 'tiles')}</span>
            <span className={plan.exact ? `${styles.factNote} ${styles.factOk}` : styles.factNote}>
              {plan.exact ? 'all whole' : `${plan.fullCount} whole, ${plan.partialCount} cut`}
            </span>
          </p>
          <p className={styles.fact}>
            <span className={styles.factValue}>{plural(models, 'model', 'models')}</span>
            <span className={styles.factNote}>to print</span>
          </p>
          <p className={styles.fact}>
            <span className={styles.factValue}>about {formatGrams(midGrams)}</span>
            {/* The spool count covers the top of the estimate, so it reads as an instruction rather
                than as arithmetic that does not add up against the figure above it. */}
            <span className={styles.factNote}>buy {plural(estimate.spools, 'spool', 'spools')} of 1 kg</span>
          </p>
        </section>

        <section className={styles.more} aria-label="Other ways to download">
          {plan.warnings.length > 0 && (
            <ul className={styles.warnings}>
              {plan.warnings.map((warning) => (
                <li key={`${warning.code}${warning.pieceId ?? ''}${warning.message}`}>{warning.message}</li>
              ))}
            </ul>
          )}

          <FileOptions
            config={config}
            plan={plan}
            format={format}
            quality={quality}
            disabled={busy}
            onFormatChange={(next) => setPrefs({ exportFormat: next })}
            onQualityChange={(next) => setPrefs({ exportQuality: next })}
          />

          <div className={styles.secondary}>
            <div className={styles.secondaryRow}>
              <Button variant="secondary" leadingIcon={<Square />} disabled={busy} onClick={downloadTestTile}>
                Print a test tile first
              </Button>
              <Button variant="ghost" leadingIcon={<FileText />} onClick={downloadPlan}>
                Plan only (.svg)
              </Button>
            </div>
            <p className={styles.secondaryNote}>
              The test tile is one 60 × 60 mm piece of the same relief: worth an hour before you print{' '}
              {plural(tiles, 'tile', 'tiles')}.
            </p>
          </div>
        </section>
      </div>

      <Disclosure label="See every piece" note={`${plural(models, 'model', 'models')} · ${plural(tiles, 'tile', 'tiles')}`}>
        <p className={styles.piecesNote}>
          Every cut carries the slice of pattern it replaces, so the relief runs on across each joint. Point at a row
          to find that piece in the picture.
        </p>
        <ScheduleTable
          config={config}
          plan={plan}
          format={format}
          busyPieceId={job?.kind === 'piece' ? (job.pieceId ?? null) : null}
          disabled={busy}
          highlightPieceId={highlightPieceId}
          onHighlight={setHighlightPieceId}
          onDownloadPiece={downloadPiece}
        />
      </Disclosure>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Before you print</h2>
        <PrintNotes />
      </section>
    </div>
  )
}
