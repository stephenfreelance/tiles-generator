import { memo } from 'react'
import type { PlanModel } from '@/core/plan/planModel'
import { cx } from '@/ui/cx'
import { accessoryRows, pieceRows, planTotals } from './planCopy'
import styles from './PlanPieces.module.scss'
import { planLayoutKey } from './wallMapGeometry'

export interface PlanPiecesProps {
  model: PlanModel
  /** The piece chosen on the drawing or pointed at by a warning; its row is tinted to match. */
  selectedPieceId: string | null
}

/**
 * The list of pieces a maker prints, and nothing else: the drawing above already says where to
 * start. Rows are read, not pressed, so a piece is only ever chosen on the drawing itself. The wall's parts
 * that are not tiles (wall clips, keys) follow in a group of their own; the fit test prints from its own page.
 */
function PlanPiecesView({ model, selectedPieceId }: PlanPiecesProps) {
  const rows = pieceRows(model)
  const parts = accessoryRows(model)
  const totals = planTotals(model)

  // The lid above already reads "Your pieces", so the table names itself rather than repeating a heading.
  return (
    <table className={styles.table} aria-label="Your pieces">
      <thead>
        <tr>
          <th scope="col">Piece</th>
          <th scope="col" className={styles.num}>
            Size, mm
          </th>
          <th scope="col" className={styles.num}>
            Count
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.pieceId} data-selected={row.pieceId === selectedPieceId || undefined}>
            <th scope="row">
              <span className={styles.piece}>
                <span className={styles.chip} data-cut={row.cut || undefined}>
                  {row.mark}
                </span>
                <span className={styles.name}>{row.label}</span>
              </span>
            </th>
            <td className={styles.num}>{row.size}</td>
            <td className={cx(styles.num, styles.count)}>{row.count}</td>
          </tr>
        ))}
      </tbody>
      {parts.length > 0 && (
        <tbody>
          <tr className={styles.group}>
            <th scope="rowgroup" colSpan={3}>
              Besides the tiles
            </th>
          </tr>
          {parts.map((row) => (
            <tr key={row.id}>
              <th scope="row">
                <span className={styles.piece}>
                  <span className={styles.chip} data-part="">
                    {row.mark}
                  </span>
                  <span className={styles.name}>{row.label}</span>
                </span>
              </th>
              <td className={styles.num}>{row.size}</td>
              <td className={cx(styles.num, styles.count)}>{row.count}</td>
            </tr>
          ))}
        </tbody>
      )}
      {totals.files > 1 && (
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              All pieces, {totals.files} files
            </th>
            <td className={cx(styles.num, styles.count)}>{totals.total}</td>
          </tr>
        </tfoot>
      )}
    </table>
  )
}

/** The printed parts besides the tiles, as one string: a new fit changes the keys' file, not the map. */
const partsKey = (model: PlanModel) => model.accessories.map((a) => `${a.id}:${a.mark}:${a.count}`).join(',')

/** Like the map, a recolour that leaves the layout alone renders nothing here. */
export const PlanPieces = memo(
  PlanPiecesView,
  (a, b) =>
    a.selectedPieceId === b.selectedPieceId &&
    (a.model === b.model || (planLayoutKey(a.model) === planLayoutKey(b.model) && partsKey(a.model) === partsKey(b.model))),
)
