import type { ComponentPropsWithRef } from 'react'
import { cx } from './cx'
import styles from './Drawing.module.scss'

export interface SheetProps extends ComponentPropsWithRef<'div'> {
  /** Class for the inner surface that holds the children. */
  frameClassName?: string
}

/** The surface a screen is laid out on. */
export function Sheet({ frameClassName, className, children, ...rest }: SheetProps) {
  return (
    <div {...rest} className={cx(styles.sheet, className)}>
      <div className={cx(styles.sheetFrame, frameClassName)}>{children}</div>
    </div>
  )
}
