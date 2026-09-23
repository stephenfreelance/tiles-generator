import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Check, Download, Scissors } from 'lucide-react'
import { useNavigate } from 'react-router'
import { CopyLinkButton } from '@/app/CopyLinkButton'
import { isTypingTarget } from '@/app/keyboard'
import { useDesignFromLink } from '@/app/useDesignFromLink'
import { printerById } from '@/core/printers'
import type { DesignConfig } from '@/core/types'
import { accessoryRows, cutEdgesText, planTotals } from '@/features/plan/planCopy'
import { PlanPieces } from '@/features/plan/PlanPieces'
import { WallMap } from '@/features/plan/WallMap'
import { planLayoutKey } from '@/features/plan/wallMapGeometry'
import { AdvancedPanel } from '@/features/studio/AdvancedPanel'
import { Disclosure } from '@/features/studio/Disclosure'
import { ColorGroup } from '@/features/studio/ColorGroup'
import { tileModels } from '@/features/studio/edges'
import { EdgesGroup } from '@/features/studio/EdgesGroup'
import { ElevationView } from '@/features/studio/ElevationView'
import { FirstRunNote } from '@/features/studio/FirstRunNote'
import { fitSummary } from '@/features/studio/fitCopy'
import { FitSummary } from '@/features/studio/FitSummary'
import { MountingGroup } from '@/features/studio/MountingGroup'
import { TextureGroup } from '@/features/studio/TextureGroup'
import { ThicknessGroup } from '@/features/studio/ThicknessGroup'
import { TileSizeGroup } from '@/features/studio/TileSizeGroup'
import { useStudioUpdate } from '@/features/studio/useStudioUpdate'
import { WallGroup } from '@/features/studio/WallGroup'
import { WarningNotes } from '@/features/studio/WarningNotes'
import { useFilamentEstimate, useLayout, usePlanModel } from '@/hooks'
import { useDesign } from '@/state/designStore'
import { useHistory } from '@/state/historyStore'
import { usePrefs } from '@/state/prefsStore'
import { useViewPeek } from '@/state/viewPeek'
import type { TileViewportHandle } from '@/three/TileViewport'
import { announce, Button, toast } from '@/ui'
import type { StyleWithVars } from '@/ui/cx'
import styles from './StudioPage.module.scss'

/** Wide enough for the history shelf to show the design rather than a stamp. */
const THUMBNAIL_PX = 420

/** Grams are what the estimate works in; kilograms are what a maker buys. */
function weightText(grams: number): string | null {
  if (!(grams > 0)) return null
  return grams >= 1000 ? `about ${(grams / 1000).toFixed(1)} kg` : `about ${Math.round(grams)} g`
}

/** Everything but the name and the color decides how the wall splits into files. */
const modelsKey = (config: DesignConfig): string => JSON.stringify({ ...config, name: '', color: '' })

/** The focus ring is drawn outside the control it marks (3 px at a 2 px offset), so it needs clearing too. */
const FOCUS_RING_PX = 5

/**
 * Below 1100 px the foot is pinned over the page: the page scrolls a focused control clear of it, never under it.
 * Kept equal to the foot's own height, which grows with its wrapped lines, plus the focus ring.
 */
