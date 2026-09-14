import type { LengthUnit } from '@/core/types'
import { formatLength } from '@/core/units'
import { cx } from './cx'
import styles from './Drawing.module.scss'

export interface DimensionTextProps {
  /** A single length in mm... */
  mm?: number
  /** ...or a width by height pair in mm. */
  size?: { width: number; height: number }
  unit?: LengthUnit
  /** Heavier figures for the one dimension that matters most in a line. */
  emphasis?: boolean
  className?: string
}

/** A measurement as the drawing writes it: tabular figures, the unit set lighter. */
export function DimensionText({ mm, size, unit = 'mm', emphasis = false, className }: DimensionTextProps) {
  const figures = size
    ? `${formatLength(size.width, unit, false)} × ${formatLength(size.height, unit, false)}`
    : formatLength(mm ?? 0, unit, false)
  return (
    <span className={cx(styles.dimension, emphasis && styles.dimensionStrong, className)}>
      <span className={styles.dimensionValue}>{figures}</span>
      <span className={styles.dimensionUnit}>{unit}</span>
    </span>
  )
}
