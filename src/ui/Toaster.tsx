import { useEffect, useState, useSyncExternalStore } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { dismissToast, getToasts, subscribeToasts, type ToastRecord, type ToastTone } from './toast'
import styles from './Toaster.module.scss'
import { VisuallyHidden } from './VisuallyHidden'

const TONE_ICON: Record<ToastTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warn: TriangleAlert,
  error: CircleAlert,
}

/** Spoken before the message so the tone is not carried by color alone. */
const TONE_PREFIX: Partial<Record<ToastTone, string>> = { warn: 'Warning: ', error: 'Error: ' }

/** Paper slips pinned bottom-right. Mount once; raise them with `toast()`. */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts)
  return (
    <div className={styles.toaster}>
      <ol className={styles.list} aria-live="polite" aria-label="Notifications">
        {toasts.map((record) => (
          <Slip key={record.id} record={record} />
        ))}
      </ol>
    </div>
  )
}

function Slip({ record }: { record: ToastRecord }) {
  const [paused, setPaused] = useState(false)
  const Icon = TONE_ICON[record.tone]
  const prefix = TONE_PREFIX[record.tone]

  // Hover or focus holds the slip; `shownAt` restarts the clock when the same message repeats.
  useEffect(() => {
    if (paused || record.leaving || record.duration <= 0) return
    const timer = window.setTimeout(() => dismissToast(record.id), record.duration)
    return () => window.clearTimeout(timer)
  }, [paused, record.id, record.leaving, record.duration, record.shownAt])

  return (
    <li
      className={styles.slip}
      data-tone={record.tone}
      data-leaving={record.leaving || undefined}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon className={styles.icon} aria-hidden="true" />
      <p className={styles.message}>
        {prefix && <VisuallyHidden>{prefix}</VisuallyHidden>}
        {record.message}
      </p>
      {record.action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            record.action?.onClick()
            dismissToast(record.id)
          }}
        >
          {record.action.label}
        </button>
      )}
      <button type="button" className={styles.close} aria-label="Dismiss" onClick={() => dismissToast(record.id)}>
        <X aria-hidden="true" />
      </button>
    </li>
  )
}
