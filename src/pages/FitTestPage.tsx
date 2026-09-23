// The fit test on its own: what it prints, how to read it, and the fit it leaves behind. It is here rather
// than on the download page so that the wall's zip holds only final parts, and the maker prints a few small
// coupons before committing to a wall's worth of keys and clips.
//
// No 3D view and no mesher on this route: the parts are shown as drawings and their meshes are written in
// the worker, so /studio and /download stay the only routes that download three.js.
import { useId, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, X } from 'lucide-react'
import { Link } from 'react-router'
import { studioIntent } from '@/app/prefetchStudio'
import { useDesignFromLink } from '@/app/useDesignFromLink'
import { fitTestFor, wallParts } from '@/core/fixing/accessories'
import { FIT_MARKS, fitChosenText, fitTestGuide, usesTabs } from '@/core/fixing/guide'
import type { AccessorySpec } from '@/core/fixing/types'
import type { FitClass } from '@/core/types'
import { AccessoryTable } from '@/features/export/AccessoryTable'
import { formatBytes } from '@/features/export/sizes'
import { estimateFitTestZipBytes, FIT_TEST_QUALITY } from '@/features/fit/fitSizes'
import { fitTestZip } from '@/features/fit/fitTestZip'
import { GuideSteps } from '@/features/fixing/GuideSteps'
import { FitTestDiagram, TabsDiagram } from '@/features/fixing/diagrams'
// The picker's order and the name of the fitted parts are the studio's own, so the two screens that set the
// fit can never run the fits the other way round or call the parts something else.
import { FIT_ORDER, fittedName, fittedParts } from '@/features/studio/edges'
import { downloadBlob, useExport, useLayout } from '@/hooks'
import { useDesign } from '@/state/designStore'
import { usePrefs } from '@/state/prefsStore'
import { announce, Button, buttonClassName, EmptyState, ProgressBar, Segmented, toast } from '@/ui'
import styles from './FitTestPage.module.scss'

/** The one group this page's parts are in, which the download page's table no longer carries. */
const FIT_TEST_GROUPS = [{ group: 'fit-test', title: 'Fit test' }] as const

/** The step that asks for the fit this page decides, and so the one that carries the picker. */
const FIT_STEP_KEY = 'fit-set'

const TABLE_CAPTION = 'Every part of the fit test, with the file of each and how it goes on the plate.'

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

/** "one notch" as a label under Snug. */
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const wasCancelled = (error: unknown) => error instanceof Error && error.name === 'AbortError'

