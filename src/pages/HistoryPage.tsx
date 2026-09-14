// Saved designs: everything this browser has kept, newest at the top.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Trash2 } from 'lucide-react'
import { studioIntent } from '@/app/prefetchStudio'
import { RegisterHeader, RegisterRow } from '@/features/history/RegisterRow'
import { useDesign } from '@/state/designStore'
import { useHistory, type HistoryEntry } from '@/state/historyStore'
import { announce, Button, buttonClassName, EmptyState, toast } from '@/ui'
import styles from './HistoryPage.module.scss'

/** Matches MAX_ENTRIES in the history store: how many designs this browser keeps. */
const REGISTER_CAPACITY = 40

const emptyShelfDrawing = (
  <svg viewBox="0 0 132 96" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <rect x="14" y="18" width="104" height="60" rx="12" strokeOpacity="0.8" />
    <rect x="26" y="30" width="30" height="24" rx="6" strokeOpacity="0.45" />
    <path d="M68 34h36M68 44h26" strokeOpacity="0.45" strokeLinecap="round" />
    <path d="M26 64h80" strokeOpacity="0.3" strokeLinecap="round" />
  </svg>
)

export function HistoryPage() {
  const entries = useHistory((state) => state.entries)
  const removeEntry = useHistory((state) => state.remove)
  const renameEntry = useHistory((state) => state.rename)
  const saveEntry = useHistory((state) => state.save)
  const clearRegister = useHistory((state) => state.clear)
  const loadDesign = useDesign((state) => state.load)
  const navigate = useNavigate()
  const [confirmingClear, setConfirmingClear] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const sorted = useMemo(() => [...entries].sort((a, b) => b.updatedAt - a.updatedAt), [entries])
  // An empty list has nothing to confirm, so the challenge folds itself away.
  const confirming = confirmingClear && entries.length > 0

  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
  }, [confirming])

  /** Undo puts the list back exactly as it was, dates and order included. */
  function restore(snapshot: readonly HistoryEntry[]) {
    useHistory.setState({ entries: [...snapshot] })
    announce('Designs restored.')
  }

  function handleDelete(entry: HistoryEntry) {
    const snapshot = useHistory.getState().entries
    removeEntry(entry.id)
    announce(`Deleted ${entry.config.name}.`)
    toast(`Deleted "${entry.config.name}".`, {
      tone: 'info',
      action: { label: 'Undo', onClick: () => restore(snapshot) },
    })
  }

  function handleClear() {
    const snapshot = useHistory.getState().entries
    clearRegister()
    setConfirmingClear(false)
    announce(`Deleted ${snapshot.length} designs.`)
    toast(`Deleted ${snapshot.length} designs.`, {
      tone: 'info',
      action: { label: 'Undo', onClick: () => restore(snapshot) },
    })
  }

  function handleOpen(entry: HistoryEntry) {
    loadDesign(entry.config)
    navigate('/studio')
  }

  function handleFiles(entry: HistoryEntry) {
    loadDesign(entry.config)
    navigate('/download')
  }

  function handleDuplicate(entry: HistoryEntry) {
    const name = `${entry.config.name} copy`.slice(0, 80)
    saveEntry({ ...entry.config, name }, { thumbnail: entry.thumbnail })
    toast(`Copied as "${name}".`, { tone: 'success' })
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Your saved designs</h1>
          <p className={styles.count}>
            {entries.length === 0
              ? `Nothing saved yet. This browser keeps up to ${REGISTER_CAPACITY} designs.`
              : `${entries.length} of ${REGISTER_CAPACITY} designs, kept in this browser only.`}
          </p>
        </div>
        <div className={styles.headActions}>
          {confirming ? (
            <span className={styles.confirm} role="group" aria-label="Confirm deleting every design">
              <span className={styles.confirmText}>Delete all {entries.length}?</span>
              <Button ref={confirmRef} size="sm" variant="danger-quiet" onClick={handleClear}>
                Yes, delete them
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingClear(false)}>
                Keep them
              </Button>
            </span>
          ) : (
            <Button
              size="sm"
              variant="danger-quiet"
              leadingIcon={<Trash2 />}
              disabled={entries.length === 0}
              onClick={() => setConfirmingClear(true)}
            >
              Delete all
            </Button>
          )}
          <Link to="/studio" className={buttonClassName('primary', 'md')} {...studioIntent}>
            Start designing
          </Link>
        </div>
      </header>

      {sorted.length === 0 ? (
        <EmptyState
          illustration={emptyShelfDrawing}
          heading="No saved designs yet"
          action={
            <Link to="/studio" className={buttonClassName('primary', 'lg')} {...studioIntent}>
              Start designing
            </Link>
          }
        >
          Every design you take to the download page is saved here with its picture, so you can open it again, copy it,
          or fetch its files months later.
        </EmptyState>
      ) : (
        <>
          <div className={styles.register}>
            <RegisterHeader />
            <ol className={styles.rows}>
              {sorted.map((entry) => (
                <RegisterRow
                  key={entry.id}
                  entry={entry}
                  onOpen={handleOpen}
                  onFiles={handleFiles}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onRename={(target, name) => renameEntry(target.id, name)}
                />
              ))}
            </ol>
          </div>
          <p className={styles.footnote}>
            Designs live in this browser, never on a server. The oldest one drops out once you pass {REGISTER_CAPACITY}.
          </p>
        </>
      )}
    </div>
  )
}
