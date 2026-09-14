import { useId } from 'react'
import type { PlanModel } from '@/core/plan/planModel'
import { cx } from '@/ui/cx'
import styles from './FitDiagram.module.scss'

/** Hatch pitch as a fraction of the longer wall, so the strokes read at any wall size. */
const HATCH_DIVISOR = 60

export interface FitDiagramProps {
  model: PlanModel
  className?: string
}

/**
 * The fit at a glance: the wall, the tiles in it, the cut pieces hatched. Nothing else, because
 * everything else on the full drawing answers a question from after the download.
 */
export function FitDiagram({ model, className }: FitDiagramProps) {
  const hatchId = `fit-hatch${useId()}`
  const pitch = Math.max(model.width, model.height) / HATCH_DIVISOR
  const label = model.exact
    ? `The wall, drawn as ${model.fullCount} whole tiles`
    : `The wall, drawn as ${model.fullCount} whole tiles with ${model.cutCount} cut pieces hatched`

  return (
    <svg
      className={cx(styles.diagram, className)}
      viewBox={`0 0 ${model.width} ${model.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
    >
      <defs>
        <pattern id={hatchId} width={pitch} height={pitch} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1={0} y1={0} x2={0} y2={pitch} stroke="var(--red-hatch)" strokeWidth={pitch / 6} />
        </pattern>
      </defs>

      {model.tiles.map((tile) => (
        <rect
          key={`${tile.row}-${tile.col}`}
          className={cx(styles.tile, tile.cut && styles.tileCut)}
          x={tile.x}
          y={model.height - tile.y - tile.h}
          width={tile.w}
          height={tile.h}
          fill={tile.cut ? `url(#${hatchId})` : undefined}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      <rect
        className={styles.wall}
        x={0}
        y={0}
        width={model.width}
        height={model.height}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
