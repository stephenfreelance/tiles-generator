// Ported from React Bits (github.com/DavidHDev/react-bits), component "Folder".
// Copyright (c) 2026 David Haz. MIT + Commons Clause License Condition v1.0: permission is granted to
// use, copy, modify, merge, publish and distribute this software as part of an application, provided
// this notice is kept. Selling, sublicensing or redistributing the components themselves, including as
// a ported version, is not granted.
//
// What changed: the div carrying role="button" is a real <button aria-expanded>, so the fan opens
// from the keyboard and its state is announced; the papers hold the file names the exporter actually
// writes, and the same names sit beside the folder as plain text, so nothing lives only inside an
// animation; sizes are rem instead of a transform: scale over the whole graphic; the body follows the
// tile color through color-mix rather than the original's JS hex arithmetic; and the --magnet-x/y
// mousemove state, which the original tracked and never read on anything but a fine pointer, is gone.
import { useState } from 'react'
import styles from './ZipFolder.module.scss'

export interface ZipFolderProps {
  /** File names, most important first. Only three fit the fan; the rest belong to the list beside it. */
  papers: readonly string[]
  /** The button's own name: what the folder opens to show. */
  label: string
}

const MAX_PAPERS = 3

export function ZipFolder({ papers, label }: ZipFolderProps) {
  const [open, setOpen] = useState(false)
  const shown = papers.slice(0, MAX_PAPERS)

  return (
    <button
      type="button"
      className={styles.folder}
      aria-expanded={open}
      data-open={open || undefined}
      onClick={() => setOpen((was) => !was)}
    >
      {/* Decoration: every name in the fan is plain text beside it, so this is hidden from readers. */}
      <span className={styles.stack} aria-hidden="true">
        {shown.map((name, index) => (
          // Counted down, so the first name lands on the widest sheet, the one the fan draws highest.
          <span key={name} className={styles.paper} data-slot={shown.length - index}>
            {name}
          </span>
        ))}
        <span className={styles.flap} />
        <span className={`${styles.flap} ${styles.right}`} />
      </span>
      <span className={styles.label}>{label}</span>
    </button>
  )
}
