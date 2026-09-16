// "Where the cuts fall": the whole tiling plan of the wall the visitor sized, drawn on entry.
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useMediaQuery } from '@/app/useMediaQuery'
import { buildPlanModel, type PlanTile } from '@/core/plan/planModel'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { formatSize } from '@/core/units'
import { cornerDetail } from './cornerDetail'
import { PlanFragment } from './PlanFragment'
import styles from './CutPlanPanel.module.scss'

export interface CutPlanPanelProps {
  config: DesignConfig
  plan: LayoutPlan
  activePieceId: string | null
  onActivePiece: (id: string | null) => void
}

/** Below this the panels stack and the drawing gets the phone's width, so it is drawn compact. */
const COMPACT_QUERY = '(max-width: 48rem)'

/** How far down the window the drawing has to reach before the wave is worth playing. */
const ENTER_FRACTION = 0.9

/**
 * A reveal nobody asked for is a reveal that never happens: with reduced motion, or with no window to
 * measure the panel against, the plan is simply drawn from the first frame.
 */
function drawnOnMount(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true
}

/** The piece under the pointer: one listener over the drawing, not one per tile. */
function pieceUnder(event: PointerEvent<HTMLDivElement>): string | null {
  const target = event.target instanceof Element ? event.target.closest('[data-piece]') : null
  return target?.getAttribute('data-piece') ?? null
}

export function CutPlanPanel({ config, plan, activePieceId, onActivePiece }: CutPlanPanelProps) {
  const model = useMemo(() => buildPlanModel(config, plan), [config, plan])
  const compact = useMediaQuery(COMPACT_QUERY)
  // The wave is settled once, at mount, beside the state it sets: a plan drawn from the first frame has
  // nothing for the shutter layer to do, so that layer is never rendered rather than left in the drawing.
  const [instant] = useState(drawnOnMount)
  const [drawn, setDrawn] = useState(instant)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Measured against the window on arrival and on every scroll until it plays, rather than left to an
  // IntersectionObserver: a jump (a restored scroll position, find-in-page, the skip link) can carry the
  // panel past an observer without one callback, and a plan that never uncovers itself is the whole
  // drawing lost. Reading one rect per scroll event costs nothing, and both listeners go once it is drawn.
  useEffect(() => {
    const element = bodyRef.current
    if (drawn || !element) return
    const check = () => {
      const box = element.getBoundingClientRect()
      if (box.top < window.innerHeight * ENTER_FRACTION && box.bottom > 0) setDrawn(true)
    }
    check()
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check, { passive: true })
    return () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [drawn])

  // buildPlanModel copies each placement's own x and y, so the detail's cells match the tiles exactly.
  const region = useMemo<PlanTile[]>(() => {
    const cells = new Set(cornerDetail(plan).placements.map((placement) => `${placement.x}:${placement.y}`))
    return model.tiles.filter((tile) => cells.has(`${tile.x}:${tile.y}`))
  }, [model, plan])

  const size = formatSize(config.surface.width, config.surface.height, config.surfaceUnit)
  const marks = model.legend.map((row) => row.mark)
  // A wall that prints from one piece has no range to read out, so the sentence drops the marks.
  const cuts =
    marks.length > 1
      ? `${plan.partialCount} cut pieces marked ${marks[0]} to ${marks[marks.length - 1]}`
      : `${plan.partialCount} cut pieces`
  const label = plan.exact
    ? `Tiling plan of a ${size} wall: ${plan.placements.length} whole tiles, corner to corner, dimensioned along the bottom.`
    : `Tiling plan of a ${size} wall: ${plan.fullCount} whole tiles and ${cuts}, dimensioned along the bottom.`

  // Pointing at a tile lights its model up across the panels. Every mark, label and size is in the
  // legend beside the drawing, so this is a shortcut, never the only way to read the plan.
  const point = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return
    const pieceId = pieceUnder(event)
    if (pieceId !== activePieceId) onActivePiece(pieceId)
  }

  return (
    <figure className={styles.panel}>
      <figcaption className={styles.title}>
        Where the cuts fall
        <span className={styles.note}>{size}</span>
      </figcaption>
      <div
        ref={bodyRef}
        className={styles.body}
        data-drawn={drawn || undefined}
        onPointerMove={point}
        onPointerLeave={() => onActivePiece(null)}
      >
        <PlanFragment
          model={model}
          label={label}
          compact={compact}
          markWholeTiles
          outlineTiles={region}
          reveal={!instant}
          activePieceId={activePieceId}
        />
      </div>
    </figure>
  )
}
