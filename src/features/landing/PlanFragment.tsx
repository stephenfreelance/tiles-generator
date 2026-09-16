// A fragment of the tiling plan, drawn from the same model the exported drawing uses.
import { useId, useState, type TransitionEvent } from 'react'
import { chainLabels, dimText, type PlanModel, type PlanTile } from '@/core/plan/planModel'
import { cx, type StyleWithVars } from '@/ui/cx'
import { cornerSettingOut, layDelay } from './layOrder'
import styles from './PlanFragment.module.scss'

export interface PlanFragmentProps {
  model: PlanModel
  /** Spoken description of the plan, since the lines carry the meaning. */
  label: string
  className?: string
  /** Phone sizing: font and stroke x1.7, total-size text dropped. */
  compact?: boolean
  /** Draw the mark on whole tiles too, in --ink-3, so the legend and the drawing agree. */
  markWholeTiles?: boolean
  /** The region the corner detail comes from, called out by a ring set clear of those tiles. */
  outlineTiles?: readonly PlanTile[]
  /** Renders the shutter layer and the dash-drawn cut outlines. The parent toggles [data-drawn]. */
  reveal?: boolean
  /** The piece being pointed at: its cells are lit, or the rest is faded when it covers most of the wall. */
  activePieceId?: string | null
}

/** A phone reads this drawing at about half a desktop's width, so everything drawn in it grows. */
const COMPACT_SCALE = 1.7

/** Past this share of the cells, lighting the piece's own tiles is a wash: fade the rest instead. */
const FADE_ABOVE = 0.5

/** The gap the callout ring keeps from the tiles it names, as a share of the span: about 4 px drawn. */
const CALLOUT_GAP = 0.008

/** One closed box in view coordinates (the surface counts y up, the drawing down). */
const boxPath = (x: number, top: number, w: number, h: number) => `M${x} ${top}h${w}v${h}h${-w}z`

/**
 * The ring that says where the corner detail comes from: set out clear of the tiles it names, so it
 * never lands on a grid line and reads as a mark of its own, and never outside the wall it belongs to.
 */
function calloutBox(tiles: readonly PlanTile[], model: PlanModel, pad: number) {
  const left = Math.max(0, Math.min(...tiles.map((tile) => tile.x)) - pad)
  const right = Math.min(model.width, Math.max(...tiles.map((tile) => tile.x + tile.w)) + pad)
  const bottom = Math.max(0, Math.min(...tiles.map((tile) => tile.y)) - pad)
  const top = Math.min(model.height, Math.max(...tiles.map((tile) => tile.y + tile.h)) + pad)
  return { x: left, y: model.height - top, width: right - left, height: top - bottom }
}

