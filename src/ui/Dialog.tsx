import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Dialog as RadixDialog } from 'radix-ui'
import { cx } from './cx'
import styles from './Dialog.module.scss'

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Heading in the slip's own title bar. */
  title: string
  /** One line under the title; it also describes the dialog to assistive technology. */
  description: string
  children: ReactNode
  className?: string
}

/** A larger sheet laid over the drawing: opened for a catalogue, closed by Escape or the cross. */
export function Dialog({ open, onOpenChange, title, description, children, className }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content className={cx(styles.content, className)}>
          <div className={styles.head}>
            <span className={styles.headText}>
              <RadixDialog.Title className={styles.title}>{title}</RadixDialog.Title>
              <RadixDialog.Description className={styles.description}>{description}</RadixDialog.Description>
            </span>
            <RadixDialog.Close className={styles.close} aria-label="Close">
              <X aria-hidden="true" />
            </RadixDialog.Close>
          </div>
          <div className={styles.body}>{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
