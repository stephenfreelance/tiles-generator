// The three things worth knowing before the first plate goes down. The rest is in the README.
import styles from './PrintNotes.module.scss'

export function PrintNotes() {
  return (
    <ul className={styles.list}>
      <li>Print face up, flat on the plate. The relief has no overhangs, so nothing needs supports.</li>
      <li>Any PLA in your color, 0.2 mm layers, 3 walls, 15 % infill.</li>
      <li>
        Glue with tile adhesive, or double-sided mounting tape for a wall you can take down. The README says where to
        start and which piece goes down first.
      </li>
    </ul>
  )
}
