// The handover: what you designed, one button that gives you all of it, and the detail behind it.
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Box, Download, FileDown, FileText, LayoutGrid, Link2, Paperclip, X } from 'lucide-react'
import { track, trackDownloadFailure, trackZip } from '@/app/analytics'
import { CopyLinkButton } from '@/app/CopyLinkButton'
import { studioIntent } from '@/app/prefetchStudio'
import { useDesignFromLink } from '@/app/useDesignFromLink'
import { presetByHex } from '@/core/colors'
import { wallParts } from '@/core/fixing/accessories'
import { mountingGuide } from '@/core/fixing/guide'
import { joinPlan } from '@/core/fixing/joins'
import { mountPlan } from '@/core/fixing/mount'
import { tabPlan } from '@/core/fixing/tabs'
import type { AccessorySpec } from '@/core/fixing/types'
import { planSvg } from '@/core/plan/planSvg'
import { textureById } from '@/core/textures/registry'
import type { PieceSpec } from '@/core/types'
import { AccessoryTable } from '@/features/export/AccessoryTable'
import { Disclosure } from '@/features/export/Disclosure'
import { FileOptions } from '@/features/export/FileOptions'
import { MountingGuide } from '@/features/export/MountingGuide'
import { PrintNotes } from '@/features/export/PrintNotes'
import { ScheduleTable } from '@/features/export/ScheduleTable'
import { estimateDownloadBytes, formatBytes, formatGrams } from '@/features/export/sizes'
import { testSwatch } from '@/features/export/testSwatch'
import { partsTitle, zipContents, type ZipLineKind } from '@/features/export/zipContents'
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
/** A short debounce after the build lands; capture() itself waits for the re-lay wave to settle. */
const CAPTURE_DELAY_MS = 600

type JobKind = 'all' | 'piece' | 'part' | 'swatch'

interface Job {
  kind: JobKind
  /** The tile piece, or the printed part, being written on its own. */
  pieceId?: string
  partId?: string
}

