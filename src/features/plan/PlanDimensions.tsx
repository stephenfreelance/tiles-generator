import { Fragment } from 'react'
import { chainLabels, dimText, type DimensionChain, type PlanModel } from '@/core/plan/planModel'
import { cx } from '@/ui/cx'
import { CHAIN_BAND_PX, CHAIN_TOP_PX, OVERALL_GAP_PX, tickStride, type PlanFrame } from './planLayout'
import styles from './PlanView.module.scss'

const TEXT_PX = 10
const TITLE_PX = 8
const TICK_PX = 3.5

/** Boundaries of a chain, thinned so ticks never crowd at 60 tiles across. */
function boundaries(chain: DimensionChain, frame: PlanFrame): number[] {
  const stops = [chain.items[0]?.start ?? 0, ...chain.items.map((item) => item.end)]
  const pitchPx = (chain.total * frame.scale) / Math.max(1, stops.length - 1)
  const stride = tickStride(pitchPx)
  return stops.filter((_, index) => index % stride === 0 || index === stops.length - 1)
}

interface ChainProps {
  chain: DimensionChain
  frame: PlanFrame
  model: PlanModel
  /** Distance from the surface edge to this chain's line, in screen pixels. */
  offsetPx: number
  title?: string
}

/** A chain read along the bottom edge: ticks, extension lines and the piece lengths. */
function ColumnChain({ chain, frame, model, offsetPx, title }: ChainProps) {
  const mm = frame.mmPerPx
  const lineY = model.height + offsetPx * mm
  const labels = chainLabels(chain, 16 * mm, 6.3 * mm)

  return (
    <g>
      <line className={styles.chainLine} x1={0} y1={lineY} x2={chain.total} y2={lineY} vectorEffect="non-scaling-stroke" />
      {boundaries(chain, frame).map((x) => (
        <Fragment key={x}>
          <line
            className={styles.extension}
            x1={x}
            y1={model.height + 2 * mm}
            x2={x}
            y2={lineY - 2 * mm}
            vectorEffect="non-scaling-stroke"
          />
          <line
            className={styles.tick}
            x1={x - TICK_PX * mm}
            y1={lineY + TICK_PX * mm}
            x2={x + TICK_PX * mm}
            y2={lineY - TICK_PX * mm}
            vectorEffect="non-scaling-stroke"
          />
        </Fragment>
      ))}
      {labels.map((label) =>
        label.fits ? (
          <text
            key={`${label.start}-${label.text}`}
            className={cx(styles.dimText, label.cut && styles.dimTextCut)}
            x={label.center}
            y={lineY - 4 * mm}
            fontSize={TEXT_PX * mm}
          >
            {label.text}
          </text>
        ) : label.cut ? (
          // A cut too narrow to write inside keeps its figure, hung below the line on a leader.
          <Fragment key={`${label.start}-${label.text}`}>
            <line
              className={cx(styles.leader, styles.leaderCut)}
              x1={label.center}
              y1={lineY}
              x2={label.center}
              y2={lineY + 5 * mm}
              vectorEffect="non-scaling-stroke"
            />
            <text
              className={cx(styles.dimText, styles.dimTextCut)}
              x={label.center}
              y={lineY + 14 * mm}
              fontSize={TEXT_PX * mm}
            >
              {label.text}
            </text>
          </Fragment>
        ) : null,
      )}
      {title && (
        <text className={styles.chainTitle} x={chain.total + 6 * mm} y={lineY + 3 * mm} fontSize={TITLE_PX * mm}>
          {title}
        </text>
      )}
    </g>
  )
}

