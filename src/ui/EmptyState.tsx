import type { ReactNode } from 'react'
import { cx } from './cx'
import styles from './Drawing.module.scss'

export interface EmptyStateProps {
  /** A small line drawing (inline SVG in currentColor). Decorative. */
  illustration?: ReactNode
  heading: string
  /** One or two sentences: why it is empty and what to do. */
  children?: ReactNode
  /** The way out, usually one Button or a Link styled with buttonClassName. */
  action?: ReactNode
  headingLevel?: 2 | 3
  className?: string
}

/** What a view shows before there is anything to draw in it. */
export function EmptyState({ illustration, heading, children, action, headingLevel = 2, className }: EmptyStateProps) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  return (
    <div className={cx(styles.empty, className)}>
      {illustration && (
        <div className={styles.emptyArt} aria-hidden="true">
          {illustration}
        </div>
      )}
      <Heading className={styles.emptyHeading}>{heading}</Heading>
      {children && <div className={styles.emptyText}>{children}</div>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  )
}