export function PlanFragment({
  model,
  label,
  className,
  compact = false,
  markWholeTiles = false,
  outlineTiles,
  reveal = false,
  activePieceId = null,
}: PlanFragmentProps) {
  const hatchId = `${useId()}-hatch`
  // The shutter layer leaves the drawing once its slowest rect has faded: a cleared wave costs nothing.
  const [settled, setSettled] = useState(false)
  const scale = compact ? COMPACT_SCALE : 1
  const span = Math.max(model.width, model.height)
  const margin = span * 0.06
  const chainDrop = span * 0.14
  const font = span * 0.035 * scale
  const strokeThin = span * 0.0016 * scale
  const strokeMedium = span * 0.0028 * scale
  const strokeHeavy = span * 0.0048 * scale
  const viewWidth = model.width + margin * 2
  const viewHeight = model.height + margin + chainDrop + margin * 0.4
  const y = (top: number) => model.height - top
  const chain = model.chains.columns[0]
  const chainY = model.height + chainDrop * 0.62
  const labels = chain ? chainLabels(chain, font * 2.6, font * 0.58) : []
  const fits = (tile: PlanTile) => Math.min(tile.w, tile.h) > font * 1.6

  // Delays are measured from the corner the wall is set out from, so the drawing appears the way it
  // is laid. Each shutter overlaps its tile by a stroke, so no grid line shows through the seams.
  const origin = cornerSettingOut(model)
  const shutters = reveal && !settled ? model.tiles.map((tile) => ({ tile, lay: layDelay(tile, model, origin) })) : []
  const lastLay = shutters.reduce((slowest, item) => Math.max(slowest, item.lay), 0)
  const activeTiles = activePieceId ? model.tiles.filter((tile) => tile.pieceId === activePieceId) : []
  // A piece that is most of the wall is read by what it is NOT: one wash over the rest, drawn as the
  // wall with its cells punched out so the joints fade with them and no two rects seam against each other.
  const fadeRest = activeTiles.length > model.tiles.length * FADE_ABOVE
  const fadePath = fadeRest
    ? [
        boxPath(0, 0, model.width, model.height),
        ...activeTiles.map((tile) => boxPath(tile.x, y(tile.y + tile.h), tile.w, tile.h)),
      ].join('')
    : null
  const callout =
    outlineTiles && outlineTiles.length > 0 ? calloutBox(outlineTiles, model, span * CALLOUT_GAP * scale) : null

  const settle = (event: TransitionEvent<SVGGElement>) => {
    const target = event.target
    if (event.propertyName === 'opacity' && target instanceof Element && target.hasAttribute('data-last')) setSettled(true)
  }

  return (
    <svg
      className={cx(styles.plan, className)}
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
            <rect
              key={`${tile.x}-${tile.y}`}
              data-piece={tile.pieceId}
              x={tile.x}
              y={y(tile.y + tile.h)}
              width={tile.w}
              height={tile.h}
            />
          ))}
      </g>
      <g className={styles.cutLine} fill={`url(#${hatchId})`} strokeWidth={strokeMedium}>
        {model.tiles
          .filter((tile) => tile.cut)
          .map((tile) => (
            <rect
              key={`${tile.x}-${tile.y}`}
              className={reveal ? styles.cutTile : undefined}
              data-piece={tile.pieceId}
              // One unit of dash for the whole perimeter, so every piece draws at its own rate.
              pathLength={reveal ? 1 : undefined}
              x={tile.x}
              y={y(tile.y + tile.h)}
              width={tile.w}
              height={tile.h}
            />
          ))}
      </g>
      {markWholeTiles && (
        <g className={styles.wholeText} fontSize={font} fontWeight="700" textAnchor="middle">
          {model.tiles
            .filter((tile) => !tile.cut && fits(tile))
            .map((tile) => (
              <text key={`${tile.x}-${tile.y}`} x={tile.x + tile.w / 2} y={y(tile.y + tile.h / 2) + font * 0.36}>
                {tile.mark}
              </text>
            ))}
        </g>
      )}
      <g className={styles.inkText} fontSize={font} fontWeight="700" textAnchor="middle">
        {model.tiles
          .filter((tile) => tile.cut && fits(tile))
          .map((tile) => (
            <text key={`${tile.x}-${tile.y}`} x={tile.x + tile.w / 2} y={y(tile.y + tile.h / 2) + font * 0.36}>
              {tile.mark}
            </text>
          ))}
      </g>

      {fadePath && <path className={styles.fade} d={fadePath} fillRule="evenodd" />}

      {callout && <rect className={styles.region} {...callout} />}

      {shutters.length > 0 && (
        <g className={styles.shutters} onTransitionEnd={settle}>
          {shutters.map(({ tile, lay }) => {
            const vars: StyleWithVars = { '--lay': lay }
            return (
              <rect
                key={`${tile.x}-${tile.y}`}
                className={styles.shutter}
                // The slowest shutter says when the wave is over: the layer leaves the paint budget then.
                data-last={lay >= lastLay || undefined}
                style={vars}
                x={tile.x - strokeThin}
                y={y(tile.y + tile.h) - strokeThin}
                width={tile.w + strokeThin * 2}
                height={tile.h + strokeThin * 2}
              />
            )
          })}
        </g>
      )}

      <rect className={styles.outline} x="0" y="0" width={model.width} height={model.height} strokeWidth={strokeHeavy} />

      {activeTiles.length > 0 && !fadeRest && (
        <g className={styles.active}>
          {activeTiles.map((tile) => (
            <rect key={`${tile.x}-${tile.y}`} x={tile.x} y={y(tile.y + tile.h)} width={tile.w} height={tile.h} />
          ))}
        </g>
      )}

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
              // A run of equal tiles is written across its own witness lines, so the text breaks them:
              // the halo is struck first and in the panel's color, the way a drafter leaves the line.
              className={cx(styles.chainText, item.cut ? styles.cutText : styles.inkText)}
              strokeWidth={font * 0.42}
              x={item.center}
              y={chainY - font * 0.4}
              textAnchor="middle"
              fontSize={font}
            >
              {item.text}
            </text>
          ))}
          {/* The panel's caption carries the wall size on a phone, so the drawing drops it there. */}
          {!compact && (
            <text className={styles.guideText} x={model.width} y={chainY + font * 1.5} textAnchor="end" fontSize={font * 0.82}>
              {dimText(model.width)} × {dimText(model.height)} mm
            </text>
          )}
        </g>
      )}
    </svg>
  )
}
