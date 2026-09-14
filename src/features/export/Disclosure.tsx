// Detail that is needed rarely, named by what it holds so it can be judged without opening.
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import styles from './Disclosure.module.scss'

export interface DisclosureProps {
  /** Says what is inside, in full: "File options: format and detail". */
  label: string
  /** What it holds right now, read while closed: "STL, standard". */
  note?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}

/** A closed-by-default disclosure on a native <details>, so it is keyboard-operable as it stands. */
export function Disclosure({ label, note, defaultOpen = false, children, className }: DisclosureProps) {
  return (
    <details className={className ? `${styles.root} ${className}` : styles.root} open={defaultOpen || undefined}>
      <summary className={styles.summary}>
        <ChevronRight className={styles.chevron} aria-hidden="true" />
        <span className={styles.label}>{label}</span>
        {note && <span className={styles.note}>{note}</span>}
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  )
}
