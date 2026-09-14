import type { ReactNode } from 'react'
import { cx } from './cx'
import styles from './Drawing.module.scss'

export interface SheetFootField {
  /** Field name, e.g. "Designs". */
  label: string
  value: ReactNode
}

export interface SheetFootProps {
  /** What this screen is, in its own words: "Saved designs". */
  title: string
  /** The counts worth closing the screen with. */
  fields?: SheetFootField[]
  className?: string
}

/** The strip that closes a screen: what it is and what it holds. */
export function SheetFoot({ title, fields = [], className }: SheetFootProps) {
  return (
    <div className={cx(styles.sheetFoot, className)}>
      <span className={styles.sheetFootTitle}>{title}</span>
      {fields.map((cell) => (
        <span key={cell.label} className={styles.sheetFootCell}>
          <span className={styles.sheetFootLabel}>{cell.label}</span>
          <span className={styles.sheetFootValue}>{cell.value}</span>
        </span>
      ))}
    </div>
  )
}
