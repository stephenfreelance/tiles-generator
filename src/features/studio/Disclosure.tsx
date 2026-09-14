import { useId, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cx } from '@/ui/cx'
import styles from './studio.module.scss'

export interface DisclosureProps {
  /** Name it after what is inside: a label with no scent is not worth opening. */
  label: ReactNode
  /** One line spelling out what it holds. */
  description?: ReactNode
  /** Sits at the end of the lid: how many settings have moved, how many pieces there are. */
  badge?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}

/** The one thing on this screen that folds away, and what it holds is written on its lid. */
export function Disclosure({ label, description, badge, defaultOpen = false, children, className }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  return (
    <section className={cx(styles.disclosure, className)}>
      <button
        type="button"
        className={styles.disclosureTrigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
      >
        <ChevronRight className={styles.disclosureChevron} aria-hidden="true" />
        <span className={styles.disclosureText}>
          <span className={styles.disclosureLabel}>{label}</span>
          {description && <span className={styles.disclosureDescription}>{description}</span>}
        </span>
        {badge && <span className={styles.disclosureBadge}>{badge}</span>}
      </button>
      <div id={panelId} className={styles.disclosurePanel} hidden={!open}>
        {children}
      </div>
    </section>
  )
}
