// The studio's preset colors, each a key that recolors the page, then the wheel that reaches every other one.
import { COLOR_PRESETS } from '@/core/colors'
import styles from './ColorStrip.module.scss'

export interface ColorStripProps {
  /** '#RRGGBB' the page shows right now; the matching preset reads as pressed. */
  color: string
  onPick: (hex: string) => void
}

export function ColorStrip({ color, onPick }: ColorStripProps) {
  return (
    <ul className={styles.strip}>
      {COLOR_PRESETS.map((preset) => (
        <li key={preset.hex} className={styles.cell}>
          <button
            type="button"
            className={`${styles.item} ${styles.key}`}
            aria-pressed={preset.hex === color}
            aria-label={`Show the wall in ${preset.name}`}
            onClick={() => onPick(preset.hex)}
          >
            <span className={styles.chip} style={{ background: preset.hex }} aria-hidden="true" />
            <span className={styles.name}>{preset.name}</span>
            <span className={styles.hex}>{preset.hex}</span>
          </button>
        </li>
      ))}
      <li className={`${styles.cell} ${styles.item}`}>
        <span className={`${styles.chip} ${styles.wheel}`} aria-hidden="true" />
        <span className={styles.name}>Any color</span>
        <span className={styles.hint}>Wheel or hex code</span>
      </li>
    </ul>
  )
}
