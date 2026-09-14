import type { ReactNode } from 'react'
import { cx } from './cx'
import styles from './Drawing.module.scss'

export interface SectionRuleProps {
  label: ReactNode
  /** Use a heading level when the rule opens a section of the page outline. */
  as?: 'div' | 'h2' | 'h3' | 'h4'
  /** Content after the line, e.g. a count or a small action. */
  aside?: ReactNode
  className?: string
}

/** A hairline ruled across the sheet with a caps label at its start. */
export function SectionRule({ label, as: Tag = 'div', aside, className }: SectionRuleProps) {
  return (
    <div className={cx(styles.rule, className)}>
      <Tag className={styles.ruleLabel}>{label}</Tag>
      <span className={styles.ruleLine} aria-hidden="true" />
      {aside && <span className={styles.ruleAside}>{aside}</span>}
    </div>
  )
}
