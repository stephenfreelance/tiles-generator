// What the zip holds for the wall the visitor sized, laid out like parts on a bench: one printed chip
// per model at its true size against the others, standing on one line, with the file each one prints
// from written under it, and the two documents closing the row as sheets of paper. The file names are
// the labels, so nothing is said twice. Every chip asks for the same (config, crop, sizePx) as the hero
// wall, so the plate draws cache hits and costs the worker nothing.
import { lazy, Suspense, useMemo, type CSSProperties } from 'react'
import { pieceFileName } from '@/core/export/filenames'
import type { DesignConfig, LayoutPlan } from '@/core/types'
import { formatSize } from '@/core/units'
import { useTextureChips, type ChipItem } from '@/hooks'
import { PROOF_CHIP_PX } from './chipBudget'
import { kitScale, ZIP_DOCUMENTS, type ZipDocument } from './kit'
import styles from './KitStrip.module.scss'

// The roll brings motion's animate() and useTransform() with it, about 7 kB gz of engine that the
// eager landing chunk would otherwise load in front of the hero image for a count far below the fold.
const Odometer = lazy(async () => ({ default: (await import('./Odometer')).Odometer }))

export interface KitStripProps {
  config: DesignConfig
  /** The whole wall's plan: the zip holds a model for every piece it uses. */
  plan: LayoutPlan
  /** Left at PROOF_CHIP_PX, which is what the hero wall asks for, so every chip is a cache hit. */
  sizePx?: number
}

/** A sheet of paper, drawn: the plan's is a small tiling plan, the README's a few lines of text. */
function SheetDrawing({ kind }: { kind: ZipDocument['kind'] }) {
  if (kind === 'plan') {
    return (
      <svg viewBox="0 0 30 40" className={styles.sheetDrawing} aria-hidden="true" focusable="false">
        <rect x="5" y="7" width="20" height="15" className={styles.sheetInk} />
        {[9, 13, 17, 21].map((x) => (
          <line key={x} x1={x} y1="7" x2={x} y2="22" className={styles.sheetInk} />
        ))}
        {[12, 17].map((y) => (
          <line key={y} x1="5" y1={y} x2="25" y2={y} className={styles.sheetInk} />
        ))}
        <rect x="21" y="7" width="4" height="15" className={styles.sheetCut} />
        <line x1="5" y1="26" x2="25" y2="26" className={styles.sheetFaint} />
        <line x1="5" y1="31" x2="18" y2="31" className={styles.sheetFaint} />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 30 40" className={styles.sheetDrawing} aria-hidden="true" focusable="false">
      <line x1="5" y1="8" x2="17" y2="8" className={styles.sheetInk} />
      {[13, 17, 21, 25, 29, 33].map((y, index) => (
        <line key={y} x1="5" y1={y} x2={index % 3 === 2 ? 18 : 25} y2={y} className={styles.sheetFaint} />
      ))}
    </svg>
  )
}

export function KitStrip({ config, plan, sizePx = PROOF_CHIP_PX }: KitStripProps) {
  const items = useMemo<ChipItem[]>(
    () => plan.pieces.map((piece) => ({ key: piece.id, config, crop: piece.crop })),
    [plan.pieces, config],
  )
  const chips = useTextureChips(config, items, sizePx)
  // One scale for the whole family, so a 100 mm cut stands two thirds as tall as a 150 mm tile.
  const scale = useMemo(() => kitScale(plan.pieces), [plan.pieces])

  return (
    <ul className={styles.kit}>
      {plan.pieces.map((piece, index) => {
        const src = chips.get(piece.id)
        // The chip is a square with the piece centered in it, so the image scales by the piece's own
        // long side: that is the fit it was drawn to, whatever size the window around it is.
        const longSide = Math.max(piece.width, piece.height)
        const { width, height } = scale(piece)
        const cut = piece.kind !== 'full' || undefined
        return (
          <li key={piece.id} className={styles.item} style={{ '--i': index } as CSSProperties}>
            <span className={styles.stage}>
              <span className={styles.piece} style={{ width: `${width * 100}%`, height: `${height * 100}%` }}>
                {src ? (
                  <img
                    src={src}
                    alt=""
                    draggable={false}
                    decoding="async"
                    style={{
                      width: `${(longSide / piece.width) * 100}%`,
                      height: `${(longSide / piece.height) * 100}%`,
                    }}
                  />
                ) : (
                  <span className={styles.pending} />
                )}
                <span className={styles.mark} data-cut={cut}>
                  {piece.mark}
                </span>
              </span>
            </span>
            <span className={styles.what}>{piece.label}</span>
            <span className={styles.detail}>
              {formatSize(piece.width, piece.height)}
              <span className={styles.count}>
                ×
                {/* The plain figure until the roll's chunk lands, and for good if it never does. */}
                <Suspense fallback={<span className={styles.still}>{piece.count}</span>}>
                  <Odometer value={piece.count} />
                </Suspense>
              </span>
            </span>
            <span className={styles.file}>{pieceFileName(piece, 'stl')}</span>
          </li>
        )
      })}

      {ZIP_DOCUMENTS.map((doc, index) => (
        <li key={doc.name} className={styles.item} style={{ '--i': plan.pieces.length + index } as CSSProperties}>
          <span className={styles.stage}>
            <span className={styles.sheet}>
              <SheetDrawing kind={doc.kind} />
            </span>
          </span>
          <span className={styles.what}>{doc.what}</span>
          <span className={styles.detail}>{doc.detail}</span>
          <span className={styles.file}>{doc.name}</span>
        </li>
      ))}
    </ul>
  )
}
