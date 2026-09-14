// One ruled row per unique model: its label on the plan, what it is, and its own file.
import { useMemo } from 'react'
import { Download } from 'lucide-react'
import type { DesignConfig, ExportFormat, LayoutPlan, PieceSpec } from '@/core/types'
import { useTextureChips, type ChipItem } from '@/hooks'
import { Button, DimensionText, VisuallyHidden } from '@/ui'
import styles from './ScheduleTable.module.scss'

const CHIP_PX = 128

export interface ScheduleTableProps {
  config: DesignConfig
  plan: LayoutPlan
  format: ExportFormat
  /** The piece whose file is being written right now. */
  busyPieceId: string | null
  disabled: boolean
  highlightPieceId: string | null
  onHighlight: (pieceId: string | null) => void
  onDownloadPiece: (piece: PieceSpec) => void
}

export function ScheduleTable({
  config,
  plan,
  format,
  busyPieceId,
  disabled,
  highlightPieceId,
  onHighlight,
  onDownloadPiece,
}: ScheduleTableProps) {
  const items = useMemo<ChipItem[]>(
    () => plan.pieces.map((piece) => ({ key: piece.id, config, crop: piece.crop })),
    [plan.pieces, config],
  )
  const chips = useTextureChips(config, items, CHIP_PX)

  return (
    <table className={styles.table}>
      <caption className={styles.caption}>
        Every piece in this download, with the relief it carries and how many copies to print.
      </caption>
      <thead>
        <tr>
          <th scope="col">Label</th>
          <th scope="col">
            <VisuallyHidden>Picture</VisuallyHidden>
          </th>
          <th scope="col">Piece</th>
          <th scope="col" className={styles.numeric}>
            Size
          </th>
          <th scope="col" className={styles.numeric}>
            Qty
          </th>
          <th scope="col">
            <VisuallyHidden>Download</VisuallyHidden>
          </th>
        </tr>
      </thead>
      <tbody>
        {plan.pieces.map((piece) => {
          const cut = piece.kind !== 'full'
          return (
            <tr
              key={piece.id}
              data-cut={cut || undefined}
              data-active={highlightPieceId === piece.id || undefined}
              onPointerEnter={() => onHighlight(piece.id)}
              onPointerLeave={() => onHighlight(null)}
              onFocus={() => onHighlight(piece.id)}
              onBlur={() => onHighlight(null)}
            >
              <td className={styles.mark}>
                <span className={styles.cellLabel} aria-hidden="true">
                  Label
                </span>
                <span className={styles.markGlyph}>{piece.mark}</span>
              </td>
              <td className={styles.sample}>
                <span className={styles.sampleFrame}>
                  {chips.get(piece.id) ? (
                    <img src={chips.get(piece.id)} alt="" draggable={false} decoding="async" />
                  ) : (
                    <span className={styles.samplePlaceholder} aria-hidden="true" />
                  )}
                </span>
              </td>
              <td className={styles.piece}>
                <span className={styles.cellLabel} aria-hidden="true">
                  Piece
                </span>
                <span className={styles.pieceLabel}>{piece.label}</span>
              </td>
              <td className={styles.numeric}>
                <span className={styles.cellLabel} aria-hidden="true">
                  Size
                </span>
                <DimensionText size={{ width: piece.width, height: piece.height }} />
              </td>
              <td className={styles.numeric}>
                <span className={styles.cellLabel} aria-hidden="true">
                  Qty
                </span>
                <span className={styles.qty}>{piece.count}</span>
              </td>
              <td className={styles.action}>
                <Button
                  size="sm"
                  loading={busyPieceId === piece.id}
                  loadingLabel={`Writing the file for ${piece.mark}`}
                  disabled={disabled && busyPieceId !== piece.id}
                  aria-label={`Download the ${format.toUpperCase()} file for ${piece.mark}, ${piece.label}`}
                  leadingIcon={<Download />}
                  onClick={() => onDownloadPiece(piece)}
                >
                  Download
                </Button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
