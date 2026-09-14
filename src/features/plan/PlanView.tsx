import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { PlanModel, PlanTile } from '@/core/plan/planModel'
import { formatSize } from '@/core/units'
import { cx } from '@/ui/cx'
import { PlanDimensions } from './PlanDimensions'
import { PlanLegend } from './PlanLegend'
import { planFrame, planGutters, type PlanFrame } from './planLayout'
import styles from './PlanView.module.scss'
import { useElementSize } from './useElementSize'

/** Hatch stroke spacing on cut pieces, in screen pixels. */
const HATCH_PX = 6
/** A tile smaller than this on screen has no room for its mark. */
const MARK_MIN_PX = 15
/** The plan needs at least this much width before it is worth drawing. */
const DRAWABLE_PX = 60

function CentreLines({ model, frame }: { model: PlanModel; frame: PlanFrame }) {
  const mm = frame.mmPerPx
  const { x, y } = model.settingOut.centreLines
  return (
    <g>
      {x !== null && (
        <line className={styles.centreLine} x1={x} y1={-10 * mm} x2={x} y2={model.height + 10 * mm} vectorEffect="non-scaling-stroke" />
      )}
      {y !== null && (
        <line
          className={styles.centreLine}
          x1={-10 * mm}
          y1={model.height - y}
          x2={model.width + 10 * mm}
          y2={model.height - y}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  )
}

/** The corner the tiler measures from, marked as it would be on the wall. */
function SettingOutMark({ model, frame }: { model: PlanModel; frame: PlanFrame }) {
  const mm = frame.mmPerPx
  const x = model.settingOut.point.x
  const y = model.height - model.settingOut.point.y
  return (
    <g>
      <circle className={styles.setOut} cx={x} cy={y} r={5 * mm} vectorEffect="non-scaling-stroke" />
      <circle className={styles.setOutFill} cx={x} cy={y} r={1.5 * mm} />
      <line className={styles.setOut} x1={x - 10 * mm} y1={y} x2={x + 10 * mm} y2={y} vectorEffect="non-scaling-stroke" />
      <line className={styles.setOut} x1={x} y1={y - 10 * mm} x2={x} y2={y + 10 * mm} vectorEffect="non-scaling-stroke" />
      <text className={styles.setOutLabel} x={x + 12 * mm} y={y - 8 * mm} fontSize={8 * mm}>
        Set out
      </text>
    </g>
  )
}

export interface PlanViewProps {
  model: PlanModel
  /** Piece tinted in the 3D view; its tiles are inked chalk-blue here too. */
  highlightPieceId: string | null
  onHighlight: (pieceId: string | null) => void
  /** Reports the drawing scale ("1:20") so the view title can print it. */
  onScaleChange?: (scaleText: string) => void
  className?: string
}

/**
 * The setting-out drawing: full tiles outlined in graphite, cuts hatched in red pencil with their
 * mark, dimension chains along the bottom and the side, and the point the tiler measures from.
 * Hovering or focusing a tile tints the same piece in the 3D view.
 */
export function PlanView({ model, highlightPieceId, onHighlight, onScaleChange, className }: PlanViewProps) {
  const [boxRef, size] = useElementSize<HTMLDivElement>()
  const svgRef = useRef<SVGSVGElement>(null)
  const reportedScale = useRef<string | null>(null)
  const hatchId = `plan-hatch${useId()}`
  const [activeIndex, setActiveIndex] = useState(0)

  const gutters = useMemo(() => planGutters(model.chains.columns.length), [model.chains.columns.length])
  const frame = useMemo(
    () => planFrame({ width: model.width, height: model.height }, size, gutters),
    [model.width, model.height, size, gutters],
  )

  useEffect(() => {
    if (reportedScale.current === frame.scaleText) return
    reportedScale.current = frame.scaleText
    onScaleChange?.(frame.scaleText)
  }, [frame.scaleText, onScaleChange])

  // One tab stop for the whole grid: arrows walk the tiles from there, as on a plan.
  const grid = useMemo(() => {
    const byKey = new Map<string, number>()
    const rows = new Map<number, number[]>()
    model.tiles.forEach((tile, index) => {
      byKey.set(`${tile.row}:${tile.col}`, index)
      const list = rows.get(tile.row)
      if (list) list.push(index)
      else rows.set(tile.row, [index])
    })
    return { byKey, rows }
  }, [model.tiles])

  const focusTile = (index: number) => {
    setActiveIndex(index)
    svgRef.current?.querySelector<SVGRectElement>(`[data-tile="${index}"]`)?.focus()
  }

  const nearestInRow = (row: number, col: number): number | undefined => {
    const list = grid.rows.get(row)
    if (!list) return undefined
    let best: number | undefined
    let bestDistance = Number.POSITIVE_INFINITY
    for (const index of list) {
      const distance = Math.abs(model.tiles[index].col - col)
      if (distance < bestDistance) {
        bestDistance = distance
        best = index
      }
    }
    return best
  }

  const handleKeyDown = (event: KeyboardEvent<SVGRectElement>, tile: PlanTile) => {
    let target: number | undefined
    switch (event.key) {
      case 'ArrowRight':
        target = grid.byKey.get(`${tile.row}:${tile.col + 1}`)
        break
      case 'ArrowLeft':
        target = grid.byKey.get(`${tile.row}:${tile.col - 1}`)
        break
      case 'ArrowUp':
        target = nearestInRow(tile.row + 1, tile.col)
        break
      case 'ArrowDown':
        target = nearestInRow(tile.row - 1, tile.col)
        break
      case 'Home':
        target = grid.rows.get(tile.row)?.[0]
        break
      case 'End':
        target = grid.rows.get(tile.row)?.at(-1)
        break
      default:
        return
    }
    if (target === undefined) return
    // The plan owns its arrows: they must not also orbit the 3D view or scroll the column.
    event.preventDefault()
    event.stopPropagation()
    focusTile(target)
  }

  const drawable = size.width > DRAWABLE_PX && size.height > DRAWABLE_PX && model.tiles.length > 0
  const tabStop = Math.min(activeIndex, Math.max(0, model.tiles.length - 1))
  // A repeated full tile is called out once, as a typical piece; every cut carries its own mark.
  const typical = new Map<string, number>()
  model.tiles.forEach((tile, index) => {
    if (!typical.has(tile.pieceId)) typical.set(tile.pieceId, index)
  })
  const chainKey = `${model.chains.columns.length}:${model.chains.columns[0]?.items.length ?? 0}:${model.chains.rows.items.length}`
  const { viewBox } = frame

  return (
    <div className={cx(styles.plan, className)}>
      <div ref={boxRef} className={styles.drawing}>
        {drawable && (
          <svg
            ref={svgRef}
            className={styles.svg}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            role="group"
            aria-label={`Setting-out plan, ${formatSize(model.width, model.height)}: ${model.fullCount} full tiles and ${model.cutCount} cut pieces`}
          >
            <defs>
              <pattern
                id={hatchId}
                width={HATCH_PX * frame.mmPerPx}
                height={HATCH_PX * frame.mmPerPx}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(-45)"
              >
                <line
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={HATCH_PX * frame.mmPerPx}
                  stroke="var(--red-hatch)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </pattern>
            </defs>

            <g key={chainKey} className={styles.chains}>
              <PlanDimensions model={model} frame={frame} />
            </g>

            <CentreLines model={model} frame={frame} />

            <rect
              className={styles.surface}
              x={0}
              y={0}
              width={model.width}
              height={model.height}
              vectorEffect="non-scaling-stroke"
            />

            {model.tiles.map((tile, index) => {
              const widthPx = tile.w * frame.scale
              const heightPx = tile.h * frame.scale
              const label = `${tile.cut ? 'Cut' : 'Full tile'} ${tile.mark}, ${formatSize(tile.w, tile.h)}, row ${tile.row + 1}, column ${tile.col + 1}`
              const marked =
                (tile.cut || typical.get(tile.pieceId) === index) && widthPx > MARK_MIN_PX && heightPx > MARK_MIN_PX
              const markPx = Math.min(13, Math.max(8, Math.min(widthPx, heightPx) * 0.34))
              return (
                <g key={`${tile.row}-${tile.col}`}>
                  <rect
                    data-tile={index}
                    className={cx(
                      styles.tile,
                      tile.cut && styles.tileCut,
                      highlightPieceId === tile.pieceId && styles.tileActive,
                    )}
                    x={tile.x}
                    y={model.height - tile.y - tile.h}
                    width={tile.w}
                    height={tile.h}
                    fill={tile.cut ? `url(#${hatchId})` : undefined}
                    vectorEffect="non-scaling-stroke"
                    role="button"
                    tabIndex={index === tabStop ? 0 : -1}
                    aria-label={label}
                    onPointerEnter={() => onHighlight(tile.pieceId)}
                    onPointerLeave={() => onHighlight(null)}
                    onFocus={() => {
                      setActiveIndex(index)
                      onHighlight(tile.pieceId)
                    }}
                    onBlur={() => onHighlight(null)}
                    onClick={() => focusTile(index)}
                    onKeyDown={(event) => handleKeyDown(event, tile)}
                  >
                    <title>{label}</title>
                  </rect>
                  {marked && (
                    <text
                      className={cx(styles.mark, tile.cut && styles.markCut)}
                      x={tile.x + tile.w / 2}
                      y={model.height - tile.y - tile.h / 2}
                      fontSize={markPx * frame.mmPerPx}
                    >
                      {tile.mark}
                    </text>
                  )}
                </g>
              )
            })}

            <SettingOutMark model={model} frame={frame} />
          </svg>
        )}
      </div>
      <PlanLegend model={model} highlightPieceId={highlightPieceId} onHighlight={onHighlight} />
    </div>
  )
}
