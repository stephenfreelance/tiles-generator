// Four printed pieces of the visitor's own wall, laid in their real positions and rendered in the
// color they picked: the relief runs straight across every joint. The panel assembles itself once on
// entry, and re-lays itself one piece at a time on a recolor, working out from the setting-out corner.
import { AnimatePresence, m, stagger, useReducedMotion, type Variants } from 'motion/react'
import { useMemo, useState } from 'react'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { useTextureChips, type ChipItem } from '@/hooks'
import { PROOF_CHIP_PX } from './chipBudget'
import { cutHaloOn } from './cutMark'
import styles from './JointProof.module.scss'
import { EASE_OUT } from './LandingMotion'
import { buildWallGrid, type WallCell } from './wallGrid'

/** Half the opening the pieces rest in before they are laid: 5 px each way is a 10 px joint. */
const START_GAP_PX = 5
/** The assembly: one piece every 45 ms, each taking 340 ms, so the last lands inside the envelope. */
const ASSEMBLE_STEP_S = 0.045
const ASSEMBLE_S = 0.34
/** A recolor is laid the same way: 55 ms apart, 180 ms each, 345 ms for the four of them. */
const RELAY_STEP_S = 0.055
const RELAY_S = 0.18

/** amount <= 0.4 so a short panel still triggers; once, because an entrance is not a loop. */
const VIEWPORT = { once: true, amount: 0.35 } as const

interface CellOffset {
  x: number
  y: number
}

/** The stagger follows DOM order, which is why the cells are rendered in the order they are laid. */
const WALL_VARIANTS: Variants = {
  hidden: {},
  shown: { transition: { delayChildren: stagger(ASSEMBLE_STEP_S) } },
}

/** No `delay` here: the orchestrated stagger arrives as one, and an explicit delay would replace it. */
const CELL_VARIANTS: Variants = {
  hidden: ({ x, y }: CellOffset) => ({ opacity: 0, x, y }),
  shown: { opacity: 1, x: 0, y: 0, transition: { duration: ASSEMBLE_S, ease: EASE_OUT } },
}

/** A rounded joint would break the surface, so only the corners on the outside of the fragment get one. */
function cornerRadii(edge: WallCell['edge']): string {
  const radius = (on: boolean) => (on ? 'var(--radius-md)' : '0')
  return `${radius(edge.top && edge.left)} ${radius(edge.top && edge.right)} ${radius(edge.bottom && edge.right)} ${radius(edge.bottom && edge.left)}`
}

/**
 * Each piece waits half the joint out from the middle, so the four come together rather than sliding
 * in from one side. Grid positions are 1-based, hence the step back to a 0-based index.
 */
function startOffset(cell: WallCell, columns: number, rows: number): CellOffset {
  return {
    x: Math.sign(cell.column - 1 - (columns - 1) / 2) * START_GAP_PX,
    y: Math.sign(cell.row - 1 - (rows - 1) / 2) * START_GAP_PX,
  }
}

export interface JointProofProps {
  config: DesignConfig
  /** The fragment to lay: the page passes cornerDetail(plan). */
  plan: LayoutPlan
  label: string
  /** Chip size in px. The kit asks for the same one, so the four shades are one set, not two. */
  sizePx?: number
  /** The piece the legend, the plan and this panel are all highlighting. */
  activePieceId?: string | null
  onActivePiece?: (id: string | null) => void
}

export function JointProof({
  config,
  plan,
  label,
  sizePx = PROOF_CHIP_PX,
  activePieceId = null,
  onActivePiece,
}: JointProofProps) {
  const items = useMemo<ChipItem[]>(
    () => plan.pieces.map((piece) => ({ key: piece.id, config, crop: piece.crop })),
    [plan.pieces, config],
  )
  const chips = useTextureChips(config, items, sizePx)
  const wall = useMemo(() => buildWallGrid(plan), [plan])
  // MotionConfig only makes positional keys instant, so the opacity in both animations is branched here.
  const reduced = useReducedMotion()
  // The reveal runs once and never again: a cell mounted after it (a wall with fewer columns, then
  // one with more) would inherit `hidden` permanently, so past the reveal a fresh cell mounts shown.
  const [assembled, setAssembled] = useState(false)

  return (
    <m.div
      className={styles.wall}
      role="img"
      aria-label={label}
      // Both reds are mid-value: on a tile of similar value the mark needs a ring of whichever of ink
      // or panel cutHaloOn() measured as the readable one on this color.
      data-halo={cutHaloOn(config.color)}
      style={{ gridTemplateColumns: wall.columns, gridTemplateRows: wall.rows, aspectRatio: wall.aspect }}
      variants={WALL_VARIANTS}
      initial={reduced ? 'shown' : 'hidden'}
      whileInView="shown"
      viewport={VIEWPORT}
      onViewportEnter={() => setAssembled(true)}
    >
      {wall.cells.map((cell) => {
        const { key, piece, column, row, order } = cell
        const src = chips.get(piece.id)
        // Chips are square with the piece centered in them, so scale by the long side to butt them exactly.
        const longSide = Math.max(piece.width, piece.height)
        return (
          <m.div
            key={key}
            className={styles.cell}
            style={{ gridColumn: column, gridRow: row }}
            variants={CELL_VARIANTS}
            // Undefined inherits the wall's own initial, which is the hidden the stagger lays from.
            initial={assembled ? 'shown' : undefined}
            custom={startOffset(cell, wall.columnCount, wall.rowCount)}
            data-active={piece.id === activePieceId || undefined}
            data-dim={(activePieceId !== null && piece.id !== activePieceId) || undefined}
            // The keyboard path to the same highlight is the legend, which carries every mark in text.
            onPointerEnter={() => onActivePiece?.(piece.id)}
            onPointerLeave={() => onActivePiece?.(null)}
          >
            {/* Motion owns the cell's transform, so the lift and the dim live one element in. */}
            <div className={styles.piece} style={{ borderRadius: cornerRadii(cell.edge) }}>
              {/* initial={false}: the chips that are already cached arrive without a fade; the ones
                  that follow a recolor are laid in turn, keyed on the URL so both are decoded. */}
              <AnimatePresence initial={false}>
                {src && (
                  <m.img
                    key={src}
                    src={src}
                    alt=""
                    draggable={false}
                    decoding="async"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: reduced ? 0 : RELAY_S,
                      delay: reduced ? 0 : order * RELAY_STEP_S,
                      ease: EASE_OUT,
                    }}
                    style={{
                      width: `${(longSide / piece.width) * 100}%`,
                      height: `${(longSide / piece.height) * 100}%`,
                    }}
                  />
                )}
              </AnimatePresence>
              {piece.kind !== 'full' && (
                <span className={styles.mark} aria-hidden="true">
                  {piece.mark}
                </span>
              )}
            </div>
          </m.div>
        )
      })}
    </m.div>
  )
}
