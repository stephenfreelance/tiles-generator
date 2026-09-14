import { Fragment } from 'react'
import type { LayoutPlan } from '@/core/types'
import { cx } from '@/ui/cx'
import { fitSummary } from './fitCopy'
import styles from './studio.module.scss'

/** Splits the sentence around its figures so they can be set in the drawing's own numerals. */
const FIGURES = /(\d[\d,.]*)/

export interface FitSummaryProps {
  plan: LayoutPlan
  className?: string
}

/** The fit in one sentence, figures inked heavier than the words. */
export function FitSummary({ plan, className }: FitSummaryProps) {
  const { sentence } = fitSummary(plan)
  return (
    <p className={cx(styles.summaryText, className)}>
      {sentence.split(FIGURES).map((part, index) =>
        index % 2 === 1 ? (
          <b key={index} className={styles.figure}>
            {part}
          </b>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </p>
  )
}
