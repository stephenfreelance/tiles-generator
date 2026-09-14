import { useId, type ReactNode } from 'react'
import { cx, type StyleWithVars } from './cx'
import styles from './ProgressBar.module.scss'

export interface ProgressBarProps {
  /** What is happening, e.g. "Writing files". */
  label: string
  /** 0..1, or null while the amount of work is unknown (hatching slides instead). */
  value: number | null
  /** A second line such as "Piece C of 5: right edge". */
  detail?: ReactNode
  className?: string
}

/** A labelled progress bar with its percentage; animated hatch while indeterminate. */
export function ProgressBar({ label, value, detail, className }: ProgressBarProps) {
  const labelId = `${useId()}-progress`
  const indeterminate = value === null || !Number.isFinite(value)
  const fraction = indeterminate ? 0 : Math.min(1, Math.max(0, value))
  const percent = Math.round(fraction * 100)
  const fill: StyleWithVars = { '--progress': fraction }

  return (
    <div className={cx(styles.root, className)}>
      <div className={styles.head}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        {!indeterminate && (
          <span className={styles.percent} aria-hidden="true">
            {percent}%
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : percent}
        className={styles.track}
        data-indeterminate={indeterminate || undefined}
      >
        <div className={styles.fill} style={fill} />
      </div>
      {detail && <p className={styles.detail}>{detail}</p>}
    </div>
  )
}
