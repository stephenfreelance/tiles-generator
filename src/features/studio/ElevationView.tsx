import { useEffect, useMemo, useState, type MouseEvent, type RefObject } from 'react'
import { Focus } from 'lucide-react'
import { presetByHex } from '@/core/colors'
import { textureById } from '@/core/textures/registry'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { heroPiece } from '@/hooks/previewLod'
import { usePrefs, type ViewMode } from '@/state/prefsStore'
import { STUDIO_VIEW_ID, useViewPeek } from '@/state/viewPeek'
import type { TileFace } from '@/three/flip'
import { TileViewport, type TileViewportHandle } from '@/three/TileViewport'
import { IconButton, Segmented, Spinner, ViewFrame, VisuallyHidden } from '@/ui'
import peekStyles from './ElevationView.module.scss'
import { pieceName } from './mountingCopy'
import styles from './studio.module.scss'
import { backHasPockets } from './tileBack'
import { PENDING_DELAY_MS, useDelayedFlag } from './useDelayedFlag'
import { ViewOptions } from './ViewOptions'

// The render is the wall. "One tile" is a closer look at the same design, not another way to fit it.
const MODE_OPTIONS = [
  { value: 'surface' as ViewMode, label: 'Whole wall' },
  { value: 'tile' as ViewMode, label: 'One tile' },
]

// The back only has something to show once keys or clips really cut their pockets into it.
const FACE_OPTIONS = [
  { value: 'front' as TileFace, label: 'Front' },
  { value: 'back' as TileFace, label: 'Back' },
]

const DEFAULT_LIGHT_ANGLE = 35

export interface ElevationViewProps {
  config: DesignConfig
  plan: LayoutPlan
  highlightPieceId: string | null
  viewportRef: RefObject<TileViewportHandle | null>
  className?: string
}

/**
 * The wall itself under a warm raking light. The render is the product, so it takes most of the
 * screen and carries only what is being shown and the few tools that change how it is drawn.
 */
export function ElevationView({ config, plan, highlightPieceId, viewportRef, className }: ElevationViewProps) {
  const viewMode = usePrefs((s) => s.viewMode)
  const lightAngle = usePrefs((s) => s.lightAngle)
  const showDimensions = usePrefs((s) => s.showDimensions)
  const showLayerLines = usePrefs((s) => s.showLayerLines)
  const setPrefs = usePrefs((s) => s.set)
  const [pending, setPending] = useState(false)
  // A look at the back is a glance, not a setting (state/viewPeek.ts): every visit starts face up, and
  // only the single tile turns over, only when its back really has a pocket. Step 7 can borrow the One
  // tile view for a peek at the back; the maker's own view setting is left as it was.
  const face = useViewPeek((s) => s.face)
  const peeking = useViewPeek((s) => s.peeking)
  const hasPockets = useMemo(() => backHasPockets(config, plan), [config, plan])
  const peekShown = peeking && hasPockets
  const shownMode: ViewMode = peekShown ? 'tile' : viewMode
  const canTurn = shownMode === 'tile' && hasPockets
  const hero = useMemo(() => heroPiece(plan), [plan])
  // Most edits resolve in well under 200 ms, and a label that comes and goes inside that cannot be
  // read: only a build slow enough to be worth waiting for says so. The viewport's own aria-busy
  // stays immediate, because assistive tech should hear the truth at once.
  const showPending = useDelayedFlag(pending, PENDING_DELAY_MS)

  // A back with no pocket left to show lets go of the peek, and every return to the tile starts face up.
  useEffect(() => {
    if (canTurn) return
    const view = useViewPeek.getState()
    if (view.peeking) view.endPeek()
    else if (view.face !== 'front') view.reset()
  }, [canTurn, peeking, face])

  useEffect(() => () => useViewPeek.getState().reset(), [])

  const texture = textureById(config.texture.id)
  // A preset is named; a custom color has no name worth reading, so its code stands in for one.
  const colorLabel = presetByHex(config.color)?.name ?? config.color

  const showFront = (event: MouseEvent<HTMLButtonElement>) => {
    useViewPeek.getState().endPeek()
    // The pill goes with the peek: a keyboard press (detail 0) would otherwise drop focus on the page.
    if (event.detail === 0) viewportRef.current?.focus()
  }

  return (
    <ViewFrame
      id={STUDIO_VIEW_ID}
      number={1}
      title="Your wall"
      // The render is unmistakably the wall, and the first choice beside it is already headed
      // "Your wall": captioning it again only printed the same words twice.
      titleHidden
      className={className}
      bodyClassName={styles.viewportBody}
      corners={{
        topLeft: (
          <Segmented
            aria-label="What the view shows"
            value={shownMode}
            onChange={(value) => {
              // Picking a view is the maker taking it back: whatever a peek showed, it ends here.
              useViewPeek.getState().endPeek()
              setPrefs({ viewMode: value })
            }}
            options={MODE_OPTIONS}
          />
        ),
        topRight: canTurn ? (
          <Segmented
            aria-label="Side of the tile"
            value={face}
            onChange={(value) => useViewPeek.getState().setFace(value)}
            options={FACE_OPTIONS}
          />
        ) : undefined,
        bottomLeft:
          peekShown && hero ? (
            <button type="button" className={peekStyles.peek} onClick={showFront}>
              {/* The same words step 7 uses for the piece the view turned over: a cut is a piece, not a tile. */}
              <span className={peekStyles.peekWhat}>Back of {pieceName(hero)}</span>
              <span className={peekStyles.peekDot} aria-hidden="true">
                ·
              </span>
              <VisuallyHidden>, </VisuallyHidden>
              <span className={peekStyles.peekAction}>Show the front</span>
            </button>
          ) : showPending ? (
            <span className={styles.pending} data-pending="true">
              <Spinner size={14} />
              Sculpting the relief
            </span>
          ) : (
            // What is on the bench, named on the bench.
            <span className={styles.matPill}>
              <span className={styles.matDot} style={{ background: config.color }} aria-hidden="true" />
              <span className={styles.matName}>{texture.name}</span>
              <span className={styles.matMeta}>in {colorLabel}</span>
            </span>
          ),
        bottomRight: (
          <div className={styles.stageTools}>
            <ViewOptions
              lightAngle={lightAngle}
              defaultAngle={DEFAULT_LIGHT_ANGLE}
              showDimensions={showDimensions}
              showLayerLines={showLayerLines}
              onChange={(patch) => {
                // Lighting the back of the tile is looking at it: the peek becomes the maker's own view.
                useViewPeek.getState().keepView()
                setPrefs(patch)
              }}
            />
            <IconButton
              size="sm"
              variant="outline"
              icon={<Focus />}
              aria-label="Reset view"
              shortcut="R"
              onClick={() => {
                useViewPeek.getState().keepView()
                viewportRef.current?.resetView()
              }}
            />
          </div>
        ),
      }}
    >
      <TileViewport
        ref={viewportRef}
        config={config}
        plan={plan}
        mode={shownMode}
        lightAngle={lightAngle}
        showDimensions={showDimensions}
        showLayerLines={showLayerLines}
        highlightPieceId={highlightPieceId}
        face={canTurn ? face : 'front'}
        interactive
        onPendingChange={setPending}
      />
    </ViewFrame>
  )
}
