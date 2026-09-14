// A fragment of the tiling plan, drawn from the same model the exported drawing uses.
import { useId } from 'react'
import { chainLabels, dimText, type PlanModel } from '@/core/plan/planModel'
import styles from './PlanFragment.module.scss'

export interface PlanFragmentProps {
  model: PlanModel
  /** Spoken description of the plan, since the lines carry the meaning. */
  label: string
  className?: string
}

export function PlanFragment({ model, label, className }: PlanFragmentProps) {
  const hatchId = `${useId()}-hatch`
  const span = Math.max(model.width, model.height)
  const margin = span * 0.06
  const chainDrop = span * 0.14
  const font = span * 0.035
  const strokeThin = span * 0.0016
  const strokeMedium = span * 0.0028
  const strokeHeavy = span * 0.0048
  const viewWidth = model.width + margin * 2
  const viewHeight = model.height + margin + chainDrop + margin * 0.4
  const y = (top: number) => model.height - top
  const chain = model.chains.columns[0]
  const chainY = model.height + chainDrop * 0.62
  const labels = chain ? chainLabels(chain, font * 2.6, font * 0.58) : []

  return (
    <svg
      className={`${styles.plan}${className ? ` ${className}` : ''}`}
      viewBox={`${-margin} ${-margin} ${viewWidth} ${viewHeight}`}
      role="img"
      aria-label={label}
    >
      <defs>
        <pattern
          id={hatchId}
          patternUnits="userSpaceOnUse"
          width={span * 0.02}
          height={span * 0.02}
          patternTransform="rotate(45)"
        >
          <line className={styles.cutLine} x1="0" y1="0" x2="0" y2={span * 0.02} strokeWidth={span * 0.0032} />
        </pattern>
      </defs>

      <g className={styles.whole} fill="none" strokeWidth={strokeThin}>
        {model.tiles
          .filter((tile) => !tile.cut)
          .map((tile) => (
            <rect key={`${tile.x}-${tile.y}`} x={tile.x} y={y(tile.y + tile.h)} width={tile.w} height={tile.h} />
          ))}
      </g>
      <g className={styles.cutLine} fill={`url(#${hatchId})`} strokeWidth={strokeMedium}>
        {model.tiles
          .filter((tile) => tile.cut)
          .map((tile) => (
            <rect key={`${tile.x}-${tile.y}`} x={tile.x} y={y(tile.y + tile.h)} width={tile.w} height={tile.h} />
          ))}
      </g>
      <g className={styles.inkText} fontSize={font} fontWeight="700" textAnchor="middle">
        {model.tiles
          .filter((tile) => tile.cut && Math.min(tile.w, tile.h) > font * 1.6)
          .map((tile) => (
            <text key={`${tile.x}-${tile.y}`} x={tile.x + tile.w / 2} y={y(tile.y + tile.h / 2) + font * 0.36}>
              {tile.mark}
            </text>
          ))}
      </g>

      <rect className={styles.outline} x="0" y="0" width={model.width} height={model.height} strokeWidth={strokeHeavy} />

      {/* The bottom dimension chain: a tick on every joint, the cut widths written under them. */}
      {chain && (
        <g className={styles.chain}>
          <line className={styles.rule} x1={0} y1={chainY} x2={model.width} y2={chainY} strokeWidth={strokeThin} pathLength={1} />
          {[0, ...chain.items.map((item) => item.end)].map((tick) => (
            <g key={tick}>
              <line
                className={styles.guide}
                x1={tick}
                y1={model.height + strokeHeavy}
                x2={tick}
                y2={chainY + chainDrop * 0.12}
                strokeWidth={strokeThin}
                pathLength={1}
              />
              <line
                className={styles.rule}
                x1={tick - font * 0.22}
                y1={chainY + font * 0.22}
                x2={tick + font * 0.22}
                y2={chainY - font * 0.22}
                strokeWidth={strokeMedium}
                pathLength={1}
              />
            </g>
          ))}
          {labels.map((item) => (
            <text
              key={`${item.start}-${item.text}`}
              className={item.cut ? styles.cutText : styles.inkText}
              x={item.center}
              y={chainY - font * 0.4}
              textAnchor="middle"
              fontSize={font}
            >
              {item.text}
            </text>
          ))}
          <text className={styles.guideText} x={model.width} y={chainY + font * 1.5} textAnchor="end" fontSize={font * 0.82}>
            {dimText(model.width)} × {dimText(model.height)} mm
          </text>
        </g>
      )}
    </svg>
  )
}