function useFootScrollPadding(foot: HTMLElement | null) {
  useEffect(() => {
    if (!foot || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const query = window.matchMedia('(max-width: 1099px)')
    const apply = () => {
      const box = foot.getBoundingClientRect()
      root.style.scrollPaddingBottom = query.matches ? `${Math.ceil(box.height) + FOCUS_RING_PX}px` : ''
      if (!query.matches) return
      // A choice can grow the foot over the very control that made it (a card whose choice adds a line to
      // the summary): the padding only holds for scrolls to come, so that control is brought back now.
      const active = document.activeElement
      if (!(active instanceof HTMLElement) || active === document.body || foot.contains(active)) return
      if (active.getBoundingClientRect().bottom + FOCUS_RING_PX <= box.top) return
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      active.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(foot)
    query.addEventListener('change', apply)
    return () => {
      observer.disconnect()
      query.removeEventListener('change', apply)
      root.style.scrollPaddingBottom = ''
    }
  }, [foot])
}

/**
 * The studio: the wall as it will look, and beside it the seven numbered choices that make it.
 * Everything a maker needs is on the bench at once; the one thing that folds away says on its lid
 * what it holds, and the action that ends the job is always in view at the foot of the column.
 */
export function StudioPage() {
  const config = useDesign((s) => s.config)
  // Every group edits through this, so a Recommended tile follows the wall within the same undo step.
  const { update, chooseTile, tileChoice } = useStudioUpdate(config)
  const plan = useLayout(config)
  const model = usePlanModel(config, plan)
  const { estimate } = useFilamentEstimate(config, plan)
  // Tile files with and without the border and the keys: steps 6 and 7 each say what theirs costs.
  const shapeKey = modelsKey(config)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the key holds every field the count reads
  const models = useMemo(() => tileModels(config, printerById(config.printerId)), [shapeKey])
  const [foot, setFoot] = useState<HTMLDivElement | null>(null)
  useFootScrollPadding(foot)
  const setPrefs = usePrefs((s) => s.set)
  const save = useHistory((s) => s.save)
  const navigate = useNavigate()

  // A design can arrive in the address bar: it wins over whatever this browser last held.
  useDesignFromLink()

  const viewportRef = useRef<TileViewportHandle | null>(null)
  // A piece is chosen by a click on the drawing (a piece or its chip) and pointed at by hovering a warning;
  // the warning wins while the pointer is on it, and leaving it can never wipe the maker's own choice.
  const [pinnedPiece, setPinnedPiece] = useState<{ id: string; layout: string } | null>(null)
  const [warningPieceId, setWarningPieceId] = useState<string | null>(null)
  // Derived, not synced: ids are letters handed out again on every relayout, so a choice only holds
  // for the layout it was made on (a recolour keeps the key, and the choice).
  const layoutKey = planLayoutKey(model)
  const pinned = pinnedPiece?.layout === layoutKey ? pinnedPiece.id : null
  const shownPieceId = warningPieceId ?? pinned
  const togglePiece = useCallback(
    (pieceId: string) =>
      setPinnedPiece((was) => (was?.id === pieceId && was.layout === layoutKey ? null : { id: pieceId, layout: layoutKey })),
    [layoutKey],
  )
  const clearPiece = useCallback(() => setPinnedPiece(null), [])
  const [saving, setSaving] = useState(false)
  // The first-run note has done its work the moment the maker changes anything or points at a piece.
  const [openingConfig] = useState(config)
  const hintAnswered = pinnedPiece !== null || warningPieceId !== null || config !== openingConfig

  // The wall's parts are files too: the foot names them apart, and "Your pieces" adds them up. One row is
  // one file, and the fit test has none here: it prints from its own page, before these files are worth it.
  const partFiles = accessoryRows(model).length
  const summary = fitSummary(plan, partFiles)
  const spokenFit = useRef(summary.sentence)
  // The chosen color tints the bench: the fit strip and the drawn tiles take it, so picking Green
  // turns the page green. One wash, kept light enough to leave every text contrast where it was
  // (see StudioPage.module.scss).
  const studioStyle: StyleWithVars = { '--filament': config.color }
  const weight = weightText(estimate.totalGrams)

  // Every relayout is spoken, because the counts are the answer the maker is waiting for.
  useEffect(() => {
    if (spokenFit.current === summary.sentence) return
    spokenFit.current = summary.sentence
    announce(summary.sentence)
  }, [summary.sentence])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      // View shortcuts are view controls: choosing a view ends a peek, a reset keeps it as the maker's own.
      switch (event.key) {
        case '1':
          useViewPeek.getState().endPeek()
          setPrefs({ viewMode: 'surface' })
          break
        case '2':
          useViewPeek.getState().endPeek()
          setPrefs({ viewMode: 'tile' })
          break
        case 'r':
        case 'R':
          useViewPeek.getState().keepView()
          viewportRef.current?.resetView()
          break
        default:
          return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setPrefs])

  const getFiles = async () => {
    if (saving) return
    setSaving(true)
    let thumbnail: string | undefined
    try {
      // No waiting on the re-lay wave here: the download page takes the settled thumbnail on arrival.
      thumbnail = (await viewportRef.current?.capture(THUMBNAIL_PX, { maxWaitMs: 0 })) ?? undefined
    } catch (error) {
      // A missing thumbnail is not worth stopping the download for.
      console.warn('[studio] could not capture a preview thumbnail', error)
    }
    save(config, { thumbnail, validated: true })
    setSaving(false)
    toast(`"${config.name}" saved to your designs.`, { tone: 'success' })
    navigate('/download')
  }

  const { files } = planTotals(model)

  // Escape lets go of a chosen piece, and only then: otherwise the key belongs to whoever else wants it.
  const onPlanKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !pinned) return
    clearPiece()
    event.stopPropagation()
  }

  return (
    <div className={styles.studio} style={studioStyle}>
      <ElevationView
        className={styles.stage}
        config={config}
        plan={plan}
        highlightPieceId={shownPieceId}
        viewportRef={viewportRef}
      />

      <section className={styles.rail} aria-label="Your choices">
        <div className={styles.steps}>
          <WallGroup config={config} update={update} />
          <TileSizeGroup
            config={config}
            update={update}
            choice={tileChoice}
            onChoose={chooseTile}
          />
          <ThicknessGroup config={config} update={update} />
          <TextureGroup config={config} update={update} />
          <ColorGroup config={config} update={update} />
          <EdgesGroup config={config} update={update} models={models} />
          <MountingGroup config={config} update={update} plan={plan} models={models} />

          <div className={styles.advanced}>
            <AdvancedPanel config={config} update={update} />
          </div>

          <section className={styles.plan} aria-labelledby="studio-plan-title" onKeyDown={onPlanKeyDown}>
            <div className={styles.planHead}>
              <h2 id="studio-plan-title" className={styles.planTitle}>
                Tiling plan
              </h2>
              <span className={styles.planNow}>{cutEdgesText(model)}</span>
            </div>

            <WallMap model={model} selectedPieceId={shownPieceId} onSelect={togglePiece} />

            {/* Warnings sit right under the drawing, so opening the lid never pushes them away. */}
            <WarningNotes
              warnings={plan.warnings}
              config={config}
              plan={plan}
              update={update}
              onHighlight={setWarningPieceId}
            />

            {/* A real warning outranks a hint, so the note only speaks when the layout has nothing to say. */}
            <FirstRunNote suppressed={plan.warnings.length > 0} answered={hintAnswered} />

            {/* The pieces to print. The drawing above already shows where to start, and a row tints to match its choice. */}
            <Disclosure flush revealOnOpen label="Your pieces" badge={`${files} ${files === 1 ? 'file' : 'files'}`}>
              <PlanPieces model={model} selectedPieceId={shownPieceId} />
            </Disclosure>
          </section>
        </div>

        <div ref={setFoot} className={styles.foot}>
          <div className={styles.fit}>
            <span className={styles.fitIcon} data-exact={plan.exact || undefined} aria-hidden="true">
              {plan.exact ? <Check /> : <Scissors />}
            </span>
            <FitSummary plan={plan} partFiles={partFiles} className={styles.fitText} />
            {weight && <span className={styles.fitWeight}>{weight}</span>}
          </div>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={saving}
            loadingLabel="Saving your design"
            trailingIcon={<Download />}
            onClick={getFiles}
          >
            Get my files
          </Button>

          <p className={styles.micro}>Nothing is uploaded. Every file is made in your browser.</p>
          <CopyLinkButton config={config} className={styles.copyLink} />
        </div>
      </section>
    </div>
  )
}
