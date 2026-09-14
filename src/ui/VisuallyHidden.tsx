import type { ComponentPropsWithRef } from 'react'
import { cx } from './cx'
import styles from './VisuallyHidden.module.scss'

export type VisuallyHiddenProps = ComponentPropsWithRef<'span'>

/** Text for assistive technology only: labels, units spoken in full, status lines. */
export function VisuallyHidden({ className, ...rest }: VisuallyHiddenProps) {
  return <span className={cx(styles.hidden, className)} {...rest} />
}
