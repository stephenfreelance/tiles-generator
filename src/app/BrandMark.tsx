import { MARK_PIECES, MARK_VIEWBOX } from './mark'
import styles from './AppShell.module.scss'

/** The mark in the app bar, in the tones useAccentTheme writes from the tile color. Decorative: the word beside it names the app. */
export function BrandMark() {
  return (
    <svg className={styles.mark} viewBox={MARK_VIEWBOX} aria-hidden="true" focusable="false">
      {MARK_PIECES.map(({ d, tone }) => (
        <path key={d} d={d} className={tone === 'whole' ? styles.markWhole : styles.markCut} />
      ))}
    </svg>
  )
}
