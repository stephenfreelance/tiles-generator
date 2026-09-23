// The printed parts that are not tiles, grouped the way they are used: the wall clips, then the keys on the
// download page, the fit test's own parts on its own page (which hands in its group and its caption, since
// the download no longer holds that group). One ruled row per file, drawn rather than rendered: a part has
// no relief to show.
import { Download } from 'lucide-react'
import type { AccessorySpec } from '@/core/fixing/types'
import type { ExportFormat } from '@/core/types'
import { formatLength } from '@/core/units'
import { AccessoryDiagram } from '@/features/fixing/diagrams'
import { Button, VisuallyHidden } from '@/ui'
import styles from './AccessoryTable.module.scss'
import { ACCESSORY_GROUPS } from './zipContents'

export interface AccessoryTableProps {
  accessories: readonly AccessorySpec[]
  format: ExportFormat
  /** The part whose file is being written right now. */
  busyId: string | null
  disabled: boolean
  onDownload: (part: AccessorySpec) => void
  /** The groups to show, in order; a group with no part is left out. The download page's own by default. */
  groups?: readonly { group: AccessorySpec['group']; title: string }[]
  /** What the table is, for a screen reader reading it out of the page's order. */
  caption?: string
}

const WALL_CAPTION = 'The printed parts for putting the tiles up, with the file of each and how many copies to print.'

/** "48 × 14.5 × 2.8", the part as it lies on the plate: length, width, height. */
const sizeFigures = ({ x, y, z }: AccessorySpec['size']): string =>
  [x, y, z].map((mm) => formatLength(mm, 'mm', false)).join(' × ')

export function AccessoryTable({
  accessories,
  format,
  busyId,
  disabled,
  onDownload,
  groups: shown = ACCESSORY_GROUPS,
  caption = WALL_CAPTION,
}: AccessoryTableProps) {
  const groups = shown
    .map((entry) => ({ ...entry, parts: accessories.filter((part) => part.group === entry.group) }))
    .filter((entry) => entry.parts.length > 0)

  return (
    <table className={styles.table}>
      <caption className={styles.caption}>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Label</th>
          <th scope="col">
            <VisuallyHidden>Picture</VisuallyHidden>
          </th>
          <th scope="col">Part</th>
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
      {groups.map((entry) => (
        <tbody key={entry.group} data-group={entry.group}>
          {/* One group needs no name of its own: the heading above the table already gives it. */}
          {groups.length > 1 && (
            <tr className={styles.groupRow}>
              <th scope="rowgroup" colSpan={6} className={styles.groupTitle}>
                {entry.title}
              </th>
            </tr>
          )}
          {entry.parts.map((part, index) => (
            <tr key={part.id}>
              <td className={styles.mark}>
                <span className={styles.cellLabel} aria-hidden="true">
                  Label
                </span>
                <span className={styles.markGlyph}>{part.mark}</span>
              </td>
              <td className={styles.sample}>
                <span className={styles.sampleFrame}>
                  <AccessoryDiagram kind={part.kind} shape={part.shape} className={styles.icon} />
                </span>
              </td>
              <td className={styles.part}>
                <span className={styles.cellLabel} aria-hidden="true">
                  Part
                </span>
                <span className={styles.partText}>
                  <span className={styles.partLabel}>{part.label}</span>
                  {/* The fit test prints four coupons and then three clips, each row carrying the same
                      sentence: said once at the head of a run, and again on a phone, where the table is
                      stacked into separate blocks and a row cannot borrow the one above it. */}
                  {part.printNote && (
                    <span
                      className={styles.printNote}
                      data-repeat={part.printNote === entry.parts[index - 1]?.printNote || undefined}
                    >
                      {part.printNote}
                    </span>
                  )}
                </span>
              </td>
              <td className={styles.numeric}>
                <span className={styles.cellLabel} aria-hidden="true">
                  Size
                </span>
                <span className={styles.size}>
                  <span className={styles.sizeValue}>{sizeFigures(part.size)}</span>
                  <span className={styles.sizeUnit}>mm</span>
                </span>
              </td>
              <td className={styles.numeric}>
                <span className={styles.cellLabel} aria-hidden="true">
                  Qty
                </span>
                <span className={styles.qty}>{part.count}</span>
              </td>
              <td className={styles.action}>
                <Button
                  size="sm"
                  loading={busyId === part.id}
                  loadingLabel={`Writing the file for ${part.mark}`}
                  disabled={disabled && busyId !== part.id}
                  aria-label={`Download the ${format.toUpperCase()} file for ${part.mark}, ${part.label}`}
                  leadingIcon={<Download />}
                  onClick={() => onDownload(part)}
                >
                  Download
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  )
}
