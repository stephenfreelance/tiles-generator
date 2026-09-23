// One ruled line of saved designs: what the design is, and what you can do with it.
import { useMemo, useState } from 'react'
import { Copy, Download, Pencil, Trash2 } from 'lucide-react'
import { colorName } from '@/core/colors'
import { computeLayout, layoutInputOf } from '@/core/layout'
import { textureById } from '@/core/textures/registry'
import { formatLength, formatSize } from '@/core/units'
import type { HistoryEntry } from '@/state/historyStore'
import { Button, VisuallyHidden } from '@/ui'
import styles from './RegisterRow.module.scss'
import { exactWhen, relativeWhen } from './when'

export interface RegisterRowProps {
  entry: HistoryEntry
  onOpen: (entry: HistoryEntry) => void
  onFiles: (entry: HistoryEntry) => void
  onDuplicate: (entry: HistoryEntry) => void
  onDelete: (entry: HistoryEntry) => void
  onRename: (entry: HistoryEntry, name: string) => void
}

/** Column headings, ruled across the list above the first row. */
export function RegisterHeader() {
  return (
    <div className={styles.header} aria-hidden="true">
      <span />
      <span>Design</span>
      <span>Wall</span>
      <span>Tile</span>
      <span>Pattern</span>
      <span>Color</span>
      <span className={styles.numeric}>Tiles</span>
      <span />
    </div>
  )
}

export function RegisterRow({ entry, onOpen, onFiles, onDuplicate, onDelete, onRename }: RegisterRowProps) {
  const { config } = entry
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(config.name)
  // The same input the studio lays out, so the model count here matches the studio's.
  const plan = useMemo(() => computeLayout(layoutInputOf(config)), [config])
  const texture = textureById(config.texture.id)

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== config.name) onRename(entry, trimmed)
    else setDraft(config.name)
  }

  return (
    <li className={styles.row}>
      <div className={styles.thumb}>
        {entry.thumbnail ? (
          <img src={entry.thumbnail} alt="" draggable={false} decoding="async" />
        ) : (
          <span className={styles.thumbEmpty} aria-hidden="true" />
        )}
      </div>

      <div className={styles.drawing}>
        {editing ? (
          <input
            className={styles.rename}
            aria-label="Design name"
            value={draft}
            maxLength={80}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit()
              if (event.key === 'Escape') {
                setDraft(config.name)
                setEditing(false)
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={styles.nameButton}
            aria-label={`Rename ${config.name}`}
            onClick={() => {
              setDraft(config.name)
              setEditing(true)
            }}
          >
            <span className={styles.name}>{config.name}</span>
            <Pencil className={styles.pencil} aria-hidden="true" />
          </button>
        )}
        <p className={styles.meta}>
          <time dateTime={new Date(entry.updatedAt).toISOString()} title={exactWhen(entry.updatedAt)}>
            Saved {relativeWhen(entry.updatedAt)}
          </time>
          <span className={styles.stamp} data-validated={entry.validated || undefined}>
            {entry.validated ? 'Downloaded' : 'Draft'}
          </span>
        </p>
      </div>

      <div className={styles.fact}>
        <span className={styles.factLabel} aria-hidden="true">
          Wall
        </span>
        <span>{formatSize(config.surface.width, config.surface.height, config.surfaceUnit)}</span>
      </div>
      <div className={styles.fact}>
        <span className={styles.factLabel} aria-hidden="true">
          Tile
        </span>
        <span>{formatSize(config.tile.width, config.tile.height)}</span>
      </div>
      <div className={styles.fact}>
        <span className={styles.factLabel} aria-hidden="true">
          Pattern
        </span>
        <span className={styles.factValue}>
          {texture.name}
          <span className={styles.subFact}>{formatLength(config.texture.depth)} deep</span>
        </span>
      </div>
      <div className={styles.fact}>
        <span className={styles.factLabel} aria-hidden="true">
          Color
        </span>
        <span className={styles.factValue}>
          <span className={styles.colorName}>
            <span className={styles.swatch} style={{ background: config.color }} aria-hidden="true" />
            {colorName(config.color)}
          </span>
          <span className={`${styles.subFact} ${styles.hex}`}>{config.color}</span>
        </span>
      </div>
      <div className={`${styles.fact} ${styles.numeric}`}>
        <span className={styles.factLabel} aria-hidden="true">
          Tiles
        </span>
        <span className={styles.factValue}>
          {plan.placements.length}
          <span className={styles.subFact}>
            {plan.pieces.length} {plan.pieces.length === 1 ? 'model' : 'models'}
          </span>
        </span>
      </div>

      <div className={styles.actions}>
        <Button size="sm" onClick={() => onOpen(entry)} aria-label={`Open ${config.name} in the studio`}>
          Open
        </Button>
        <Button
          size="sm"
          leadingIcon={<Download />}
          onClick={() => onFiles(entry)}
          aria-label={`Download files for ${config.name}`}
        >
          Download
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={styles.rowGhost}
          leadingIcon={<Copy />}
          onClick={() => onDuplicate(entry)}
          aria-label={`Duplicate ${config.name}`}
        >
          Duplicate
        </Button>
        <Button
          variant="danger-quiet"
          size="sm"
          leadingIcon={<Trash2 />}
          onClick={() => onDelete(entry)}
          aria-label={`Delete ${config.name}`}
        >
          Delete<VisuallyHidden> {config.name}</VisuallyHidden>
        </Button>
      </div>
    </li>
  )
}
