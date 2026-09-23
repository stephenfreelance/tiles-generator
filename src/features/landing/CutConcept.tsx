// Section 01's three drawings: how Tessera tiles any wall, told as the idea rather than as the
// visitor's own wall (the hero already is that). Drawn in the plan's own language, ink outlines for
// whole tiles and the --cut red for a cut, and carrying no figures: every number on this page is the
// visitor's wall, and a drawn "x24" here would contradict the hero. The words beside each drawing
// carry the meaning, so every one of them is aria-hidden.
import { useId, type CSSProperties, type ReactNode } from 'react'
import styles from './CutConcept.module.scss'

const svgProps = { 'aria-hidden': true, focusable: false } as const

/** A hatch in the cut red, the plan's sign for a cut piece. One id per drawing: a page holds several. */
function CutHatch({ id }: { id: string }) {
  return (
    <pattern id={id} width="3.5" height="3.5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
      <line x1="0" y1="0" x2="0" y2="3.5" className={styles.hatchLine} />
    </pattern>
  )
}

/**
 * Step 1: the wall's outline, whole tiles laid from the top-left corner as far as they go, and the strip
 * left at the right and at the bottom drawn dashed, still empty.
 */
export function WholeTilesDrawing() {
  const tile = { w: 24, h: 21 }
  const wall = { x: 4, y: 4, w: 112, h: 76 }
  const columns = 4
  const rows = 3
  const right = wall.x + columns * tile.w
  const bottom = wall.y + rows * tile.h
  const cells: { x: number; y: number }[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) cells.push({ x: wall.x + column * tile.w, y: wall.y + row * tile.h })
  }
  return (
    <svg viewBox="0 0 120 84" className={styles.drawing} {...svgProps}>
      {cells.map((cell) => (
        <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width={tile.w} height={tile.h} className={styles.whole} />
      ))}
      {/* What is left: one strip down the right, one along the bottom, and the corner where they meet. */}
      <path
        d={`M${right} ${wall.y} H${wall.x + wall.w} V${wall.y + wall.h} H${wall.x} V${bottom} H${right} Z`}
        className={styles.leftover}
      />
      {Array.from({ length: rows }, (_, row) => (
        <rect key={`r${row}`} x={right} y={wall.y + row * tile.h} width={wall.x + wall.w - right} height={tile.h} className={styles.empty} />
      ))}
      {Array.from({ length: columns }, (_, column) => (
        <rect key={`b${column}`} x={wall.x + column * tile.w} y={bottom} width={tile.w} height={wall.y + wall.h - bottom} className={styles.empty} />
      ))}
      <rect x={right} y={bottom} width={wall.x + wall.w - right} height={wall.y + wall.h - bottom} className={styles.empty} />
      <rect x={wall.x} y={wall.y} width={wall.w} height={wall.h} className={styles.wall} />
    </svg>
  )
}

/** One wave of the drawn relief is exactly one tile wide, so it meets itself at every joint. */
const WAVE = { period: 36, amp: 2.4 } as const

/** A wavy line of relief from x0 to x1 at height y, its phase counted from the pattern's origin at x = 10. */
function wavePath(x0: number, x1: number, y: number): string {
  const points: string[] = []
  for (let x = x0; x <= x1 + 0.001; x += 1.5) {
    const at = Math.min(x, x1)
    const dy = WAVE.amp * Math.sin((2 * Math.PI * (at - 10)) / WAVE.period)
    points.push(`${Math.round(at * 100) / 100} ${Math.round((y + dy) * 100) / 100}`)
  }
  return `M${points.join(' L')}`
}

/** The relief inside a tile or a slice of one: three lines of waves across it. */
function Relief({ x0, x1, y, h }: { x0: number; x1: number; y: number; h: number }) {
  return (
    <g className={styles.relief}>
      {[0.25, 0.5, 0.75].map((at) => (
        <path key={at} d={wavePath(x0, x1, y + at * h)} />
      ))}
    </g>
  )
}

/**
 * Step 2: the end of a row at the wall's edge, where a whole tile will not fit. A whole tile above
 * it is cut along a dashed line, the slice that fits drops into the gap, and the waves on it carry
 * straight on from the tile beside it, because the slice is the same part of the same pattern.
 */
export function EdgeCutDrawing() {
  const hatch = useId()
  const tileW = WAVE.period
  const row = { y: 48, h: 32 }
  const source = { y: 4, h: 32 }
  const edge = 100
  const slot = { x: edge - tileW / 2, w: tileW / 2 }
  const wholes = [slot.x - 2 * tileW, slot.x - tileW]
  return (
    <svg viewBox="0 0 120 84" className={styles.drawing} {...svgProps}>
      <defs>
        <CutHatch id={hatch} />
      </defs>
      {/* The row: two whole tiles, then the slice at the edge, the relief running through all three. */}
      {wholes.map((x) => (
        <rect key={x} x={x} y={row.y} width={tileW} height={row.h} className={styles.whole} />
      ))}
      <rect x={slot.x} y={row.y} width={slot.w} height={row.h} fill={`url(#${hatch})`} />
      <Relief x0={wholes[0]} x1={edge} y={row.y} h={row.h} />
      <rect x={slot.x} y={row.y} width={slot.w} height={row.h} className={styles.cut} />
      <line x1={edge} y1={row.y - 6} x2={edge} y2={row.y + row.h + 4} className={styles.edge} />

      {/* The whole tile the slice is cut from: the kept part solid, the rest let go, the cut dashed. */}
      <rect x={slot.x} y={source.y} width={tileW} height={source.h} className={styles.whole} />
      <Relief x0={slot.x} x1={slot.x + tileW} y={source.y} h={source.h} />
      <rect x={edge} y={source.y} width={slot.x + tileW - edge} height={source.h} className={styles.offcut} />
      <line x1={edge} y1={source.y - 3} x2={edge} y2={source.y + source.h + 3} className={styles.cutLine} />

      <g className={styles.arrow}>
        <line x1={slot.x + slot.w / 2} y1={source.y + source.h + 2} x2={slot.x + slot.w / 2} y2={row.y - 2.5} />
        <path d={`M${slot.x + slot.w / 2 - 2.4} ${row.y - 5.5} L${slot.x + slot.w / 2} ${row.y - 2.5} L${slot.x + slot.w / 2 + 2.4} ${row.y - 5.5}`} />
      </g>
    </svg>
  )
}

