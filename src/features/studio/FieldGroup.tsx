import type { ReactNode } from 'react'
import { SectionRule } from '@/ui'
import { cx } from '@/ui/cx'
import { stepSectionId } from './stepIds'
import styles from './studio.module.scss'

/** The rule over one part of a step; its words name the group the part sits in. */
export function EdgeRule({ id, children }: { id: string; children: string }) {
  return <SectionRule as="h3" className={styles.edgeRule} label={<span id={id}>{children}</span>} />
}

export interface FieldGroupProps {
  /** Reading order down the column, 1 to 7. */
  step: number
  title: string
  /** What this step currently says, shown at the end of its heading: "120 × 60 cm". */
  now?: ReactNode
  /** One short line under the title, where the title alone leaves a question. */
  hint?: ReactNode
  children: ReactNode
  className?: string
}

/** One of the seven choices. Always open: nothing here folds away, only Advanced does. */
export function FieldGroup({ step, title, now, hint, children, className }: FieldGroupProps) {
  const titleId = `studio-group-${step}`
  return (
    <section id={stepSectionId(step)} className={cx(styles.group, className)} aria-labelledby={titleId}>
      <div className={styles.groupHead}>
        <span className={styles.groupStep} aria-hidden="true">
          {step}
        </span>
        {/* Focusable from script only: the step index hands the keyboard to the step it jumps to. */}
        <h2 id={titleId} className={styles.groupTitle} tabIndex={-1}>
          {title}
        </h2>
        {now !== undefined && <span className={styles.groupNow}>{now}</span>}
      </div>
      {hint && <p className={styles.groupHint}>{hint}</p>}
      <div className={styles.groupBody}>{children}</div>
    </section>
  )
}
