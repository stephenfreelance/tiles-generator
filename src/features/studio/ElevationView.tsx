import { useState, type RefObject } from 'react'
import { Focus } from 'lucide-react'
import { presetByHex } from '@/core/colors'
import { textureById } from '@/core/textures/registry'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { usePrefs, type ViewMode } from '@/state/prefsStore'
import { TileViewport, type TileViewportHandle } from '@/three/TileViewport'
import { IconButton, Segmented, Spinner, ViewFrame } from '@/ui'
import styles from './studio.module.scss'
import { PENDING_DELAY_MS, useDelayedFlag } from './useDelayedFlag'
import { ViewOptions } from './ViewOptions'

// The render is the wall. "One tile" is a closer look at the same design, not another way to fit it.
const MODE_OPTIONS = [
  { value: 'surface' as ViewMode, label: 'Whole wall' },
  { value: 'tile' as ViewMode, label: 'One tile' },
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
  // Most edits resolve in well under 200 ms, and a label that comes and goes inside that cannot be
  // read: only a build slow enough to be worth waiting for says so. The viewport's own aria-busy
  // stays immediate, because assistive tech should hear the truth at once.
  const showPending = useDelayedFlag(pending, PENDING_DELAY_MS)

  const texture = textureById(config.texture.id)
  // A preset is named; a custom color has no name worth reading, so its code stands in for one.
  const colorLabel = presetByHex(config.color)?.name ?? config.color

  return (
    <ViewFrame
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
            value={viewMode}
            onChange={(value) => setPrefs({ viewMode: value })}
            options={MODE_OPTIONS}
          />
        ),
        bottomLeft: showPending ? (
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
              onChange={(patch) => setPrefs(patch)}
            />
            <IconButton
              size="sm"
              variant="outline"
              icon={<Focus />}
              aria-label="Reset view"
              shortcut="R"
              onClick={() => viewportRef.current?.resetView()}
            />
          </div>
        ),
      }}
    >
      <TileViewport
        ref={viewportRef}
        config={config}
        plan={plan}
        mode={viewMode}
        lightAngle={lightAngle}
        showDimensions={showDimensions}
        showLayerLines={showLayerLines}
        highlightPieceId={highlightPieceId}
        interactive
        onPendingChange={setPending}
      />
    </ViewFrame>
  )
}