/** What each line of the zip's contents is drawn with. */
const CONTENT_ICONS: Record<ZipLineKind, ReactNode> = {
  tiles: <Box className={styles.contentIcon} aria-hidden="true" />,
  mount: <Paperclip className={styles.contentIcon} aria-hidden="true" />,
  join: <Link2 className={styles.contentIcon} aria-hidden="true" />,
  plan: <LayoutGrid className={styles.contentIcon} aria-hidden="true" />,
  readme: <FileText className={styles.contentIcon} aria-hidden="true" />,
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
  const testTileNoteId = useId()
  const partsTitleId = useId()
  const piecesId = useId()
  const notesId = useId()

  const texture = textureById(config.texture.id)
  // A custom pick has no name of its own, so the pill says so in words and the hex carries the rest.
  const colorLabel = presetByHex(config.color)?.name ?? 'a custom color'
  const models = plan.pieces.length
  const tiles = plan.placements.length
  const signature = geometryKey(config)
  // The wall's own printed parts and the plans that place them, computed from the same plan the worker is
  // handed, so the rows, the guide and the zip always agree on what there is. The fit test is not among
  // them: it is printed from its own page, before these files are worth printing.
  const accessories = useMemo(() => wallParts(config, plan), [config, plan])
  const mount = useMemo(() => mountPlan(config, plan), [config, plan])
  const join = useMemo(() => joinPlan(config, plan), [config, plan])
  const tab = useMemo(() => tabPlan(config, plan), [config, plan])
  const guide = useMemo(
    () => mountingGuide({ config, plan, mount, join, tab, accessories }),
    [config, plan, mount, join, tab, accessories],
  )
  const contents = zipContents(config, plan, mount, join, tab, accessories, format)
  const fileCount = contents.files
  const bytes = estimateDownloadBytes(plan, config, format, quality, accessories)
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
    trackDownloadFailure(failure)
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
      // The parts are named, never left to the worker's default: this zip holds the wall's parts only.
      const result = await run({
        config,
        plan,
        format,
        quality,
        accessoryIds: accessories.map((part) => part.id),
        zip: true,
        planSvg: planSvg(config, plan),
      })
      if (result.zip) {
        downloadBlob(result.zip.data, result.zip.name, result.zip.mime)
        trackZip(config, { format, quality, fixing: guide.system, tiles })
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

  async function downloadPart(part: AccessorySpec) {
    setJob({ kind: 'part', partId: part.id })
    try {
      const result = await run({ config, plan, format, quality, pieceIds: [], accessoryIds: [part.id], zip: false })
      const file = result.files[0]
      if (file) {
        downloadBlob(file.data, file.name, file.mime)
        track('download-part')
        toast(`${file.name} is in your downloads.`, { tone: 'success' })
      }
    } catch (failure) {
      reportFailure(failure, () => void downloadPart(part))
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
        track('download-piece')
        toast(`${file.name} is in your downloads.`, { tone: 'success' })
      }
    } catch (failure) {
      reportFailure(failure, () => void downloadPiece(piece))
    } finally {
      setJob(null)
    }
  }

  /** Opens "See every piece" and takes the focus there, where each piece has a download of its own. */
  function showPieces() {
    const pieces = document.getElementById(piecesId)
    if (!(pieces instanceof HTMLDetailsElement)) return
    pieces.open = true
    pieces.scrollIntoView({ block: 'start' })
    pieces.querySelector('summary')?.focus({ preventScroll: true })
  }

  function downloadPlan() {
    const svg = planSvg(config, plan)
    downloadBlob(new TextEncoder().encode(svg), 'tiling-plan.svg', 'image/svg+xml')
    track('download-plan')
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
        track('download-test-tile')
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
  const fixings = guide.system !== 'glue'

  return (
    <div
      className={styles.page}
      style={
        {
          '--view-aspect': viewAspect,
          // The wash is re-derived from this in ExportPage.module.scss: a custom property holding a
          // var() resolves against the element it is declared on, so it has to sit beside --tile-color.
          '--tile-color': config.color,
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
        <div className={styles.left}>
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
                  {texture.name} in {colorLabel}
                </span>
                <span className={styles.identityLine}>{config.color}</span>
              </span>
            </p>
          </div>
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
            <span className={styles.factNote}>
              {/* Files, like the models beside them: the parts in hand are counted in their own table. */}
              {accessories.length > 0 ? `to print, plus ${plural(accessories.length, 'part file', 'part files')}` : 'to print'}
            </span>
          </p>
          <p className={styles.fact}>
            <span className={styles.factValue}>about {formatGrams(midGrams)}</span>
            {/* The spool count covers the top of the estimate, so it reads as an instruction rather
                than as arithmetic that does not add up against the figure above it. */}
            <span className={styles.factNote}>buy {plural(estimate.spools, 'spool', 'spools')} of 1 kg</span>
          </p>
        </section>

        {/* Under the counts rather than at the foot of the page: the advice belongs beside the render it
            is about, and the left column ran out of content halfway down the download card beside it. */}
        <section className={styles.notes} aria-labelledby={notesId}>
          <h2 id={notesId} className={styles.sectionTitle}>
            Before you print
          </h2>
          <PrintNotes fixings={fixings} parts={accessories.length > 0} />
        </section>
        </div>

        <div className={styles.right}>
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
                      : job?.kind === 'part'
                        ? 'One printed part on its own'
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
            {contents.lines.map((line) => (
              <li key={line.kind}>
                {CONTENT_ICONS[line.kind]}
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
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
            onShowPieces={showPieces}
          />

          <div className={styles.secondary}>
            {/* The reason sits above the button and is its description, so nobody has to click to learn why. */}
            <div className={styles.testTile}>
              <p className={styles.testTileLabel}>Test first</p>
              <p id={testTileNoteId} className={styles.secondaryNote}>
                One 60 × 60 mm tile of the same relief and color: worth an hour before you print{' '}
                {plural(tiles, 'tile', 'tiles')}.
              </p>
              <Button
                variant="secondary"
                leadingIcon={<Download />}
                disabled={busy}
                aria-describedby={testTileNoteId}
                onClick={downloadTestTile}
              >
                Download a test tile (.{format})
              </Button>
            </div>
            <Button variant="ghost" leadingIcon={<FileDown />} onClick={downloadPlan}>
              Download the plan only (.svg)
            </Button>
          </div>
        </section>
        </div>
      </div>

      <Disclosure id={piecesId} label="See every piece" note={`${plural(models, 'model', 'models')} · ${plural(tiles, 'tile', 'tiles')}`}>
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

      {accessories.length > 0 && (
        <section className={styles.parts} aria-labelledby={partsTitleId}>
          <div className={styles.partsHead}>
            <h2 id={partsTitleId} className={styles.sectionTitle}>
              {partsTitle(accessories)}
            </h2>
            <p className={styles.partsNote}>Printed parts that are not tiles, each group in its own folder of the zip.</p>
          </div>
          <AccessoryTable
            accessories={accessories}
            format={format}
            busyId={job?.kind === 'part' ? (job.partId ?? null) : null}
            disabled={busy}
            onDownload={downloadPart}
          />
        </section>
      )}

      <MountingGuide guide={guide} />
    </div>
  )
}
