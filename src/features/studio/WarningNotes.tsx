import { TriangleAlert } from 'lucide-react'
import type { DesignConfig, FitWarning, LayoutPlan } from '@/core/types'
import { announce, Button } from '@/ui'
import { fixFor } from './planFixes'
import styles from './studio.module.scss'
import type { DesignUpdate } from './types'
import { plainWarning } from './warningCopy'

export interface WarningNotesProps {
  warnings: readonly FitWarning[]
  config: DesignConfig
  plan: LayoutPlan
  update: DesignUpdate
  /** Pointing at a note tints the piece it is about, in both views. */
  onHighlight: (pieceId: string | null) => void
}

/** What the checker found, in the maker's words, each with the one move that answers it. */
export function WarningNotes({ warnings, config, plan, update, onHighlight }: WarningNotesProps) {
  if (warnings.length === 0) return null

  return (
    <ul className={styles.notes} aria-label="Notes on this layout">
      {warnings.map((warning) => {
        const fix = fixFor(warning, config, plan)
        return (
          <li
            key={`${warning.code}:${warning.pieceId ?? ''}:${warning.message}`}
            className={styles.note}
            onPointerEnter={() => warning.pieceId && onHighlight(warning.pieceId)}
            onPointerLeave={() => warning.pieceId && onHighlight(null)}
          >
            <TriangleAlert className={styles.noteLeader} aria-hidden="true" />
            <span className={styles.noteText}>{plainWarning(warning, config, plan)}</span>
            {fix && (
              <Button
                size="sm"
                variant="secondary"
                className={styles.noteFix}
                onClick={() => {
                  update(fix.apply)
                  announce(fix.done)
                }}
              >
                {fix.label}
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
