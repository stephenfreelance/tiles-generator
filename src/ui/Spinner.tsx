import { cx } from './cx'
import styles from './Spinner.module.scss'
import { VisuallyHidden } from './VisuallyHidden'

export interface SpinnerProps {
  /** Diameter in px. */
  size?: number
  /** Spoken status; without it the spinner is decorative. */
  label?: string
  className?: string
}

/** A pencil stroke drawing itself around a faint construction circle. */
export function Spinner({ size = 16, label, className }: SpinnerProps) {
  return (
    <span className={cx(styles.spinner, className)} role={label ? 'status' : undefined}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={styles.svg}>
        <circle className={styles.construction} cx="12" cy="12" r="9" />
        <circle className={styles.stroke} cx="12" cy="12" r="9" pathLength={100} />
      </svg>
      {label && <VisuallyHidden>{label}</VisuallyHidden>}
    </span>
  )
}
