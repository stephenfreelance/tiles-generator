// The filament catalog, as published by the manufacturer: colour, line, and the hex it prints in.
import { FILAMENTS } from '@/core/filaments'
import styles from './FilamentStrip.module.scss'

export function FilamentStrip() {
  const shown = FILAMENTS.filter((filament) => filament.popular)

  return (
    <ul className={styles.strip}>
      {shown.map((filament) => (
        <li key={filament.id} className={styles.item}>
          <span className={styles.chip} style={{ background: filament.hex }} aria-hidden="true" />
          <span className={styles.name}>{filament.name}</span>
          <span className={styles.line}>{filament.line}</span>
          <span className={styles.hex}>{filament.hex}</span>
        </li>
      ))}
    </ul>
  )
}
