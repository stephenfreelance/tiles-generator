import { memo, useCallback, useId, useMemo, type MouseEvent } from 'react'
import type { PlanModel } from '@/core/plan/planModel'
import { formatNumber } from '@/core/units'
import { VisuallyHidden } from '@/ui'
import { cx } from '@/ui/cx'
import { mapDescription } from './planCopy'
import { useElementSize } from './useElementSize'
import { clipMarkPath, keyMarkPath, layoutWallMap, planLayoutKey, type MapChip, type MapClip, type MapKey, type MapTile } from './wallMapGeometry'
import styles from './WallMap.module.scss'

/** Strokes are centred on a rect's edge, so an inset of half a stroke keeps every joint visible. */
const INSET_PX = 0.5

export interface WallMapProps {
  model: PlanModel
  /** The piece being pointed out: the rest of the wall fades behind it. */
  selectedPieceId: string | null
  onSelect: (pieceId: string) => void
  className?: string
}

/** The rail is a fixed 208 px tall slot on a desktop; on a phone the drawing takes a share of the screen. */
function maxWallHeight(): number {
  if (typeof window === 'undefined' || window.matchMedia?.('(min-width: 1100px)').matches) return 208
  return Math.min(256, Math.max(144, 0.45 * window.innerHeight))
}

/** Clicks anywhere in a layer resolve to the piece under the pointer: one listener, not hundreds. */
function pieceUnder(event: MouseEvent<SVGGElement>): string | null {
  const target = event.target instanceof Element ? event.target.closest('[data-piece]') : null
  return target?.getAttribute('data-piece') ?? null
}

interface TileLayerProps {
  tiles: MapTile[]
  hatchUrl: string
  /** Same layout, same tiles: the layer is skipped on a recolour and on every choice. */
  signature: string
  onPick: (event: MouseEvent<SVGGElement>) => void
}

const tileRect = (t: MapTile) => ({
  x: t.x + INSET_PX,
  y: t.y + INSET_PX,
  width: Math.max(INSET_PX, t.width - 2 * INSET_PX),
  height: Math.max(INSET_PX, t.height - 2 * INSET_PX),
})

const TileLayer = memo(
  function TileLayer({ tiles, hatchUrl, onPick }: TileLayerProps) {
    return (
      <g className={styles.tiles} onClick={onPick}>
        {tiles.map((t, i) => (
          <rect
            key={i}
            data-piece={t.pieceId}
            className={t.cut ? styles.tileCut : styles.tile}
            fill={t.cut ? hatchUrl : undefined}
            {...tileRect(t)}
          />
        ))}
      </g>
    )
  },
  (a, b) => a.signature === b.signature && a.hatchUrl === b.hatchUrl && a.onPick === b.onPick,
)

function Chip({ chip, selected }: { chip: MapChip; selected: boolean }) {
  const { box, mark, size } = chip
  const cy = box.y + box.height / 2
  return (
    <g className={styles.chip} data-piece={chip.pieceId} data-cut={chip.cut || undefined} data-selected={selected || undefined}>
      <rect className={styles.chipRect} x={box.x} y={box.y} width={box.width} height={box.height} rx={box.height / 2} />
      {size ? (
        <>
          <text className={styles.chipMark} x={box.x + 8 + 5 * mark.length} y={cy} textAnchor="middle">
            {mark}
          </text>
          <text className={styles.chipSize} x={box.x + box.width - 8} y={cy} textAnchor="end">
            {size}
          </text>
        </>
      ) : (
        <text className={styles.chipMark} x={box.x + box.width / 2} y={cy} textAnchor="middle">
          {mark}
        </text>
      )}
    </g>
  )
}

/** The fixings over the tiles: clips as small bars on their pockets, keys as small marks. Neither takes a click. */
function Fixings({ clips, clipPx, keys, keyPx }: { clips: MapClip[]; clipPx: number; keys: MapKey[]; keyPx: number }) {
  if (clips.length === 0 && keys.length === 0) return null
  return (
    <g className={styles.fixings}>
      {clips.length > 0 && <path className={styles.clips} d={clips.map((c) => clipMarkPath(c, clipPx)).join('')} />}
      {keys.length > 0 && <path className={styles.keys} d={keys.map((k) => keyMarkPath(k, keyPx)).join('')} />}
    </g>
  )
}

/** The caption's key to the fixings, drawn with the same strokes as the map. */
function FixingsLegend({ clips, keys }: { clips: boolean; keys: boolean }) {
  if (!clips && !keys) return null
  return (
    <span className={styles.legend}>
      {/* On clips the start marker reads SO, as on the setting-out plan, so the caption says what it is. */}
      {clips && (
        <span className={styles.legendItem}>
          <svg className={styles.legendMark} viewBox="0 0 18 10" aria-hidden="true" focusable="false">
            <circle className={styles.dot} cx={9} cy={5} r={3.5} />
          </svg>
          SO, the setting-out point
        </span>
      )}
      {clips && (
        <span className={styles.legendItem}>
          <svg className={styles.legendMark} viewBox="0 0 18 10" aria-hidden="true" focusable="false">
            <path className={styles.clips} d={clipMarkPath({ x: 9, y: 5, upright: false }, 14)} />
          </svg>
          Wall clips
        </span>
      )}
      {keys && (
        <span className={styles.legendItem}>
          <svg className={styles.legendMark} viewBox="0 0 18 10" aria-hidden="true" focusable="false">
            <path className={styles.keys} d={keyMarkPath({ x: 9, y: 5, upright: false }, 12)} />
          </svg>
          Key
        </span>
      )}
    </span>
  )
}

