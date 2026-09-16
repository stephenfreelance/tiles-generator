// Four printed pieces of the visitor's own wall, laid in their real positions and rendered in the
// color they picked: the relief runs straight across every joint. The panel assembles itself once on
// entry, and re-lays itself one piece at a time on a recolor, working out from the setting-out corner.
import { AnimatePresence, m, stagger, useReducedMotion, type Variants } from 'motion/react'
import { useMemo, useState } from 'react'
import type { DesignConfig, LayoutPlan, PieceSpec } from '@/core/types'
import { useTextureChips, type ChipItem } from '@/hooks'
import { PROOF_CHIP_PX } from './chipBudget'
import { cutHaloOn } from './cutMark'
import styles from './JointProof.module.scss'
import { EASE_OUT } from './LandingMotion'
import { cornerSettingOut, layDelay } from './layOrder'

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

interface ProofCell {
  key: string
  piece: PieceSpec
  /** 1-based grid position: laying order owns the DOM, so the grid placement has to be explicit. */
  column: number
  row: number
  /** Distance from the setting-out corner, 0..1. */
  lay: number
  /** Place in the laying order, 0 for the piece that goes up first. */
  order: number
  offset: CellOffset
  /** Only the fragment's outside corners are rounded, as a `border-radius` shorthand. */
  radius: string
}

interface ProofWall {
  cells: ProofCell[]
  columns: string
  rows: string
  aspect: string
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

/** A rounded joint would break the surface, so only the corners on the outside of the fragment get one. */
function cornerRadii(top: boolean, bottom: boolean, left: boolean, right: boolean): string {
  const radius = (on: boolean) => (on ? 'var(--radius-md)' : '0')
  return `${radius(top && left)} ${radius(top && right)} ${radius(bottom && right)} ${radius(bottom && left)}`
}

/**
 * The fragment as a grid of real millimeters, plus the order and the offsets it is laid with. Column
 * and row tracks follow the millimeters, so the pieces meet exactly as they will on the wall.
 */
function buildWall(plan: LayoutPlan): ProofWall {
  const pieceById = new Map(plan.pieces.map((piece) => [piece.id, piece]))
  const xs = [...new Set(plan.placements.map((placement) => placement.x))].sort((a, b) => a - b)
  // Surface coordinates run y up, so the largest y is the top row.
  const ys = [...new Set(plan.placements.map((placement) => placement.y))].sort((a, b) => b - a)
  const widths = xs.map((x) => pieceById.get(plan.placements.find((p) => p.x === x)?.pieceId ?? '')?.width ?? 1)
  const heights = ys.map((y) => pieceById.get(plan.placements.find((p) => p.y === y)?.pieceId ?? '')?.height ?? 1)
  const model = { width: sum(widths), height: sum(heights) }
  const origin = cornerSettingOut(model)

  const laid = plan.placements.flatMap<Omit<ProofCell, 'order'>>((placement) => {
    const piece = pieceById.get(placement.pieceId)
    if (!piece) return []
    const column = xs.indexOf(placement.x)
    const row = ys.indexOf(placement.y)
    return [
      {
        // Keyed on the grid, never on the wall's millimeters: a new wall size moves the cells rather
        // than remounting them, so the reveal is not replayed and the chips crossfade where they sit.
        key: `${column}-${row}`,
        piece,
        column: column + 1,
        row: row + 1,
        // Fragment-local millimeters: the detail is measured against itself, not against the wall.
        lay: layDelay(
          { x: sum(widths.slice(0, column)), y: sum(heights.slice(row + 1)), w: widths[column], h: heights[row] },
          model,
          origin,
        ),
        // Each piece waits half the joint out from the middle, so the four come together rather than
        // sliding in from one side.
        offset: {
          x: Math.sign(column - (xs.length - 1) / 2) * START_GAP_PX,
          y: Math.sign(row - (ys.length - 1) / 2) * START_GAP_PX,
        },
        radius: cornerRadii(row === 0, row === ys.length - 1, column === 0, column === xs.length - 1),
      },
    ]
  })
  // Ties are broken in reading order rather than shared: the panel lays one piece at a time, and four
  // distinct steps are what fits the 345 ms envelope.
  laid.sort((a, b) => a.lay - b.lay || a.row - b.row || a.column - b.column)

  return {
    cells: laid.map((cell, order) => ({ ...cell, order })),
    columns: widths.map((width) => `${width}fr`).join(' '),
    rows: heights.map((height) => `${height}fr`).join(' '),
    // The samples are positioned inside their cells, so the wall carries the surface proportions itself.
    aspect: `${model.width} / ${model.height}`,
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
  const wall = useMemo(() => buildWall(plan), [plan])
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
      {wall.cells.map(({ key, piece, column, row, order, offset, radius }) => {
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
            custom={offset}
            data-active={piece.id === activePieceId || undefined}
            data-dim={(activePieceId !== null && piece.id !== activePieceId) || undefined}
            // The keyboard path to the same highlight is the legend, which carries every mark in text.
            onPointerEnter={() => onActivePiece?.(piece.id)}
            onPointerLeave={() => onActivePiece?.(null)}
          >
            {/* Motion owns the cell's transform, so the lift and the dim live one element in. */}
            <div className={styles.piece} style={{ borderRadius: radius }}>
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