/** The kinds of piece a corner wall prints, in the plan's letters, with how deep each pile is. */
const KINDS = [
  { mark: 'A', w: 27, h: 27, layers: 4, cut: false },
  { mark: 'B', w: 27, h: 18, layers: 3, cut: true },
  { mark: 'C', w: 18, h: 27, layers: 3, cut: true },
  { mark: 'D', w: 18, h: 18, layers: 1, cut: true },
] as const

/** How far each copy under the top one shows, up and to the right. */
const LAYER_STEP = 2
const KINDS_GAP = 5
const BASELINE = 58
/** One file under each pile: a sheet with a folded corner. */
const FILE = { w: 10, h: 13, fold: 3.5, top: 66 } as const

/** The piles side by side, centred in the drawing: each one's left edge, from the widths before it. */
const PILES = KINDS.map((kind, index) => {
  const widthOf = (pile: (typeof KINDS)[number]) => pile.w + (pile.layers - 1) * LAYER_STEP
  const total = KINDS.reduce((sum, pile) => sum + widthOf(pile), 0) + KINDS_GAP * (KINDS.length - 1)
  const before = KINDS.slice(0, index).reduce((sum, pile) => sum + widthOf(pile) + KINDS_GAP, 0)
  return { ...kind, x: (120 - total) / 2 + before }
})

/**
 * Step 3: every kind of piece as one pile, lettered as the plan letters them. Identical pieces are one
 * model printed several times, so each pile is one file, and the deeper piles are the pieces a wall
 * needs most of. The depths are a picture of that, not a count.
 */
export function KindsDrawing() {
  const hatch = useId()
  return (
    <svg viewBox="0 0 120 84" className={styles.drawing} {...svgProps}>
      <defs>
        <CutHatch id={hatch} />
      </defs>
      <line x1="2" y1={BASELINE + 0.5} x2="118" y2={BASELINE + 0.5} className={styles.bench} />
      {PILES.map((pile) => {
        const fileX = pile.x + pile.w / 2 - FILE.w / 2
        const file = `M${fileX} ${FILE.top} H${fileX + FILE.w - FILE.fold} L${fileX + FILE.w} ${FILE.top + FILE.fold} V${FILE.top + FILE.h} H${fileX} Z`
        // Drawn back to front, so each copy covers the one behind it.
        const layers = Array.from({ length: pile.layers }, (_, layer) => pile.layers - 1 - layer)
        return (
          <g key={pile.mark}>
            {layers.map((depth) => {
              const lx = pile.x + depth * LAYER_STEP
              const ly = BASELINE - pile.h - depth * LAYER_STEP
              const front = depth === 0
              return (
                <g key={depth}>
                  <rect x={lx} y={ly} width={pile.w} height={pile.h} className={styles.sheet} />
                  {front && pile.cut && <rect x={lx} y={ly} width={pile.w} height={pile.h} fill={`url(#${hatch})`} />}
                  <rect x={lx} y={ly} width={pile.w} height={pile.h} className={front && pile.cut ? styles.cut : styles.whole} />
                </g>
              )
            })}
            <text x={pile.x + pile.w / 2} y={BASELINE - pile.h / 2} className={styles.mark}>
              {pile.mark}
            </text>
            <path d={file} className={styles.file} />
            <path
              d={`M${fileX + FILE.w - FILE.fold} ${FILE.top} V${FILE.top + FILE.fold} H${fileX + FILE.w}`}
              className={styles.file}
            />
          </g>
        )
      })}
    </svg>
  )
}

interface Step {
  title: string
  text: string
  drawing: ReactNode
}

/** The hero's own sentence, taken apart: the whole tiles, the cut pieces at the edges, one file per kind. */
const STEPS: readonly Step[] = [
  {
    title: 'Whole tiles first',
    text: 'Whole tiles are placed first on the plan, from the corner you set out from, as far as they will fit.',
    drawing: <WholeTilesDrawing />,
  },
  {
    title: 'Edges cut from a whole tile',
    text: 'The strip that is left is cut out of whole tiles, so each edge piece keeps exactly the slice of pattern it replaces.',
    drawing: <EdgeCutDrawing />,
  },
  {
    title: 'One file per kind',
    text: 'Identical pieces share one model, and each file is named with how many copies to print.',
    drawing: <KindsDrawing />,
  },
]

/**
 * How Tessera tiles any wall, in three steps, each a drawing over a title and one sentence. An ordered
 * list, because the steps are an order: the cuts only exist once the whole tiles have run out.
 */
export function CutSteps() {
  return (
    <ol className={styles.steps}>
      {STEPS.map((step, index) => (
        <li key={step.title} className={styles.step} style={{ '--i': index } as CSSProperties}>
          <div className={styles.figure}>{step.drawing}</div>
          <h3 className={styles.title}>
            <span className={styles.number} aria-hidden="true">
              {index + 1}
            </span>
            {step.title}
          </h3>
          <p className={styles.text}>{step.text}</p>
        </li>
      ))}
    </ol>
  )
}
