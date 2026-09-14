import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Accordion } from 'radix-ui'
import { cx } from './cx'
import styles from './TitleBlock.module.scss'

export interface TitleBlockProps {
  /** The open cell, or null when all are folded. */
  value: string | null
  onValueChange: (value: string | null) => void
  children: ReactNode
  /** The last ruled cell, always open: the place for the red primary action. */
  footer?: ReactNode
  className?: string
}

/** The drawing's title block as the control panel: ruled cells that fold open one at a time. */
export function TitleBlock({ value, onValueChange, children, footer, className }: TitleBlockProps) {
  return (
    <div className={cx(styles.block, className)}>
      <Accordion.Root
        type="single"
        collapsible
        value={value ?? ''}
        onValueChange={(next) => onValueChange(next || null)}
        className={styles.cells}
      >
        {children}
      </Accordion.Root>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  )
}

export interface TitleBlockCellProps {
  /** Id of the cell; the TitleBlock value opens it. */
  value: string
  /** Field name in expanded caps, e.g. "Tile". */
  label: string
  /** What the cell holds, shown while folded: "150 × 150 mm · balanced". */
  summary?: ReactNode
  /** Optional cell reference in the left margin ("1", "A"). */
  mark?: string
  children: ReactNode
  disabled?: boolean
  className?: string
}

/** One ruled cell of the title block. */
export function TitleBlockCell({ value, label, summary, mark, children, disabled, className }: TitleBlockCellProps) {
  return (
    <Accordion.Item value={value} disabled={disabled} className={cx(styles.cell, className)}>
      <Accordion.Header className={styles.header}>
        <Accordion.Trigger className={cx(styles.trigger, mark !== undefined && styles.marked)}>
          {mark !== undefined && (
            <span className={styles.mark} aria-hidden="true">
              {mark}
            </span>
          )}
          <span className={styles.label}>{label}</span>
          <span className={styles.summary}>{summary}</span>
          <ChevronDown className={styles.chevron} aria-hidden="true" />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className={styles.content}>
        <div className={styles.body}>{children}</div>
      </Accordion.Content>
    </Accordion.Item>
  )
}

export interface TitleBlockRowProps {
  label: string
  children: ReactNode
  /** cut: the value is about cut pieces and takes the red pencil. muted: secondary fact. */
  tone?: 'default' | 'cut' | 'muted'
  className?: string
}

/** A label and value pair ruled across a cell ("Full tiles  40"). */
export function TitleBlockRow({ label, children, tone = 'default', className }: TitleBlockRowProps) {
  return (
    <div className={cx(styles.row, className)} data-tone={tone}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue}>{children}</span>
    </div>
  )
}