/** The same chain read up the left edge, its figures turned to read from the side. */
function RowChain({ chain, frame, model, offsetPx }: ChainProps) {
  const mm = frame.mmPerPx
  const lineX = -offsetPx * mm
  const labels = chainLabels(chain, 16 * mm, 6.3 * mm)
  const flip = (y: number) => model.height - y

  return (
    <g>
      <line className={styles.chainLine} x1={lineX} y1={0} x2={lineX} y2={model.height} vectorEffect="non-scaling-stroke" />
      {boundaries(chain, frame).map((y) => (
        <Fragment key={y}>
          <line
            className={styles.extension}
            x1={lineX + 2 * mm}
            y1={flip(y)}
            x2={-2 * mm}
            y2={flip(y)}
            vectorEffect="non-scaling-stroke"
          />
          <line
            className={styles.tick}
            x1={lineX - TICK_PX * mm}
            y1={flip(y) + TICK_PX * mm}
            x2={lineX + TICK_PX * mm}
            y2={flip(y) - TICK_PX * mm}
            vectorEffect="non-scaling-stroke"
          />
        </Fragment>
      ))}
      {labels.map((label) => {
        const y = flip(label.center)
        const x = lineX - 4 * mm
        if (!label.fits && !label.cut) return null
        return (
          <text
            key={`${label.start}-${label.text}`}
            className={cx(styles.dimText, label.cut && styles.dimTextCut)}
            x={x}
            y={y}
            fontSize={TEXT_PX * mm}
            transform={`rotate(-90 ${x} ${y})`}
          >
            {label.text}
          </text>
        )
      })}
    </g>
  )
}

/** The overall size, set outside every chain with a tick at each end. */
function Overall({ frame, model, axis, offsetPx }: { frame: PlanFrame; model: PlanModel; axis: 'x' | 'y'; offsetPx: number }) {
  const mm = frame.mmPerPx
  const total = axis === 'x' ? model.overall.width : model.overall.height
  const tick = (x: number, y: number) => (
    <line
      className={styles.tick}
      x1={x - TICK_PX * mm}
      y1={y + TICK_PX * mm}
      x2={x + TICK_PX * mm}
      y2={y - TICK_PX * mm}
      vectorEffect="non-scaling-stroke"
    />
  )

  if (axis === 'x') {
    const y = model.height + offsetPx * mm
    return (
      <g>
        <line className={styles.chainLine} x1={0} y1={y} x2={model.width} y2={y} vectorEffect="non-scaling-stroke" />
        {tick(0, y)}
        {tick(model.width, y)}
        <text className={styles.dimTotal} x={model.width / 2} y={y - 4 * mm} fontSize={(TEXT_PX + 1) * mm}>
          {dimText(total)}
        </text>
      </g>
    )
  }

  const x = -offsetPx * mm
  const y = model.height / 2
  return (
    <g>
      <line className={styles.chainLine} x1={x} y1={0} x2={x} y2={model.height} vectorEffect="non-scaling-stroke" />
      {tick(x, 0)}
      {tick(x, model.height)}
      <text
        className={styles.dimTotal}
        x={x - 4 * mm}
        y={y}
        fontSize={(TEXT_PX + 1) * mm}
        transform={`rotate(-90 ${x - 4 * mm} ${y})`}
      >
        {dimText(total)}
      </text>
    </g>
  )
}

export interface PlanDimensionsProps {
  model: PlanModel
  frame: PlanFrame
}

/** Every dimension on the drawing: one chain per bond row along the bottom, one up the side, overalls outside. */
export function PlanDimensions({ model, frame }: PlanDimensionsProps) {
  const chains = model.chains.columns
  return (
    <g>
      {chains.map((chain, index) => (
        <ColumnChain
          key={chain.title}
          chain={chain}
          frame={frame}
          model={model}
          offsetPx={CHAIN_TOP_PX + index * CHAIN_BAND_PX}
          title={chains.length > 1 ? chain.title : undefined}
        />
      ))}
      <RowChain chain={model.chains.rows} frame={frame} model={model} offsetPx={CHAIN_TOP_PX} />
      <Overall
        frame={frame}
        model={model}
        axis="x"
        offsetPx={CHAIN_TOP_PX + Math.max(0, chains.length - 1) * CHAIN_BAND_PX + OVERALL_GAP_PX}
      />
      <Overall frame={frame} model={model} axis="y" offsetPx={CHAIN_TOP_PX + OVERALL_GAP_PX} />
    </g>
  )
}
