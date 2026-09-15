import styles from './AppShell.module.scss'
import { useAccentTheme } from './useAccentTheme'

/** The five choices are named before their values arrive, so the shape of the screen is already there. */
const FIELDS = ['Your wall', 'Tile size', 'Thickness', 'Texture', 'Color']

/**
 * The workbench before anything is on it: the bar, an empty stage and the steps named but unfilled.
 * It holds back for 200 ms so a fast route never shows it at all.
 */
export function SheetFallback() {
  // The bar shows while the screen's chunk (and on most routes three.js) downloads, so its mark wears the
  // design's accent from the first paint rather than the stylesheet's default until AppShell arrives.
  useAccentTheme()
  return (
    <div className={styles.app}>
      <header className={styles.bar}>
        <span className={styles.brand}>
          <span className={styles.glyph} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className={styles.wordmark}>Tessera</span>
        </span>
      </header>
      <div className={styles.fallback}>
        <p className="visually-hidden" role="status">
          Getting your wall ready.
        </p>
        <div className={styles.fallbackView} aria-hidden="true" />
        <div className={styles.fallbackBlock} aria-hidden="true">
          {FIELDS.map((field) => (
            <div key={field} className={styles.fallbackCell}>
              <span className={styles.fallbackLabel}>{field}</span>
              <span className={styles.fallbackBar} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
