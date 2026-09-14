import { useState } from 'react'
import { useDesign } from '@/state/designStore'
import styles from './AppShell.module.scss'
import { CopyLinkButton } from './CopyLinkButton'

const MAX_NAME = 80

/** The design's name in the bar, edited in place. Commits on Enter or blur; Escape reverts. */
export function DrawingTitle() {
  const config = useDesign((s) => s.config)
  const name = config.name
  const update = useDesign((s) => s.update)
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    const next = (draft ?? '').trim().slice(0, MAX_NAME)
    setDraft(null)
    // An emptied name keeps the design's current one rather than inventing one.
    if (!next || next === name) return
    update((design) => ({ ...design, name: next }))
  }

  return (
    <span className={styles.drawingTitle}>
      <label className={styles.drawingLabel} htmlFor="design-name">
        Design
      </label>
      <input
        id="design-name"
        className={styles.drawingInput}
        value={draft ?? name}
        size={Math.max(8, Math.min(MAX_NAME, (draft ?? name).length))}
        maxLength={MAX_NAME}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          } else if (event.key === 'Escape' && draft !== null) {
            event.preventDefault()
            event.stopPropagation()
            setDraft(null)
          }
        }}
      />
      <CopyLinkButton config={config} as="icon" className={styles.barTool} />
    </span>
  )
}
