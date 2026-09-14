import type { ComponentPropsWithRef } from 'react'
import { cx } from './cx'
import styles from './Kbd.module.scss'

export type KbdProps = ComponentPropsWithRef<'kbd'>

/** A key cap drawn as a small ruled box with a heavier bottom edge. */
export function Kbd({ className, ...rest }: KbdProps) {
  return <kbd className={cx(styles.kbd, className)} {...rest} />
}
