// "On your tiles": the back of one piece as it will print, drawn live from the design. The pockets come
// from pieceFeatures, the very rings the mesher cuts, so the drawing cannot show a pocket the file does
// not have; the detail circle beside it magnifies one of them with its printed part seated, from
// seatedParts, since at true scale an 8 mm notch on a 150 mm tile is a few pixels.
//
// Seen from the back, so mirrored in x, the way the 3D view turns the tile over. No words inside: the
// caption beside it says what it shows (counts, depth, "seen from the back").
import { useId, useMemo } from 'react'
import { pieceFeatures } from '@/core/fixing/features'
import { CLIP_CLEARANCE, clipPlan, COUNTERSINK, DRILL_HOLE } from '@/core/fixing/mechanism'
import { seatedParts } from '@/core/fixing/seated'
import type { DesignConfig, PieceSpec } from '@/core/types'
import { cx } from '@/ui/cx'
import styles from './diagrams.module.scss'
import { tileBackLayout } from './tileBackGeometry'

export interface TileBackFigureProps {
  config: DesignConfig
  /** The piece to draw: its crop, size and edges decide its pockets, as they do for the mesher. */
  piece: Pick<PieceSpec, 'crop' | 'width' | 'height' | 'edges'>
  className?: string
  /** A name for the figure: it is then an image with that name. Without one it is hidden, the caption beside it carrying the meaning. */
  'aria-label'?: string
}

/** Lines that are not a class of their own: the rings and the leader, one ink weight at any size. */
const lineProps = { fill: 'none', stroke: 'currentColor', vectorEffect: 'non-scaling-stroke' } as const

/**
 * One piece's back at scale, its pockets filled in the part colour (the accent) with an ink outline, and
 * a detail circle to its right magnifying one pocket, a clip pocket when there is one, else a key notch,
 * with its part in place: the clip in its pocket, or the key across the joint into the neighbour's notch,
 * the neighbour drawn hidden. Its viewBox is about 220 x 120 units with a pocket, the piece alone without.
 */
export function TileBackFigure({ config, piece, className, 'aria-label': label }: TileBackFigureProps) {
  const clipId = useId()
  const layout = useMemo(
    () =>
      tileBackLayout({
        width: piece.width,
        height: piece.height,
        joint: config.joint,
        features: pieceFeatures(config, piece),
        seated: seatedParts(config, piece),
        // The clip exactly as it prints at the design's fit, barbs at their widest.
        clip: { outline: clipPlan(CLIP_CLEARANCE[config.fit]), hole: DRILL_HOLE / 2, sink: COUNTERSINK / 2 },
      }),
    [config, piece],
  )
  const { detail } = layout
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true, focusable: false }
  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className={cx(styles.diagram, className)} {...a11y}>
      <path d={layout.back} className={styles.tile} />
      {layout.features.map((feature, index) => (
        <path key={index} d={feature.path} className={styles.part} />
      ))}
      {detail && (
        <g>
          <circle cx={detail.focus.cx} cy={detail.focus.cy} r={detail.focus.r} {...lineProps} strokeWidth="1" />
          {detail.leader && (
            <line x1={detail.leader.x1} y1={detail.leader.y1} x2={detail.leader.x2} y2={detail.leader.y2} {...lineProps} strokeWidth="1" />
          )}
          <defs>
            <clipPath id={clipId}>
              <circle cx={detail.cx} cy={detail.cy} r={detail.r} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {detail.neighbour && (
              <g>
                <path d={detail.neighbour.area} fill="currentColor" fillOpacity={0.04} stroke="none" />
                <path d={detail.neighbour.edge} className={styles.hidden} />
                <path d={detail.neighbour.notch} className={styles.hidden} />
              </g>
            )}
            <path d={detail.back} className={styles.tile} />
            <path d={detail.pocket} className={styles.pocket} />
            {detail.hidden && <path d={detail.hidden} className={styles.hidden} />}
            <path d={detail.part} fillRule="evenodd" className={styles.part} />
            {detail.sink && <circle cx={detail.sink.cx} cy={detail.sink.cy} r={detail.sink.r} {...lineProps} strokeWidth="0.8" />}
          </g>
          <circle cx={detail.cx} cy={detail.cy} r={detail.r} {...lineProps} strokeWidth="1.2" />
        </g>
      )}
    </svg>
  )
}
