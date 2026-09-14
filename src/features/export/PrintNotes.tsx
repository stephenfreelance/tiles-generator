// The three things worth knowing before the first plate goes down. The rest is in the README.
import styles from './PrintNotes.module.scss'

export function PrintNotes() {
  return (
    <ul className={styles.list}>
      <li>Print face up, flat on the plate. The relief has no overhangs, so nothing needs supports.</li>
      <li>0.2 mm layers, 3 walls, 15 % infill.</li>
      <li>
        Glue with tile adhesive, or double-sided mounting tape for a finish you can take down. Fix the whole tiles
        first, then the cut pieces at the edges.
      </li>
    </ul>
  )
}
