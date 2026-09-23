// The few things worth knowing before the first plate goes down. The rest is in the README, and how the
// tiles go up is its own section below.
import { ELEPHANT_FOOT_NOTE, PRINT_SETTINGS } from '@/core/printSettings'
import styles from './PrintNotes.module.scss'

export interface PrintNotesProps {
  /**
   * The plans cut a key slot, a socket or a clip pocket, so the first layer's bulge matters. Not the same
   * question as `parts`: the tabs cut a socket into every tile and print nothing at all beside them.
   */
  fixings?: boolean
  /** This download really holds printed parts, so there is something to say about printing them. */
  parts?: boolean
}

export function PrintNotes({ fixings = false, parts = false }: PrintNotesProps) {
  return (
    <ul className={styles.list}>
      <li>Print face up, flat on the plate. The relief has no overhangs, so nothing needs supports.</li>
      <li>Any PLA in your color, {PRINT_SETTINGS.summary}.</li>
      {parts && <li>Print the parts in the same filament as the tiles: each part&apos;s row says which way up it goes.</li>}
      {fixings && <li>{ELEPHANT_FOOT_NOTE}</li>}
    </ul>
  )
}