/**
 * The wall drawn to the rail's width: whole tiles in the tile color's tint, cuts hatched, a letter for
 * every piece and the point to start from. Choosing a piece fades the rest of the wall.
 */
function WallMapView({ model, selectedPieceId, onSelect, className }: WallMapProps) {
  const [boxRef, size] = useElementSize<HTMLDivElement>()
  const width = Math.round(size.width)
  const uid = useId()
  const hatchId = `wall-hatch${uid}`
  const descId = `wall-desc${uid}`
  const signature = planLayoutKey(model)

  // The rail only changes width when the breakpoint is crossed, so the height rule is read with it.
  const geometry = useMemo(() => layoutWallMap(model, { width, maxWallHeight: maxWallHeight() }), [model, width])

  const pick = useCallback(
    (event: MouseEvent<SVGGElement>) => {
      const pieceId = pieceUnder(event)
      if (pieceId) onSelect(pieceId)
    },
    [onSelect],
  )

  const chosen = selectedPieceId && geometry ? geometry.tiles.filter((t) => t.pieceId === selectedPieceId) : []
  const start = geometry?.start

  return (
    <div className={cx(styles.map, className)}>
      <div ref={boxRef} className={styles.box} data-measured={width > 0 || undefined}>
        {geometry && start && (
          <svg
            className={styles.svg}
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            role="img"
            aria-label="Drawing of the wall"
            aria-describedby={descId}
            data-selected={chosen.length > 0 || undefined}
          >
            <defs>
              <pattern id={hatchId} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                <rect className={styles.hatchGround} width={6} height={6} />
                <line className={styles.hatchLine} x1={3} y1={0} x2={3} y2={6} />
              </pattern>
            </defs>

            <TileLayer tiles={geometry.tiles} hatchUrl={`url(#${hatchId})`} signature={`${signature}@${geometry.width}x${geometry.height}`} onPick={pick} />

            <rect className={styles.wall} {...geometry.wall} />

            {chosen.length > 0 && (
              <g className={styles.overlay}>
                {chosen.map((t, i) => (
                  <rect
                    key={i}
                    className={t.cut ? styles.overlayCut : styles.overlayTile}
                    fill={t.cut ? `url(#${hatchId})` : undefined}
                    {...tileRect(t)}
                  />
                ))}
              </g>
            )}

            <Fixings clips={geometry.clips} clipPx={geometry.clipPx} keys={geometry.keys} keyPx={geometry.keyPx} />

            {start.lines.map((l, i) => (
              <line key={i} className={styles.level} {...l} />
            ))}
            {start.guides.map((g, i) => (
              <line key={`guide-${i}`} className={styles.guide} {...g} />
            ))}
            {start.dimension && <path className={styles.dimension} d={start.dimension.path} />}
            {start.pillLeader && <line className={styles.pillLeader} {...start.pillLeader} />}

            {geometry.chips.map(
              (c) =>
                c.leader && (
                  <line
                    key={`leader-${c.pieceId}`}
                    className={cx(c.cut ? styles.leaderCut : styles.leader, c.pieceId === selectedPieceId && styles.leaderSelected)}
                    {...c.leader}
                  />
                ),
            )}

            <g className={styles.chips} onClick={pick}>
              {geometry.chips.map((c, i) => (
                <Chip key={`${c.pieceId}-${i}`} chip={c} selected={c.pieceId === selectedPieceId} />
              ))}
            </g>

            {start.labels.map((l) => (
              <text key={l.text} className={l.strong ? styles.labelStrong : styles.label} x={l.x} y={l.y} textAnchor={l.anchor}>
                {l.text}
              </text>
            ))}
            {start.pill && (
              <g>
                <rect className={styles.pill} {...start.pill} rx={start.pill.height / 2} />
                <text
                  className={styles.pillText}
                  x={start.pill.x + start.pill.width / 2}
                  y={start.pill.y + start.pill.height / 2}
                  textAnchor="middle"
                >
                  {start.word}
                </text>
              </g>
            )}
            <circle className={styles.dotRing} cx={start.dot.x} cy={start.dot.y} r={7.5} />
            <circle className={styles.dot} cx={start.dot.x} cy={start.dot.y} r={5} />
          </svg>
        )}
      </div>
      <div className={styles.caption}>
        <span className={styles.captionSize}>
          {formatNumber(model.width)} × {formatNumber(model.height)} mm wall, sizes in mm
        </span>
        {geometry?.widened && <span className={styles.captionNote}>Thin strips drawn wider so you can see them</span>}
        <FixingsLegend clips={model.clips.length > 0} keys={model.keys.length > 0} />
      </div>
      <VisuallyHidden id={descId}>{mapDescription(model)}</VisuallyHidden>
    </div>
  )
}

/** A recolour hands over a new model with the same layout: nothing on the map changes, so nothing renders. */
export const WallMap = memo(
  WallMapView,
  (a, b) =>
    a.selectedPieceId === b.selectedPieceId &&
    a.onSelect === b.onSelect &&
    a.className === b.className &&
    (a.model === b.model || planLayoutKey(a.model) === planLayoutKey(b.model)),
)
