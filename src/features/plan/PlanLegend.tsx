import type { PlanModel } from '@/core/plan/planModel'
import { formatSize } from '@/core/units'
import styles from './PlanView.module.scss'

export interface PlanLegendProps {
  model: PlanModel
  highlightPieceId: string | null
  onHighlight: (pieceId: string | null) => void
}

/** The schedule under the drawing: one row per mark, and the installer's notes. */
export function PlanLegend({ model, highlightPieceId, onHighlight }: PlanLegendProps) {
  return (
    <div className={styles.legend}>
      <div className={styles.legendHead} aria-hidden="true">
        <span>Mark</span>
        <span>Piece</span>
        <span className={styles.numeric}>Size</span>
        <span className={styles.numeric}>Qty</span>
      </div>
      <ul className={styles.legendList}>
        {model.legend.map((row) => {
          const cut = row.kind !== 'full'
          const size = formatSize(row.width, row.height)
          return (
            <li key={row.pieceId}>
              <button
                type="button"
                className={styles.legendRow}
                data-cut={cut || undefined}
                data-active={highlightPieceId === row.pieceId || undefined}
                aria-label={`${cut ? 'Cut' : 'Full tile'} ${row.mark}, ${row.label}, ${size}, ${row.count} to print`}
                onPointerEnter={() => onHighlight(row.pieceId)}
                onPointerLeave={() => onHighlight(null)}
                onFocus={() => onHighlight(row.pieceId)}
                onBlur={() => onHighlight(null)}
              >
                <span className={styles.legendMark} aria-hidden="true">
                  {row.mark}
                </span>
                <span className={styles.legendLabel} aria-hidden="true">
                  {row.label}
                </span>
                <span className={styles.numeric} aria-hidden="true">
                  {size}
                </span>
                <span className={styles.numeric} aria-hidden="true">
                  ×{row.count}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <ol className={styles.notes}>
        <li className={styles.note}>
          <span className={styles.noteNumber} aria-hidden="true">
            1
          </span>
          <span>Dimensions in millimetres. Cut pieces are hatched red and carry their mark.</span>
        </li>
        {model.settingOut.notes.map((note, index) => (
          <li key={note} className={styles.note}>
            <span className={styles.noteNumber} aria-hidden="true">
              {index + 2}
            </span>
            <span>{note}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
