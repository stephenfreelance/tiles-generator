import type { ReactNode } from 'react'
import { cx } from '@/ui/cx'
import styles from './studio.module.scss'

export interface FieldGroupProps {
  /** Reading order down the column, 1 to 5. */
  step: number
  title: string
  /** What this step currently says, shown at the end of its heading: "120 × 60 cm". */
  now?: ReactNode
  /** One short line under the title, where the title alone leaves a question. */
  hint?: ReactNode
  children: ReactNode
  className?: string
}

/** One of the five choices. Always open: nothing here folds away, only Advanced does. */
export function FieldGroup({ step, title, now, hint, children, className }: FieldGroupProps) {
  const titleId = `studio-group-${step}`
  return (
    <section className={cx(styles.group, className)} aria-labelledby={titleId}>
      <div className={styles.groupHead}>
        <span className={styles.groupStep} aria-hidden="true">
          {step}
        </span>
        <h2 id={titleId} className={styles.groupTitle}>
          {title}
        </h2>
        {now !== undefined && <span className={styles.groupNow}>{now}</span>}
      </div>
      {hint && <p className={styles.groupHint}>{hint}</p>}
      <div className={styles.groupBody}>{children}</div>
    </section>
  )
}
