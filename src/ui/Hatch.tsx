import type { ComponentPropsWithRef } from 'react'
import { cx } from './cx'
import styles from './Drawing.module.scss'

export interface HatchProps extends ComponentPropsWithRef<'div'> {
  /** red: cuts and partial tiles. ink: everything else that needs a fill. */
  tone?: 'red' | 'ink'
  /** Outline the hatched area in its own color, as a section is drawn. */
  framed?: boolean
}

/** A section-hatched area, the world's only fill texture. */
export function Hatch({ tone = 'red', framed = false, className, ...rest }: HatchProps) {
  return (
    <div
      {...rest}
      className={cx(styles.hatch, tone === 'red' ? styles.hatchRed : styles.hatchInk, framed && styles.hatchFramed, className)}
    />
  )
}
