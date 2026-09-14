import type { ReactNode } from 'react'
import { CircleQuestionMark } from 'lucide-react'
import { Popover } from 'radix-ui'
import { cx } from './cx'
import styles from './HelpTip.module.scss'

export interface HelpTipProps {
  /** The topic: names the button ("About Bevel") and heads the note. */
  label: string
  /** A sentence or two; say what the setting does to the printed tile. */
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Draws the trigger as the key cap that opens it ("?"), so the shortcut documents itself. */
  cap?: string
  className?: string
}

/** A small drawn "?" that opens a margin note explaining one setting. */
export function HelpTip({ label, children, side = 'top', cap, className }: HelpTipProps) {
  return (
    <Popover.Root>
      <Popover.Trigger className={cx(styles.trigger, cap && styles.cap, className)} aria-label={`About ${label}`}>
        {cap ? <span aria-hidden="true">{cap}</span> : <CircleQuestionMark aria-hidden="true" />}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.content}
          side={side}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          aria-label={label}
        >
          <p className={styles.title}>{label}</p>
          <div className={styles.body}>{children}</div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
