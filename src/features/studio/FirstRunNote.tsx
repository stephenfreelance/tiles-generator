import { useEffect, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { safeLocalStorage } from '@/state/storage'
import { cx } from '@/ui/cx'
import styles from './studio.module.scss'

/** Remembered per viewer, in the app layer: the prefs store is not ours to add a field to. */
const SEEN_KEY = 'tessera.studio.hint.v1'

export interface FirstRunNoteProps {
  /** A real warning outranks a hint, so the note keeps away while the layout has something to say. */
  suppressed: boolean
  /** The maker has changed something or pointed at a piece: the note has done its work. */
  answered: boolean
}

/** One quiet note on a first visit: nothing here is wrong, so it is not written in red. */
export function FirstRunNote({ suppressed, answered }: FirstRunNoteProps) {
  // Read once, on the first render: a note that came back after being answered would be worse than none.
  const [seenBefore] = useState(() => safeLocalStorage.getItem(SEEN_KEY) === '1')

  useEffect(() => {
    if (seenBefore || !answered) return
    safeLocalStorage.setItem(SEEN_KEY, '1')
  }, [seenBefore, answered])

  if (seenBefore || answered || suppressed) return null

  return (
    <ul className={styles.notes} aria-label="Note on this design">
      <li className={cx(styles.note, styles.noteQuiet)}>
        <Lightbulb className={styles.noteLeader} aria-hidden="true" />
        <span className={styles.noteText}>Change anything and the wall redraws as you go.</span>
      </li>
    </ul>
  )
}