export function FitTestPage() {
  const config = useDesign((state) => state.config)
  const update = useDesign((state) => state.update)
  const plan = useLayout(config)
  const format = usePrefs((state) => state.exportFormat)
  const { run, progress, busy, cancel, error } = useExport()

  /** The part being written on its own, or 'all' for the whole test. */
  const [job, setJob] = useState<string | null>(null)
  const retryRef = useRef<(() => void) | null>(null)
  const printsId = useId()
  const howId = useId()

  // A design can arrive in the address bar: it wins over whatever this browser last held.
  useDesignFromLink()

  // The wall's own parts decide what the test holds: it tries only what this wall really prints.
  const wall = useMemo(() => wallParts(config, plan), [config, plan])
  const parts = useMemo(() => fitTestFor(config, plan, wall), [config, plan, wall])
  // The guide reads the fasteners off the parts, so no second reading of the plans can disagree with it.
  const guide = useMemo(() => fitTestGuide({ config, parts }), [config, parts])
  const bytes = estimateFitTestZipBytes(plan, config, format, parts)

  function reportFailure(failure: unknown, retry: () => void) {
    if (wasCancelled(failure)) {
      toast('Download cancelled. Nothing was written.', { tone: 'info' })
      return
    }
    retryRef.current = retry
    const message = failure instanceof Error ? failure.message : String(failure)
    toast(`The files could not be written. ${message}`, { tone: 'error', action: { label: 'Try again', onClick: retry } })
  }

  async function downloadFitTest() {
    setJob('all')
    announce(`Writing ${plural(parts.length + 1, 'file')}.`)
    try {
      const result = await run({
        config,
        plan,
        format,
        quality: FIT_TEST_QUALITY,
        // No tile, so no height field is built; the parts carry their own geometry.
        pieceIds: [],
        accessoryIds: parts.map((part) => part.id),
        // The worker's own zip would add the wall's plan and a README about tiles this download has none of.
        zip: false,
      })
      const bundle = fitTestZip(config, parts, result.files, format)
      downloadBlob(bundle.data, bundle.name, 'application/zip')
      retryRef.current = null
      toast(`${bundle.name} is in your downloads.`, { tone: 'success' })
      announce(`Download ready: ${bundle.name}.`)
    } catch (failure) {
      reportFailure(failure, () => void downloadFitTest())
    } finally {
      setJob(null)
    }
  }

  async function downloadPart(part: AccessorySpec) {
    setJob(part.id)
    try {
      const result = await run({
        config,
        plan,
        format,
        quality: FIT_TEST_QUALITY,
        pieceIds: [],
        accessoryIds: [part.id],
        zip: false,
      })
      const file = result.files[0]
      if (file) {
        downloadBlob(file.data, file.name, file.mime)
        toast(`${file.name} is in your downloads.`, { tone: 'success' })
      }
    } catch (failure) {
      reportFailure(failure, () => void downloadPart(part))
    } finally {
      setJob(null)
    }
  }

  if (plan.pieces.length === 0) {
    return (
      <div className={`${styles.page} ${styles.pageEmpty}`}>
        <EmptyState
          illustration={<FitTestDiagram />}
          heading="Nothing to test yet"
          action={
            <Link to="/studio" className={buttonClassName('primary', 'lg')} {...studioIntent}>
              Start designing
            </Link>
          }
        >
          Give the studio a wall and a tile size. If your tiles go up on keys or wall clips, the fit test appears here.
        </EmptyState>
      </div>
    )
  }

  // No fitted part prints, so nothing has to fit into anything: glued, a plate too thin for the slots and
  // pockets, or tiles too small for them. The plan's own warnings say which, in the words the studio uses.
  if (!guide) {
    return (
      <div className={`${styles.page} ${styles.pageEmpty}`}>
        <EmptyState
          illustration={<FitTestDiagram />}
          heading="This design needs no fit test"
          action={
            <Link to="/studio" className={buttonClassName('primary', 'lg')} {...studioIntent}>
              Open the studio
            </Link>
          }
        >
          {/* A design that asked for keys or clips and got none must not be told to turn them on: what it
              places is what counts, and the cause is the plan's own warning below. */}
          {config.lock !== 'none' || config.mount === 'clips' ? (
            <>
              The tile-to-tile lock or wall clips this design asks for place nothing, so the tiles go up with glue or
              tape and nothing about them has to fit into anything.{' '}
              {plan.warnings.length > 0
                ? 'The note below says why.'
                : 'Step 7 in the studio, Putting it up, says what this wall really places.'}
            </>
          ) : (
            <>
              Nothing about this wall is made to fit into something else: the tiles go up with glue or tape. Turn on
              keys, tabs or wall clips in the studio, under Putting it up, and the fit test comes with them.
            </>
          )}
        </EmptyState>
        {plan.warnings.length > 0 && (
          <ul className={styles.warnings}>
            {plan.warnings.map((warning) => (
              <li key={`${warning.code}${warning.pieceId ?? ''}${warning.message}`}>{warning.message}</li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  const fraction = progress && progress.total > 0 ? progress.done / progress.total : null
  const system = guide.system
  // What the test really holds, read off its own parts: a clips-only wall is never shown a key.
  const triesKeys = parts.some((part) => part.kind === 'key')
  const triesClips = parts.some((part) => part.kind === 'clip')
  /** "keys and clips", "keys", "clips": the fitted parts this wall prints, in the studio's own words. */
  const fitted = fittedName(fittedParts(wall))
  // With the tabs the clearance is cut into the tile, so the test is not optional in the way it is for a
  // printed fastener: a fit settled afterwards costs the wall of tiles. Said once, here and in the guide.
  const tabbed = usesTabs(system)
  const fitOptions = FIT_ORDER.map((fit) => ({
    value: fit,
    label: FIT_MARKS[fit].name,
    description: capital(FIT_MARKS[fit].notches),
  }))

  function setFit(fit: FitClass) {
    update((design) => ({ ...design, fit }))
    announce(fitChosenText({ ...config, fit }, system))
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.headText}>
          <h1 className={styles.title}>The fit test</h1>
          <p className={styles.subject}>{config.name}</p>
          <p className={styles.lede}>{guide.lede}</p>
          <p className={styles.optional}>
            {tabbed
              ? 'Run it before you print the wall: the socket is cut into the tile itself, so a fit you do not like costs a reprint of the tiles.'
              : `It is optional: only the printed ${fitted} carry the fit, so a fit you do not like costs a reprint of those parts and never of a tile.`}
          </p>
        </div>
        {/* The page's one action, beside the words that say what it is for: the right half of the first
            screen was empty while the button sat below a reference table halfway down the page. */}
        <div className={styles.headSide}>
          <Link to="/studio" className={buttonClassName('ghost', 'sm')} {...studioIntent}>
            <ArrowLeft aria-hidden="true" width={16} height={16} />
            Back to the studio
          </Link>
          <div className={styles.kit}>
            <div className={styles.figure}>
              {/* A tabbed wall prints no fastener at all, so its test is the coupon pair: the fit is in the tile. */}
              {tabbed && !triesKeys && !triesClips ? (
                <TabsDiagram className={styles.figureSvg} coupons />
              ) : (
                <FitTestDiagram className={styles.figureSvg} keys={triesKeys} clips={triesClips} />
              )}
            </div>
            {busy ? (
              <div className={styles.progress}>
                <ProgressBar
                  label={progress?.label ?? 'Preparing the files'}
                  value={fraction}
                  detail={job === 'all' ? `${plural(parts.length + 1, 'file')} into one zip` : 'One part on its own'}
                />
                <Button variant="ghost" leadingIcon={<X />} onClick={cancel}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className={styles.get}>
                <Button variant="primary" size="lg" fullWidth leadingIcon={<Download />} onClick={downloadFitTest}>
                  Download the fit test (.zip)
                </Button>
                <p className={styles.getNote}>
                  {plural(parts.length + 1, 'file')}, about {formatBytes(bytes)}
                </p>
                {error && retryRef.current && (
                  <p className={styles.error} role="status">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <section className={styles.parts} aria-labelledby={printsId}>
        <div className={styles.partsHead}>
          <h2 id={printsId} className={styles.sectionTitle}>
            What it prints
          </h2>
          <p className={styles.partsNote}>
            {plural(parts.length, 'small file')}, printed once each. The coupons are pieces of your own relief and
            plate;{' '}
            {tabbed && !triesKeys && !triesClips
              ? 'the socket is cut into three of them, one for each fit, told apart by one, two or three small notches.'
              : 'each fastener comes in three fits, told apart by one, two or three small notches.'}
          </p>
        </div>

        <AccessoryTable
          accessories={parts}
          format={format}
          groups={FIT_TEST_GROUPS}
          caption={TABLE_CAPTION}
          busyId={job === 'all' ? null : job}
          disabled={busy}
          onDownload={downloadPart}
        />
      </section>

      <section className={styles.section} aria-labelledby={howId}>
        <h2 id={howId} className={styles.sectionTitle}>
          How to run it
        </h2>
        {/* The picker belongs inside the step that asks for it, not in a section of its own that says the
            same thing a second time: GuideSteps takes an aside for exactly this. */}
        <GuideSteps
          steps={guide.steps}
          system={system}
          needs={guide.needs}
          aside={(step) =>
            step.key === FIT_STEP_KEY ? (
              <div className={styles.fitControl}>
                <Segmented label="Fit" value={config.fit} options={fitOptions} onChange={setFit} />
                <p className={styles.fitNote}>{fitChosenText(config, system)}</p>
              </div>
            ) : null
          }
        />
      </section>

      <div className={styles.exits}>
        <Link to="/download" className={buttonClassName('primary', 'lg')}>
          On to your files
        </Link>
        <Link to="/studio" className={buttonClassName('ghost', 'lg')} {...studioIntent}>
          Back to the studio
        </Link>
      </div>
    </div>
  )
}
